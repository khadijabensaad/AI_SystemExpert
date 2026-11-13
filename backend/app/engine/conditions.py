"""Langage de conditions des règles + évaluation en logique à trois valeurs.

Une condition est un arbre JSON :
    {"fact": "chest_pain"}                          -> le fait booléen est vrai
    {"fact": "temperature", "op": ">=", "value": 38} -> comparaison
    {"known": "spo2"}                                -> le fait est renseigné
    {"all": [...]} / {"any": [...]} / {"not": {...}}

Chaque nœud s'évalue à True, False ou None (= inconnu). La logique de Kleene
permet au moteur de distinguer une règle « non déclenchée » d'une règle
« indéterminée faute d'information » et d'en déduire les questions à poser.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

Tri = Optional[bool]  # True / False / None (inconnu)

OPS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "in": lambda a, b: a in b,
}

OP_TEXT = {"==": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤", "in": "∈"}


def _and(values: Iterable[Tri]) -> Tri:
    values = list(values)
    if any(v is False for v in values):
        return False
    if any(v is None for v in values):
        return None
    return True


def _or(values: Iterable[Tri]) -> Tri:
    values = list(values)
    if any(v is True for v in values):
        return True
    if any(v is None for v in values):
        return None
    return False


def evaluate(node: Dict[str, Any], facts: Dict[str, Any]) -> Tuple[Tri, Dict[str, Any]]:
    """Évalue une condition et renvoie (résultat, arbre d'explication).

    Tous les enfants sont évalués (pas de court-circuit) pour que l'explication
    montre chaque fait, même quand le résultat est déjà connu.
    """
    if "all" in node or "any" in node:
        key = "all" if "all" in node else "any"
        children = [evaluate(c, facts) for c in node[key]]
        result = (_and if key == "all" else _or)(r for r, _ in children)
        return result, {"type": key, "result": result, "children": [e for _, e in children]}

    if "not" in node:
        r, e = evaluate(node["not"], facts)
        result = None if r is None else (not r)
        return result, {"type": "not", "result": result, "children": [e]}

    if "known" in node:
        fact = node["known"]
        actual = facts.get(fact)
        result = actual is not None
        return result, {"type": "known", "fact": fact, "actual": actual, "result": result}

    if "fact" in node:
        fact = node["fact"]
        actual = facts.get(fact)
        op = node.get("op")
        if actual is None:
            result: Tri = None
        elif op is None:
            result = bool(actual)
        else:
            try:
                result = bool(OPS[op](actual, node.get("value")))
            except TypeError:
                result = None
        leaf = {"type": "leaf", "fact": fact, "actual": actual, "result": result}
        if op is not None:
            leaf["op"] = op
            leaf["value"] = node.get("value")
        return result, leaf

    raise ValueError(f"Nœud de condition invalide : {node!r}")


def facts_in(node: Dict[str, Any]) -> Set[str]:
    """Ensemble des faits référencés par une condition."""
    if "all" in node:
        return set().union(*[facts_in(c) for c in node["all"]]) if node["all"] else set()
    if "any" in node:
        return set().union(*[facts_in(c) for c in node["any"]]) if node["any"] else set()
    if "not" in node:
        return facts_in(node["not"])
    if "known" in node:
        return {node["known"]}
    if "fact" in node:
        return {node["fact"]}
    return set()


def unknown_leaves(explanation: Dict[str, Any]) -> Set[str]:
    """Faits inconnus qui rendent une condition indéterminée."""
    if explanation["type"] in ("leaf",):
        return {explanation["fact"]} if explanation["result"] is None else set()
    out: Set[str] = set()
    for c in explanation.get("children", []):
        out |= unknown_leaves(c)
    return out


def relevant_unknowns(explanation: Dict[str, Any]) -> Set[str]:
    """Faits inconnus dont la valeur peut encore changer le résultat.

    Un sous-arbre déjà déterminé (ex. un OU déjà vrai) n'a plus besoin d'être
    complété : on ne remonte que les inconnues réellement décisives.
    """
    if explanation["result"] is not None:
        return set()
    if explanation["type"] == "leaf":
        return {explanation["fact"]}
    out: Set[str] = set()
    for c in explanation.get("children", []):
        out |= relevant_unknowns(c)
    return out


def positive_evidence(explanation: Dict[str, Any], negated: bool = False) -> int:
    """Nombre de faits présents (vrais) qui vont dans le sens de la règle."""
    t = explanation["type"]
    if t == "leaf":
        return 1 if (explanation["result"] is True and not negated) else 0
    if t == "known":
        return 0
    return sum(positive_evidence(c, negated ^ (t == "not")) for c in explanation.get("children", []))


def validate(node: Any, known_facts: Set[str], path: str = "condition") -> List[str]:
    """Vérifie la structure d'une condition. Renvoie la liste des erreurs."""
    errors: List[str] = []
    if not isinstance(node, dict):
        return [f"{path} : un objet JSON est attendu"]
    keys = {"all", "any", "not", "known", "fact"} & set(node)
    if len(keys) != 1:
        return [f"{path} : il faut exactement une des clés all / any / not / known / fact"]
    key = keys.pop()
    if key in ("all", "any"):
        if not isinstance(node[key], list) or not node[key]:
            errors.append(f"{path}.{key} : une liste non vide est attendue")
        else:
            for i, c in enumerate(node[key]):
                errors += validate(c, known_facts, f"{path}.{key}[{i}]")
    elif key == "not":
        errors += validate(node["not"], known_facts, f"{path}.not")
    else:
        fact = node[key]
        if fact not in known_facts:
            errors.append(f"{path} : fait inconnu « {fact} »")
        op = node.get("op")
        if key == "fact" and op is not None:
            if op not in OPS:
                errors.append(f"{path} : opérateur inconnu « {op} »")
            if "value" not in node:
                errors.append(f"{path} : « value » manquant pour l'opérateur {op}")
    return errors


def to_text(node: Dict[str, Any], labels: Dict[str, str]) -> str:
    """Rend une condition lisible : « Température ≥ 38 ET Raideur de nuque »."""
    if "all" in node or "any" in node:
        key = "all" if "all" in node else "any"
        sep = " ET " if key == "all" else " OU "
        parts = [to_text(c, labels) for c in node[key]]
        text = sep.join(parts)
        return f"({text})" if len(parts) > 1 else text
    if "not" in node:
        return f"NON {to_text(node['not'], labels)}"
    if "known" in node:
        return f"{labels.get(node['known'], node['known'])} renseigné(e)"
    label = labels.get(node["fact"], node["fact"])
    op = node.get("op")
    if op is None:
        return label
    value = node.get("value")
    if isinstance(value, bool):
        value = "oui" if value else "non"
    return f"{label} {OP_TEXT.get(op, op)} {value}"
