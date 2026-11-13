"""Moteur d'inférence MediSphere — chaînage avant explicable.

Pipeline :
  1. Validation des faits (types, plages, faits inconnus, monde clos optionnel)
  2. Contrôles de cohérence (réponses contradictoires)
  3. Dérivation de faits par chaînage avant jusqu'au point fixe
  4. Évaluation des règles de triage en logique à trois valeurs
  5. Agrégation + résolution des conflits (principe de précaution)
  6. Modificateurs liés aux facteurs de risque (plancher / escalade)
  7. Conclusion, règle déterminante, faits manquants, trace complète
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from . import conditions as C
from .knowledge import LEVELS, KnowledgeBase, Level

MAX_ITERATIONS = 10


def _lvl(name: Optional[str]) -> Optional[Level]:
    return Level[name] if name else None


def _coerce(meta: Dict[str, Any], raw: Any) -> Tuple[Any, Optional[str]]:
    """Convertit une valeur brute selon le schéma. Renvoie (valeur, avertissement)."""
    if raw is None or raw == "":
        return None, None
    if meta["type"] == "bool":
        if isinstance(raw, bool):
            return raw, None
        if isinstance(raw, (int, float)) and raw in (0, 1):
            return bool(raw), None
        if isinstance(raw, str) and raw.lower() in ("true", "oui", "yes", "1", "false", "non", "no", "0"):
            return raw.lower() in ("true", "oui", "yes", "1"), None
        return None, f"{meta['label']} : valeur « {raw} » non reconnue (oui/non attendu), ignorée"
    if meta["type"] == "number":
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return None, f"{meta['label']} : « {raw} » n'est pas un nombre, valeur ignorée"
        lo, hi = meta.get("min"), meta.get("max")
        if (lo is not None and value < lo) or (hi is not None and value > hi):
            return None, f"{meta['label']} : {raw} {meta.get('unit', '')} hors plage plausible [{lo}–{hi}], valeur ignorée"
        return value, None
    return raw, None


class InferenceEngine:
    def __init__(self, kb: KnowledgeBase):
        self.kb = kb

    # ------------------------------------------------------------------
    def infer(self, facts: Dict[str, Any], closed_world: bool = False) -> Dict[str, Any]:
        kb = self.kb
        labels = kb.labels()
        trace: List[Dict[str, Any]] = []

        def log(phase: str, message: str, **extra: Any) -> None:
            trace.append({"step": len(trace) + 1, "phase": phase, "message": message, **extra})

        # 1. Validation --------------------------------------------------
        wm: Dict[str, Any] = {}
        provenance: Dict[str, str] = {}
        warnings: List[Dict[str, str]] = []
        for key, raw in (facts or {}).items():
            meta = kb.facts.get(key)
            if meta is None:
                warnings.append({"severity": "info", "message": f"Fait inconnu « {key} » ignoré"})
                continue
            value, warn = _coerce(meta, raw)
            if warn:
                warnings.append({"severity": "warning", "message": warn})
            if value is not None:
                wm[key] = value
                provenance[key] = "user"
        log("validation", f"{len(wm)} fait(s) valide(s) reçu(s) en entrée.",
            facts=sorted(wm))
        for w in warnings:
            log("validation", w["message"], severity=w["severity"])

        if closed_world:
            assumed = [fid for fid, m in kb.facts.items() if m["type"] == "bool" and fid not in wm]
            for fid in assumed:
                wm[fid] = False
                provenance[fid] = "assumed"
            log("validation", f"Hypothèse du monde clos : {len(assumed)} fait(s) booléen(s) non renseigné(s) supposé(s) absent(s).")

        # 2. Cohérence ---------------------------------------------------
        contradictions: List[Dict[str, Any]] = []
        for check in kb.consistency:
            result, _ = C.evaluate(check["condition"], {k: v for k, v in wm.items() if provenance.get(k) == "user"})
            if result is True:
                contradictions.append({"id": check["id"], "severity": check.get("severity", "warning"),
                                       "message": check["message"]})
                log("coherence", check["message"], rule_id=check["id"], severity=check.get("severity", "warning"))
        if not contradictions:
            log("coherence", "Aucune incohérence détectée dans les réponses.")

        # 3. Dérivation (chaînage avant jusqu'au point fixe) -------------
        derive_rules = sorted([r for r in kb.rules if r.get("kind") == "derive" and r.get("enabled", True)],
                              key=lambda r: -int(r.get("priority", 0)))
        derived: List[Dict[str, Any]] = []
        iteration = 0
        changed = True
        while changed and iteration < MAX_ITERATIONS:
            changed = False
            iteration += 1
            for rule in derive_rules:
                target = rule["target"]
                result, _ = C.evaluate(rule["condition"], wm)
                mode = rule.get("mode", "definition")
                if mode == "definition":
                    if result is not None and wm.get(target) is None:
                        wm[target] = result
                        provenance[target] = rule["id"]
                        derived.append({"fact": target, "value": result, "rule_id": rule["id"], "iteration": iteration})
                        log("derivation", f"{rule['id']} : « {labels.get(target, target)} » = {'vrai' if result else 'faux'}",
                            rule_id=rule["id"], fact=target, value=result, iteration=iteration)
                        changed = True
                else:  # implication : n'affirme que le vrai
                    if result is True and wm.get(target) is not True:
                        previous = wm.get(target)
                        wm[target] = True
                        provenance[target] = rule["id"]
                        derived.append({"fact": target, "value": True, "rule_id": rule["id"], "iteration": iteration})
                        msg = f"{rule['id']} : « {labels.get(target, target)} » = vrai"
                        if previous is False:
                            msg += " (corrige une réponse « non » contradictoire)"
                        log("derivation", msg, rule_id=rule["id"], fact=target, value=True, iteration=iteration)
                        changed = True
        log("derivation", f"Point fixe atteint après {iteration} itération(s) : {len(derived)} fait(s) dérivé(s).",
            iteration=iteration)

        # 4. Évaluation des règles ---------------------------------------
        evaluated: List[Dict[str, Any]] = []
        for rule in kb.rules:
            entry = {
                "id": rule["id"], "title": rule["title"], "kind": rule["kind"], "category": rule["category"],
                "level": rule.get("level"), "priority": int(rule.get("priority", 0)),
                "modifier": rule.get("modifier"), "target": rule.get("target"),
                "hypotheses": rule.get("hypotheses", []), "advice": rule.get("advice", []),
                "why": rule.get("explanation", ""), "condition_text": C.to_text(rule["condition"], labels),
                "regions": kb.rule_regions(rule), "source": rule.get("source", ""), "version": rule.get("version", ""),
            }
            if not rule.get("enabled", True):
                entry.update(status="disabled", result=None, explanation=None, unknown_facts=[])
            else:
                result, expl = C.evaluate(rule["condition"], wm)
                status = {True: "fired", False: "not_fired", None: "undetermined"}[result]
                entry.update(status=status, result=result, explanation=expl,
                             unknown_facts=sorted(C.relevant_unknowns(expl)),
                             evidence=C.positive_evidence(expl))
            evaluated.append(entry)

        by_kind = lambda k, s: [e for e in evaluated if e["kind"] == k and e["status"] == s]  # noqa: E731
        fired_triage = sorted(by_kind("triage", "fired"), key=lambda e: (-Level[e["level"]], -e["priority"]))
        for e in fired_triage:
            log("evaluation", f"{e['id']} déclenchée — {e['title']} → {LEVELS[e['level']]['short']}",
                rule_id=e["id"], level=e["level"])
        log("evaluation",
            f"{len(fired_triage)} règle(s) de triage déclenchée(s), "
            f"{len(by_kind('triage', 'undetermined'))} indéterminée(s), {len(by_kind('triage', 'not_fired'))} non déclenchée(s).")

        # 5. Agrégation et conflits --------------------------------------
        conflicts: List[Dict[str, Any]] = []
        base: Optional[Level] = None
        base_rule: Optional[Dict[str, Any]] = None
        if fired_triage:
            base_rule = fired_triage[0]
            base = Level[base_rule["level"]]
            for e in fired_triage[1:]:
                if base - Level[e["level"]] >= 2:
                    conflicts.append({
                        "rules": [base_rule["id"], e["id"]],
                        "message": f"{e['id']} ({LEVELS[e['level']]['short']}) s'oppose à {base_rule['id']} "
                                   f"({LEVELS[base_rule['level']]['short']}) : le principe de précaution retient le niveau le plus grave.",
                        "resolution": base_rule["id"],
                    })
            for c in conflicts:
                log("conflits", c["message"], rule_id=c["resolution"])
            log("conflits", f"Agrégation : niveau de base = {LEVELS[base.name]['short']} (règle {base_rule['id']}, priorité {base_rule['priority']}).",
                rule_id=base_rule["id"], level=base.name)
            for e in by_kind("fallback", "fired"):
                e["status"] = "superseded"
        else:
            fallbacks = sorted(by_kind("fallback", "fired"), key=lambda e: -e["priority"])
            if fallbacks:
                base_rule = fallbacks[0]
                base = Level[base_rule["level"]]
                log("conflits", f"Aucune règle de triage déclenchée : règle de repli {base_rule['id']} → {LEVELS[base.name]['short']}.",
                    rule_id=base_rule["id"], level=base.name)
            else:
                log("conflits", "Aucune règle déclenchée et aucun symptôme établi : pas de niveau de base.")

        # 6. Modificateurs (facteurs de risque) --------------------------
        # Indépendants de l'ordre : chaque escalade part du niveau de base,
        # puis le niveau final est le maximum des candidats.
        modifiers_applied: List[Dict[str, Any]] = []
        candidates: List[Tuple[Level, Dict[str, Any]]] = []
        for e in sorted(by_kind("modifier", "fired"), key=lambda e: -e["priority"]):
            mod = e["modifier"]
            if mod["type"] == "floor":
                target = Level[mod["level"]]
                effect = target if base is None else max(base, target)
            else:
                if base is None:
                    log("modificateurs", f"{e['id']} déclenchée mais sans niveau de base à augmenter.", rule_id=e["id"])
                    modifiers_applied.append({"rule_id": e["id"], "effect": None, "changed": False})
                    continue
                cap = Level[mod.get("max", "URGENT")]
                effect = max(base, min(Level(min(base + int(mod.get("steps", 1)), Level.EMERGENCY)), cap))
            changed_level = base is None or effect > base
            modifiers_applied.append({"rule_id": e["id"], "effect": effect.name, "changed": changed_level})
            candidates.append((effect, e))
            log("modificateurs",
                f"{e['id']} — {e['title']} : "
                + (f"niveau porté à {LEVELS[effect.name]['short']}" if changed_level else "aucun effet (niveau déjà suffisant)"),
                rule_id=e["id"], level=effect.name)
        if not candidates:
            log("modificateurs", "Aucun facteur de risque ne modifie le niveau.")

        final = base
        decisive = base_rule
        decisive_reason = None
        for effect, e in candidates:
            if final is None or effect > final:
                final, decisive = effect, e
        if decisive is not None:
            if decisive["kind"] == "modifier":
                decisive_reason = (f"Le facteur de risque {decisive['id']} élève le niveau de "
                                   f"{LEVELS[base.name]['short'] if base is not None else '—'} à {LEVELS[final.name]['short']}.")
            elif decisive["kind"] == "fallback":
                decisive_reason = "Aucune règle spécifique : la règle de repli évite une conclusion rassurante par défaut."
            else:
                decisive_reason = (f"Règle la plus grave déclenchée (niveau {LEVELS[final.name]['short']}, "
                                   f"priorité {decisive['priority']}).")

        # 7. Faits manquants + caractère provisoire -----------------------
        def potential(e: Dict[str, Any]) -> Optional[Level]:
            if e["kind"] in ("triage", "fallback"):
                return Level[e["level"]]
            if e["kind"] == "modifier":
                mod = e["modifier"]
                if mod["type"] == "floor":
                    return Level[mod["level"]]
                if base is not None:
                    return min(Level(min(base + int(mod.get("steps", 1)), Level.EMERGENCY)), Level[mod.get("max", "URGENT")])
            return None

        open_rules = []
        for e in evaluated:
            if e["status"] != "undetermined" or e["kind"] == "derive":
                continue
            if e["kind"] == "fallback" and fired_triage:
                continue
            pot = potential(e)
            if pot is not None and (final is None or pot > final):
                open_rules.append((pot, e))
        provisional = bool(open_rules)

        # Score d'utilité d'une question : gravité potentielle de la règle,
        # bonus si la règle est déjà partiellement satisfaite, divisé par le
        # nombre de faits encore inconnus pour la trancher.
        questions: Dict[str, Dict[str, Any]] = {}
        for pot, e in sorted(open_rules, key=lambda x: (-x[0], -x[1]["priority"])):
            unknown_sources = [f for f in sorted(kb.source_facts(set(e["unknown_facts"]))) if wm.get(f) is None]
            if not unknown_sources:
                continue
            weight = (int(pot) + 1) * (3 if e.get("evidence") else 1) / len(unknown_sources)
            for fid in unknown_sources:
                meta = kb.facts[fid]
                q = questions.setdefault(fid, {
                    "fact": fid, "label": meta["label"], "question": meta["question"], "type": meta["type"],
                    "unit": meta.get("unit"), "region": meta["region"], "group": meta["group"],
                    "impact_level": pot.name, "rules": [], "score": 0.0,
                })
                q["score"] = round(q["score"] + weight, 2)
                if e["id"] not in q["rules"]:
                    q["rules"].append(e["id"])
                if pot > Level[q["impact_level"]]:
                    q["impact_level"] = pot.name
        missing = sorted(questions.values(), key=lambda q: (-q["score"], -Level[q["impact_level"]]))
        if provisional:
            worst = max(p for p, _ in open_rules)
            log("manquants", f"Conclusion provisoire : {len(open_rules)} règle(s) pourraient conduire jusqu'à "
                             f"« {LEVELS[worst.name]['short']} » si des informations manquantes étaient confirmées.",
                level=worst.name)
            for q in missing[:5]:
                log("manquants", f"Question utile : {q['question']} (règles {', '.join(q['rules'])})", fact=q["fact"])

        # 8. Conclusion ---------------------------------------------------
        contributing = fired_triage + [e for _, e in candidates]
        if not fired_triage and decisive is not None and decisive["kind"] == "fallback":
            contributing = [decisive] + [e for _, e in candidates]
        hypotheses: List[str] = []
        for e in sorted(contributing, key=lambda e: (-(Level[e["level"]] if e.get("level") else 0), -e["priority"])):
            for h in e["hypotheses"]:
                if h not in hypotheses:
                    hypotheses.append(h)
        advice: List[str] = []
        for e in contributing:
            lvl = e.get("level")
            if e["kind"] == "modifier" or lvl is None or final is None or Level[lvl] == final:
                for a in e["advice"]:
                    if a not in advice:
                        advice.append(a)

        if final is None:
            level_name = None
            label = "Données insuffisantes"
            explanation = ("Aucun symptôme n'est établi : le système ne peut pas conclure. "
                           "L'absence de règle déclenchée ne signifie pas que la situation est bénigne.")
            advice = advice or ["Renseignez les symptômes présents pour obtenir une orientation.",
                                "En cas de doute ou d'aggravation, consultez un professionnel de santé."]
            hypotheses = hypotheses or ["Aucune hypothèse (informations insuffisantes)"]
            log("conclusion", "Conclusion : données insuffisantes, aucun niveau attribué.")
        else:
            level_name = final.name
            label = LEVELS[level_name]["label"]
            explanation = LEVELS[level_name]["explanation"]
            log("conclusion",
                f"Niveau final : {LEVELS[level_name]['short']} — règle déterminante {decisive['id']}."
                + (" Conclusion provisoire." if provisional else ""),
                rule_id=decisive["id"], level=level_name)

        working_memory = []
        for fid, value in wm.items():
            working_memory.append({
                "fact": fid, "label": labels.get(fid, fid), "value": value,
                "source": provenance.get(fid, "user"),
                "derived": fid not in kb.facts,
            })

        counts = {s: sum(1 for e in evaluated if e["kind"] != "derive" and e["status"] == s)
                  for s in ("fired", "not_fired", "undetermined", "superseded", "disabled")}

        return {
            "kb_version": kb.version,
            "closed_world": closed_world,
            "level": level_name,
            "level_value": None if final is None else int(final),
            "label": label,
            "explanation": explanation,
            "conclusive": final is not None,
            "provisional": provisional,
            "decisive_rule": decisive["id"] if decisive else None,
            "decisive_reason": decisive_reason,
            "base_level": base.name if base is not None else None,
            "hypotheses": hypotheses[:4],
            "advice": advice,
            "warnings": warnings,
            "contradictions": contradictions,
            "conflicts": conflicts,
            "derived": derived,
            "modifiers": modifiers_applied,
            "missing": missing,
            "rules": evaluated,
            "fired": [e["id"] for e in evaluated if e["status"] == "fired" and e["kind"] != "derive"],
            "counts": counts,
            "working_memory": working_memory,
            "trace": trace,
        }

    # ------------------------------------------------------------------
    def test_rule(self, rule: Dict[str, Any], facts: Dict[str, Any], closed_world: bool = False) -> Dict[str, Any]:
        """Évalue une règle (même non enregistrée) sur la mémoire de travail d'un cas."""
        base = self.infer(facts, closed_world)
        wm = {f["fact"]: f["value"] for f in base["working_memory"]}
        result, expl = C.evaluate(rule["condition"], wm)
        return {
            "status": {True: "fired", False: "not_fired", None: "undetermined"}[result],
            "explanation": expl,
            "unknown_facts": sorted(C.relevant_unknowns(expl)),
            "condition_text": C.to_text(rule["condition"], self.kb.labels()),
        }

    def what_if(self, base_facts: Dict[str, Any], changes: Dict[str, Any], closed_world: bool = False) -> Dict[str, Any]:
        """Compare un cas avant / après modification de certains faits."""
        after_facts = dict(base_facts)
        for k, v in changes.items():
            if v is None:
                after_facts.pop(k, None)
            else:
                after_facts[k] = v
        before = self.infer(base_facts, closed_world)
        after = self.infer(after_facts, closed_world)
        status_before = {e["id"]: e["status"] for e in before["rules"]}
        status_after = {e["id"]: e["status"] for e in after["rules"]}
        titles = {e["id"]: e["title"] for e in after["rules"]}
        changed_rules = [
            {"id": rid, "title": titles.get(rid, rid), "before": status_before.get(rid), "after": status_after.get(rid)}
            for rid in status_after if status_before.get(rid) != status_after[rid]
        ]
        delta = None
        if before["level_value"] is not None and after["level_value"] is not None:
            delta = after["level_value"] - before["level_value"]
        return {
            "before": before,
            "after": after,
            "after_facts": after_facts,
            "changed_rules": changed_rules,
            "newly_fired": [r["id"] for r in changed_rules if r["after"] == "fired"],
            "no_longer_fired": [r["id"] for r in changed_rules if r["before"] == "fired"],
            "level_changed": before["level"] != after["level"],
            "level_delta": delta,
        }
