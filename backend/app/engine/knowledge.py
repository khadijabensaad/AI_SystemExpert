"""Base de connaissances : chargement, validation, sauvegarde versionnée."""
from __future__ import annotations

import copy
import json
import threading
from datetime import datetime
from enum import IntEnum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from . import conditions as C


class Level(IntEnum):
    SELF_CARE = 0
    ROUTINE = 1
    URGENT = 2
    EMERGENCY = 3


LEVELS = {
    "SELF_CARE": {"value": 0, "label": "Conseils généraux / surveillance", "short": "Auto-soins", "color": "#22c55e",
                  "explanation": "Symptômes plutôt légers. Surveillez l'évolution et consultez en cas d'aggravation."},
    "ROUTINE": {"value": 1, "label": "Rendez-vous médical (non urgent)", "short": "RDV médical", "color": "#eab308",
                "explanation": "Une consultation est conseillée, sans urgence immédiate."},
    "URGENT": {"value": 2, "label": "Consulter rapidement (< 24–48 h)", "short": "Rapide", "color": "#f97316",
               "explanation": "Des signes nécessitent une évaluation médicale rapide (< 24–48 h)."},
    "EMERGENCY": {"value": 3, "label": "URGENCES (immédiat)", "short": "Urgence", "color": "#ef4444",
                  "explanation": "Présence de signes d'alerte. Recherchez une aide médicale urgente."},
}

KINDS = {"triage", "derive", "modifier", "fallback"}
CATEGORIES = {
    "critical": "Critiques / drapeaux rouges",
    "risk": "Facteurs de risque",
    "combination": "Combinaisons de symptômes",
    "contextual": "Règles contextuelles",
    "self_care": "Auto-soins",
    "derivation": "Faits dérivés",
}


class KnowledgeBase:
    """Faits + règles + contrôles de cohérence + scénarios, stockés en JSON."""

    def __init__(self, directory: Path):
        self.dir = Path(directory)
        self.history_dir = self.dir / "history"
        self.history_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.reload()

    # ------------------------------------------------------------------ I/O
    def reload(self) -> None:
        facts_doc = json.loads((self.dir / "facts.json").read_text(encoding="utf-8"))
        self.regions: List[Dict[str, Any]] = facts_doc["regions"]
        self.facts: Dict[str, Dict[str, Any]] = {f["id"]: f for f in facts_doc["facts"]}
        rules_doc = json.loads((self.dir / "rules.json").read_text(encoding="utf-8"))
        self.version: str = rules_doc["version"]
        self.updated_at: str = rules_doc.get("updated_at", "")
        self.disclaimer: str = rules_doc.get("disclaimer", "")
        self.consistency: List[Dict[str, Any]] = rules_doc.get("consistency", [])
        self.rules: List[Dict[str, Any]] = rules_doc["rules"]
        scen = self.dir / "scenarios.json"
        self.scenarios: List[Dict[str, Any]] = json.loads(scen.read_text(encoding="utf-8"))["scenarios"] if scen.exists() else []

    def _rules_doc(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "updated_at": self.updated_at,
            "disclaimer": self.disclaimer,
            "consistency": self.consistency,
            "rules": self.rules,
        }

    # ------------------------------------------------------------- helpers
    @property
    def user_fact_ids(self) -> Set[str]:
        return set(self.facts)

    @property
    def derived_fact_ids(self) -> Set[str]:
        return {r["target"] for r in self.rules if r.get("kind") == "derive"} - self.user_fact_ids

    @property
    def all_fact_ids(self) -> Set[str]:
        return self.user_fact_ids | self.derived_fact_ids

    def labels(self) -> Dict[str, str]:
        labels = {fid: f["label"] for fid, f in self.facts.items()}
        for r in self.rules:
            if r.get("kind") == "derive" and r["target"] not in labels:
                labels[r["target"]] = r["title"]
        return labels

    def get_rule(self, rule_id: str) -> Optional[Dict[str, Any]]:
        return next((r for r in self.rules if r["id"] == rule_id), None)

    def rule_regions(self, rule: Dict[str, Any]) -> List[str]:
        """Régions du corps liées à une règle (via ses faits, dérivés compris)."""
        regions: Set[str] = set()
        for fid in self.source_facts(C.facts_in(rule["condition"])):
            f = self.facts.get(fid)
            if f and f.get("group") == "symptom":
                regions.add(f["region"])
        return sorted(regions)

    def source_facts(self, fact_ids: Set[str], _seen: Optional[Set[str]] = None) -> Set[str]:
        """Remonte les faits dérivés jusqu'aux faits saisissables par l'utilisateur."""
        seen = _seen or set()
        out: Set[str] = set()
        for fid in fact_ids:
            if fid in seen:
                continue
            seen.add(fid)
            if fid in self.facts:
                out.add(fid)
            for r in self.rules:
                if r.get("kind") == "derive" and r["target"] == fid and r.get("enabled", True):
                    out |= self.source_facts(C.facts_in(r["condition"]), seen)
        return out

    # ----------------------------------------------------------- validation
    def validate_rule(self, rule: Dict[str, Any], is_new: bool = False) -> List[str]:
        errors: List[str] = []
        for field in ("id", "title", "kind", "category", "condition"):
            if not rule.get(field) and rule.get(field) != 0:
                errors.append(f"Champ obligatoire manquant : {field}")
        if errors:
            return errors
        if is_new and self.get_rule(rule["id"]):
            errors.append(f"L'identifiant {rule['id']} existe déjà")
        kind = rule["kind"]
        if kind not in KINDS:
            errors.append(f"Type de règle inconnu : {kind}")
        if rule["category"] not in CATEGORIES:
            errors.append(f"Catégorie inconnue : {rule['category']}")
        if kind in ("triage", "fallback") and rule.get("level") not in LEVELS:
            errors.append("Niveau de triage invalide (SELF_CARE, ROUTINE, URGENT ou EMERGENCY)")
        if kind == "derive":
            if not rule.get("target"):
                errors.append("Une règle de dérivation doit préciser le fait produit (target)")
            if rule.get("mode", "definition") not in ("definition", "implication"):
                errors.append("Mode de dérivation invalide (definition ou implication)")
        if kind == "modifier":
            mod = rule.get("modifier") or {}
            if mod.get("type") not in ("floor", "escalate"):
                errors.append("Le modificateur doit être de type floor ou escalate")
            if mod.get("type") == "floor" and mod.get("level") not in LEVELS:
                errors.append("Le modificateur floor doit préciser un niveau valide")
            if mod.get("type") == "escalate" and mod.get("max", "URGENT") not in LEVELS:
                errors.append("Le plafond (max) du modificateur escalate est invalide")
        known = self.all_fact_ids | ({rule["target"]} if kind == "derive" and rule.get("target") else set())
        errors += C.validate(rule["condition"], known)
        try:
            int(rule.get("priority", 0))
        except (TypeError, ValueError):
            errors.append("La priorité doit être un entier")
        return errors

    # ----------------------------------------------------------- versioning
    def _bump(self) -> None:
        major, minor, patch = (int(x) for x in self.version.split("."))
        self.version = f"{major}.{minor}.{patch + 1}"
        self.updated_at = datetime.now().isoformat(timespec="seconds")

    def _snapshot(self, message: str) -> None:
        idx = self._history_index()
        doc = self._rules_doc()
        fname = f"rules_{self.version}.json"
        (self.history_dir / fname).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        idx.append({"version": self.version, "date": self.updated_at, "message": message, "file": fname,
                    "rules": len(self.rules)})
        (self.history_dir / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")

    def _history_index(self) -> List[Dict[str, Any]]:
        p = self.history_dir / "index.json"
        if not p.exists():
            return []
        return json.loads(p.read_text(encoding="utf-8"))

    def ensure_initial_snapshot(self) -> None:
        if not self._history_index():
            self._snapshot("Version initiale de la base de connaissances")

    def history(self) -> List[Dict[str, Any]]:
        return list(reversed(self._history_index()))

    def _commit(self, message: str) -> None:
        self._bump()
        (self.dir / "rules.json").write_text(json.dumps(self._rules_doc(), ensure_ascii=False, indent=2), encoding="utf-8")
        self._snapshot(message)

    # --------------------------------------------------------------- CRUD
    def add_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            errors = self.validate_rule(rule, is_new=True)
            if errors:
                raise ValueError(errors)
            rule = copy.deepcopy(rule)
            rule.setdefault("enabled", True)
            rule.setdefault("version", "1.0")
            rule.setdefault("hypotheses", [])
            rule.setdefault("advice", [])
            self.rules.append(rule)
            self._commit(f"Ajout de la règle {rule['id']}")
            return rule

    def update_rule(self, rule_id: str, rule: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            current = self.get_rule(rule_id)
            if not current:
                raise KeyError(rule_id)
            rule = {**copy.deepcopy(rule), "id": rule_id}
            errors = self.validate_rule(rule)
            if errors:
                raise ValueError(errors)
            # incrémente la version propre à la règle
            try:
                maj, mi = (int(x) for x in str(current.get("version", "1.0")).split(".")[:2])
                rule["version"] = f"{maj}.{mi + 1}"
            except ValueError:
                rule["version"] = "1.1"
            self.rules[self.rules.index(current)] = rule
            self._commit(f"Modification de la règle {rule_id}")
            return rule

    def set_enabled(self, rule_id: str, enabled: bool) -> Dict[str, Any]:
        with self._lock:
            rule = self.get_rule(rule_id)
            if not rule:
                raise KeyError(rule_id)
            rule["enabled"] = enabled
            self._commit(f"{'Activation' if enabled else 'Désactivation'} de la règle {rule_id}")
            return rule

    def delete_rule(self, rule_id: str) -> None:
        with self._lock:
            rule = self.get_rule(rule_id)
            if not rule:
                raise KeyError(rule_id)
            self.rules.remove(rule)
            self._commit(f"Suppression de la règle {rule_id}")

    def restore(self, version: str) -> None:
        with self._lock:
            entry = next((h for h in self._history_index() if h["version"] == version), None)
            if not entry:
                raise KeyError(version)
            doc = json.loads((self.history_dir / entry["file"]).read_text(encoding="utf-8"))
            self.consistency = doc.get("consistency", [])
            self.rules = doc["rules"]
            self._commit(f"Restauration de la version {version}")

    # ----------------------------------------------------------- scénarios
    def add_scenario(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            existing = {s["id"] for s in self.scenarios}
            n = len(self.scenarios) + 1
            while f"S-{n:02d}" in existing:
                n += 1
            scenario = {**scenario, "id": scenario.get("id") or f"S-{n:02d}"}
            self.scenarios.append(scenario)
            (self.dir / "scenarios.json").write_text(
                json.dumps({"scenarios": self.scenarios}, ensure_ascii=False, indent=2), encoding="utf-8")
            return scenario
