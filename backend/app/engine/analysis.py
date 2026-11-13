"""Graphe de connaissances et tableau de bord qualité de la base de règles."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

from . import conditions as C
from .inference import InferenceEngine
from .knowledge import CATEGORIES, LEVELS, KnowledgeBase


def knowledge_graph(kb: KnowledgeBase) -> Dict[str, Any]:
    """Graphe en couches : faits → règles de dérivation → faits dérivés → règles → niveaux.

    Le rang de chaque nœud est sa profondeur dans le chaînage ; l'ordre vertical
    est optimisé par l'heuristique du barycentre pour limiter les croisements.
    """
    labels = kb.labels()
    rules = [r for r in kb.rules]
    derive = [r for r in rules if r["kind"] == "derive"]
    other = [r for r in rules if r["kind"] != "derive"]

    referenced = set()
    for r in rules:
        referenced |= C.facts_in(r["condition"])

    rank: Dict[str, int] = {}
    for fid in kb.facts:
        if fid in referenced:
            rank[f"fact:{fid}"] = 0
    # dérivations : itère jusqu'à stabilité
    for _ in range(len(derive) + 2):
        for r in derive:
            inputs = [rank.get(f"fact:{f}", 0) for f in C.facts_in(r["condition"])]
            rr = (max(inputs) if inputs else 0) + 1
            rank[f"rule:{r['id']}"] = rr
            tgt = f"fact:{r['target']}"
            if r["target"] not in kb.facts:
                rank[tgt] = max(rank.get(tgt, 0), rr + 1)
    max_fact_rank = max([v for k, v in rank.items() if k.startswith("fact:")] or [0])
    for r in other:
        rank[f"rule:{r['id']}"] = max_fact_rank + 1
    for lvl in LEVELS:
        rank[f"level:{lvl}"] = max_fact_rank + 2

    nodes: Dict[str, Dict[str, Any]] = {}
    for key, rk in rank.items():
        kind, ident = key.split(":", 1)
        if kind == "fact":
            meta = kb.facts.get(ident)
            nodes[key] = {"id": key, "type": "derived" if meta is None else "fact", "ref": ident,
                          "label": labels.get(ident, ident), "rank": rk,
                          "region": meta["region"] if meta else None, "group": meta["group"] if meta else "derived"}
        elif kind == "rule":
            r = kb.get_rule(ident)
            nodes[key] = {"id": key, "type": "rule", "ref": ident, "label": f"{ident} · {r['title']}", "rank": rk,
                          "kind": r["kind"], "category": r["category"], "level": r.get("level"),
                          "enabled": r.get("enabled", True)}
        else:
            nodes[key] = {"id": key, "type": "level", "ref": ident, "label": LEVELS[ident]["short"], "rank": rk,
                          "color": LEVELS[ident]["color"]}

    edges: List[Dict[str, str]] = []
    for r in rules:
        rk = f"rule:{r['id']}"
        for f in C.facts_in(r["condition"]):
            if f"fact:{f}" in nodes:
                edges.append({"source": f"fact:{f}", "target": rk})
        if r["kind"] == "derive":
            edges.append({"source": rk, "target": f"fact:{r['target']}"})
        elif r["kind"] in ("triage", "fallback"):
            edges.append({"source": rk, "target": f"level:{r['level']}"})
        elif r["kind"] == "modifier":
            mod = r.get("modifier", {})
            edges.append({"source": rk, "target": f"level:{mod.get('level') or mod.get('max', 'URGENT')}"})

    # ordre vertical : faits par région, puis barycentre des prédécesseurs
    region_order = {reg["id"]: i for i, reg in enumerate(kb.regions)}
    group_order = {"context": 0, "vitals": 1, "symptom": 2}
    columns: Dict[int, List[str]] = defaultdict(list)
    for n in nodes.values():
        columns[n["rank"]].append(n["id"])
    columns[0].sort(key=lambda k: (group_order.get(nodes[k]["group"], 3), region_order.get(nodes[k]["region"], 99)))
    level_rank = rank["level:EMERGENCY"]
    columns[level_rank].sort(key=lambda k: -LEVELS[nodes[k]["ref"]]["value"])
    preds: Dict[str, List[str]] = defaultdict(list)
    for e in edges:
        preds[e["target"]].append(e["source"])
    pos: Dict[str, float] = {}
    for rk in sorted(columns):
        col = columns[rk]
        if rk not in (0, level_rank):
            col.sort(key=lambda k: (sum(pos.get(p, 0) for p in preds[k]) / len(preds[k])) if preds[k] else 0)
        for i, k in enumerate(col):
            pos[k] = i / max(len(col) - 1, 1)
    for rk, col in columns.items():
        for i, k in enumerate(col):
            nodes[k]["order"] = i
            nodes[k]["column_size"] = len(col)

    return {"nodes": list(nodes.values()), "edges": edges, "columns": max(columns) + 1}


def quality_report(kb: KnowledgeBase, engine: InferenceEngine) -> Dict[str, Any]:
    labels = kb.labels()
    fire_counts: Counter = Counter()
    scenario_results = []
    conflict_cases = []
    for s in kb.scenarios:
        res = engine.infer(s["facts"], s.get("closed_world", True))
        for rid in res["fired"]:
            fire_counts[rid] += 1
        for d in res["derived"]:
            if d["value"] is True:
                fire_counts[d["rule_id"]] += 1
        expected_rules = s.get("expected_rules", [])
        missing_rules = [r for r in expected_rules if r not in res["fired"]]
        passed = res["level"] == s.get("expected_level") and not missing_rules
        scenario_results.append({
            "id": s["id"], "name": s["name"], "description": s.get("description", ""),
            "expected_level": s.get("expected_level"), "actual_level": res["level"],
            "expected_rules": expected_rules, "missing_rules": missing_rules,
            "decisive_rule": res["decisive_rule"], "provisional": res["provisional"],
            "fired": res["fired"], "passed": passed,
        })
        if res["conflicts"]:
            conflict_cases.append({"scenario": s["id"], "conflicts": res["conflicts"]})

    enabled = [r for r in kb.rules if r.get("enabled", True)]
    never_fired = [
        {"id": r["id"], "title": r["title"], "kind": r["kind"], "category": r["category"]}
        for r in enabled if fire_counts[r["id"]] == 0
    ]

    issues = []
    seen_conditions: Dict[str, str] = {}
    for r in kb.rules:
        errs = kb.validate_rule(r)
        for e in errs:
            issues.append({"rule": r["id"], "severity": "error", "message": e})
        if r["kind"] != "derive":
            key = json.dumps(r["condition"], sort_keys=True)
            if key in seen_conditions:
                issues.append({"rule": r["id"], "severity": "warning",
                               "message": f"Condition identique à {seen_conditions[key]}"})
            seen_conditions.setdefault(key, r["id"])
        if not r.get("enabled", True):
            issues.append({"rule": r["id"], "severity": "info", "message": "Règle désactivée"})
    # règles qui dépendent d'un fait dérivé dont la règle productrice est désactivée
    produced = {r["target"] for r in enabled if r["kind"] == "derive"}
    for r in enabled:
        for f in C.facts_in(r["condition"]):
            if f not in kb.facts and f not in produced:
                issues.append({"rule": r["id"], "severity": "warning",
                               "message": f"Dépend du fait dérivé « {labels.get(f, f)} » qui n'est plus produit (règle désactivée)"})

    by_category = Counter(r["category"] for r in kb.rules)
    by_level = Counter(r.get("level") for r in kb.rules if r.get("level"))
    by_kind = Counter(r["kind"] for r in kb.rules)
    passed = sum(1 for s in scenario_results if s["passed"])
    return {
        "kb_version": kb.version,
        "updated_at": kb.updated_at,
        "total_rules": len(kb.rules),
        "enabled_rules": len(enabled),
        "by_category": [{"id": c, "label": CATEGORIES[c], "count": by_category.get(c, 0)} for c in CATEGORIES],
        "by_level": [{"id": l, "label": LEVELS[l]["short"], "color": LEVELS[l]["color"], "count": by_level.get(l, 0)} for l in LEVELS],
        "by_kind": dict(by_kind),
        "scenarios": scenario_results,
        "tests_passed": passed,
        "tests_total": len(scenario_results),
        "coverage": {
            "fired_counts": {r["id"]: fire_counts[r["id"]] for r in kb.rules},
            "never_fired": never_fired,
            "ratio": round(1 - len(never_fired) / max(len(enabled), 1), 3),
        },
        "conflict_cases": conflict_cases,
        "issues": issues,
        "history": kb.history()[:20],
    }
