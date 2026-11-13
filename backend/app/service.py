"""Couche service : toute la logique métier de l'API, indépendante de FastAPI.

Les tests unitaires appellent directement ce module ; main.py ne fait que
l'exposer en HTTP.
"""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Dict, List, Optional

from .engine import CATEGORIES, LEVELS, InferenceEngine, KnowledgeBase, knowledge_graph, quality_report
from .engine import conditions as C
from .storage import CaseStore


class ServiceError(Exception):
    def __init__(self, status: int, detail: Any):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


class MediSphereService:
    def __init__(self, knowledge_dir: Path, db_path: Path):
        self.kb = KnowledgeBase(knowledge_dir)
        self.kb.ensure_initial_snapshot()
        self.engine = InferenceEngine(self.kb)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.cases = CaseStore(db_path)

    # ---------------------------------------------------------------- méta
    def meta(self) -> Dict[str, Any]:
        return {
            "app": "MediSphere AI — Expert Triage & Clinical Reasoning",
            "kb_version": self.kb.version,
            "updated_at": self.kb.updated_at,
            "disclaimer": self.kb.disclaimer,
            "levels": LEVELS,
            "categories": CATEGORIES,
            "regions": self.kb.regions,
        }

    def facts(self) -> Dict[str, Any]:
        derived = [
            {"id": r["target"], "label": r["title"], "rule": r["id"], "mode": r.get("mode", "definition")}
            for r in self.kb.rules if r["kind"] == "derive" and r["target"] not in self.kb.facts
        ]
        return {"regions": self.kb.regions, "facts": list(self.kb.facts.values()), "derived": derived}

    # ----------------------------------------------------------- inférence
    def infer(self, facts: Dict[str, Any], closed_world: bool = False) -> Dict[str, Any]:
        return self.engine.infer(facts, closed_world)

    def what_if(self, base: Dict[str, Any], changes: Dict[str, Any], closed_world: bool = False) -> Dict[str, Any]:
        return self.engine.what_if(base, changes, closed_world)

    # --------------------------------------------------------------- règles
    def _enrich(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        r = copy.deepcopy(rule)
        r["condition_text"] = C.to_text(rule["condition"], self.kb.labels())
        r["regions"] = self.kb.rule_regions(rule)
        r["facts"] = sorted(C.facts_in(rule["condition"]))
        return r

    def list_rules(self) -> List[Dict[str, Any]]:
        return [self._enrich(r) for r in self.kb.rules]

    def get_rule(self, rule_id: str) -> Dict[str, Any]:
        r = self.kb.get_rule(rule_id)
        if not r:
            raise ServiceError(404, f"Règle {rule_id} introuvable")
        return self._enrich(r)

    def validate_rule(self, rule: Dict[str, Any], is_new: bool = False) -> Dict[str, Any]:
        errors = self.kb.validate_rule(rule, is_new=is_new)
        text = None
        if not errors:
            text = C.to_text(rule["condition"], self.kb.labels())
        return {"valid": not errors, "errors": errors, "condition_text": text}

    def create_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return self._enrich(self.kb.add_rule(rule))
        except ValueError as e:
            raise ServiceError(422, e.args[0])

    def update_rule(self, rule_id: str, rule: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return self._enrich(self.kb.update_rule(rule_id, rule))
        except KeyError:
            raise ServiceError(404, f"Règle {rule_id} introuvable")
        except ValueError as e:
            raise ServiceError(422, e.args[0])

    def toggle_rule(self, rule_id: str, enabled: bool) -> Dict[str, Any]:
        try:
            return self._enrich(self.kb.set_enabled(rule_id, enabled))
        except KeyError:
            raise ServiceError(404, f"Règle {rule_id} introuvable")

    def delete_rule(self, rule_id: str) -> Dict[str, Any]:
        try:
            self.kb.delete_rule(rule_id)
        except KeyError:
            raise ServiceError(404, f"Règle {rule_id} introuvable")
        return {"deleted": rule_id, "kb_version": self.kb.version}

    def test_rule(self, rule: Dict[str, Any], facts: Dict[str, Any], closed_world: bool = False) -> Dict[str, Any]:
        errors = C.validate(rule.get("condition"), self.kb.all_fact_ids)
        if errors:
            raise ServiceError(422, errors)
        return self.engine.test_rule(rule, facts, closed_world)

    # ---------------------------------------------------- analyse / qualité
    def graph(self) -> Dict[str, Any]:
        return knowledge_graph(self.kb)

    def quality(self) -> Dict[str, Any]:
        return quality_report(self.kb, self.engine)

    def history(self) -> List[Dict[str, Any]]:
        return self.kb.history()

    def restore(self, version: str) -> Dict[str, Any]:
        try:
            self.kb.restore(version)
        except KeyError:
            raise ServiceError(404, f"Version {version} introuvable")
        return {"restored": version, "kb_version": self.kb.version}

    # ------------------------------------------------------------ scénarios
    def scenarios(self) -> List[Dict[str, Any]]:
        return self.kb.scenarios

    def add_scenario(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
        if not scenario.get("name") or not isinstance(scenario.get("facts"), dict):
            raise ServiceError(422, "Un scénario doit avoir un nom et des faits")
        if "expected_level" not in scenario:
            res = self.engine.infer(scenario["facts"], scenario.get("closed_world", True))
            scenario["expected_level"] = res["level"]
            scenario.setdefault("expected_rules", [res["decisive_rule"]] if res["decisive_rule"] else [])
        scenario.setdefault("closed_world", True)
        scenario.setdefault("expected_rules", [])
        return self.kb.add_scenario(scenario)

    # ------------------------------------------------------------------ cas
    def list_cases(self) -> List[Dict[str, Any]]:
        return self.cases.list()

    def get_case(self, case_id: int) -> Dict[str, Any]:
        case = self.cases.get(case_id)
        if not case:
            raise ServiceError(404, f"Cas {case_id} introuvable")
        return case

    def add_case(self, name: str, facts: Dict[str, Any], closed_world: bool, notes: str = "") -> Dict[str, Any]:
        result = self.engine.infer(facts, closed_world)
        return self.cases.add(name or "Cas sans nom", facts, closed_world, result, notes)

    def delete_case(self, case_id: int) -> Dict[str, Any]:
        if not self.cases.delete(case_id):
            raise ServiceError(404, f"Cas {case_id} introuvable")
        return {"deleted": case_id}

    # ------------------------------------------------------------ dashboard
    def stats(self) -> Dict[str, Any]:
        q = self.quality()
        return {
            "kb_version": self.kb.version,
            "updated_at": self.kb.updated_at,
            "total_rules": q["total_rules"],
            "enabled_rules": q["enabled_rules"],
            "by_category": q["by_category"],
            "by_level": q["by_level"],
            "tests_passed": q["tests_passed"],
            "tests_total": q["tests_total"],
            "coverage": q["coverage"]["ratio"],
            "facts": len(self.kb.facts),
            "derived_facts": len(self.kb.derived_fact_ids),
            "cases_total": self.cases.count(),
            "cases_by_level": self.cases.level_distribution(),
            "recent_cases": self.cases.list(6),
        }
