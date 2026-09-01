# triage_engine.py
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Callable, Dict, List, Any
from collections import Counter

Facts = Dict[str, Any]


class UrgencyLevel(IntEnum):
    SELF_CARE = 0        # auto-soins / conseils généraux
    ROUTINE = 1          # RDV normal
    URGENT_24_48H = 2    # médecin < 24-48h
    EMERGENCY = 3        # urgences immédiates


URGENCY_LABELS = {
    UrgencyLevel.SELF_CARE: "🟢 Conseils généraux / surveillance",
    UrgencyLevel.ROUTINE: "🟡 RDV médical (non urgent)",
    UrgencyLevel.URGENT_24_48H: "🟠 Consulter rapidement (< 24–48h)",
    UrgencyLevel.EMERGENCY: "🔴 URGENCES (immédiat)",
}

URGENCY_EXPLANATION = {
    UrgencyLevel.SELF_CARE: "Symptômes plutôt légers. Surveillez l’évolution et consultez si aggravation.",
    UrgencyLevel.ROUTINE: "Une consultation est conseillée, sans urgence immédiate.",
    UrgencyLevel.URGENT_24_48H: "Des signes nécessitent une évaluation médicale rapide (< 24–48h).",
    UrgencyLevel.EMERGENCY: "Présence de signes d’alerte. Recherchez une aide médicale urgente.",
}


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    level: UrgencyLevel
    condition: Callable[[Facts], bool]
    hypotheses: List[str]
    advice: List[str]
    why: str


def _num(x: Any, default: float = 0.0) -> float:
    """Convertit en float sans planter (gère None)."""
    if x is None:
        return default
    try:
        return float(x)
    except Exception:
        return default


def build_rules() -> List[Rule]:
    rules: List[Rule] = []

    # -------------------------
    # URGENCES (red flags)
    # -------------------------
    rules.append(Rule(
        id="R-EM-01",
        title="Douleur thoracique",
        level=UrgencyLevel.EMERGENCY,
        condition=lambda f: bool(f.get("chest_pain")),
        hypotheses=["Problème cardio-respiratoire possible (à évaluer)"],
        advice=["Ne pas ignorer ce symptôme.", "Chercher une aide médicale urgente."],
        why="La douleur thoracique est un signe d’alerte."
    ))

    # ✅ CORRECTION : SpO2 n'est utilisée que si elle est renseignée (pas None / pas absente)
    rules.append(Rule(
        id="R-EM-02",
        title="Essoufflement sévère ou saturation très basse",
        level=UrgencyLevel.EMERGENCY,
        condition=lambda f: bool(f.get("dyspnea_severe")) or (
            f.get("spo2") is not None and _num(f.get("spo2"), 999) < 92
        ),
        hypotheses=["Détresse respiratoire possible (à évaluer)"],
        advice=["Rester assis, respirer calmement si possible.", "Chercher une aide médicale urgente."],
        why="Essoufflement sévère / SpO2 < 92% = drapeau rouge."
    ))

    rules.append(Rule(
        id="R-EM-03",
        title="Déficit neurologique (faiblesse, trouble parole, confusion)",
        level=UrgencyLevel.EMERGENCY,
        condition=lambda f: bool(f.get("neuro_deficit")),
        hypotheses=["Problème neurologique aigu possible (à évaluer)"],
        advice=["Ne pas conduire soi-même.", "Chercher une aide médicale urgente."],
        why="Déficit neurologique = urgence potentielle."
    ))

    rules.append(Rule(
        id="R-EM-04",
        title="Raideur de nuque + fièvre",
        level=UrgencyLevel.EMERGENCY,
        condition=lambda f: bool(f.get("stiff_neck")) and (_num(f.get("temperature"), 0) >= 38.5),
        hypotheses=["Infection sévère possible (à évaluer)"],
        advice=["Chercher une aide médicale urgente."],
        why="Association raideur de nuque + fièvre = signe d’alerte."
    ))

    rules.append(Rule(
        id="R-EM-05",
        title="Céphalée brutale et exceptionnelle",
        level=UrgencyLevel.EMERGENCY,
        condition=lambda f: bool(f.get("worst_headache")),
        hypotheses=["Céphalée grave possible (à évaluer)"],
        advice=["Chercher une aide médicale urgente."],
        why="“Pire mal de tête de la vie” = drapeau rouge."
    ))

    # -------------------------
    # URGENT < 24–48H
    # -------------------------
    rules.append(Rule(
        id="R-U-01",
        title="Fièvre élevée persistante",
        level=UrgencyLevel.URGENT_24_48H,
        condition=lambda f: (_num(f.get("temperature"), 0) >= 39.0) and (_num(f.get("duration_days"), 0) >= 3),
        hypotheses=["Infection probable (à évaluer)"],
        advice=["Hydratation régulière.", "Surveiller température et évolution.", "Consulter rapidement."],
        why="Fièvre ≥ 39°C pendant ≥ 3 jours."
    ))

    rules.append(Rule(
        id="R-U-02",
        title="Vomissements/diarrhée + signes de déshydratation",
        level=UrgencyLevel.URGENT_24_48H,
        condition=lambda f: (bool(f.get("vomiting")) or bool(f.get("diarrhea"))) and bool(f.get("dehydration_signs")),
        hypotheses=["Gastro-entérite / déshydratation (à évaluer)"],
        advice=["Boire par petites quantités fréquentes.", "Consulter rapidement si aggravation."],
        why="Risque de déshydratation."
    ))

    rules.append(Rule(
        id="R-U-03",
        title="Symptômes urinaires + grossesse",
        level=UrgencyLevel.URGENT_24_48H,
        condition=lambda f: bool(f.get("pregnant")) and (bool(f.get("dysuria")) or bool(f.get("urinary_frequency"))),
        hypotheses=["Infection urinaire possible (à évaluer)"],
        advice=["Consulter rapidement."],
        why="Grossesse + symptômes urinaires = évaluation rapide recommandée."
    ))

    rules.append(Rule(
        id="R-U-04",
        title="Fièvre + douleur lombaire (urinaire)",
        level=UrgencyLevel.URGENT_24_48H,
        condition=lambda f: (_num(f.get("temperature"), 0) >= 38.0) and bool(f.get("flank_pain")),
        hypotheses=["Atteinte urinaire haute possible (à évaluer)"],
        advice=["Consulter rapidement."],
        why="Fièvre + douleur lombaire peut nécessiter une prise en charge rapide."
    ))

    # -------------------------
    # RDV ROUTINE (non urgent)
    # -------------------------
    rules.append(Rule(
        id="R-R-01",
        title="Toux + fièvre modérée (sans essoufflement sévère)",
        level=UrgencyLevel.ROUTINE,
        condition=lambda f: bool(f.get("cough")) and (_num(f.get("temperature"), 0) >= 38.0) and not bool(f.get("dyspnea_severe")),
        hypotheses=["Infection respiratoire (à évaluer)"],
        advice=["Repos, hydratation, surveiller.", "Consulter si persistance / aggravation."],
        why="Toux + fièvre modérée sans red flags."
    ))

    rules.append(Rule(
        id="R-R-02",
        title="Brûlures urinaires sans fièvre",
        level=UrgencyLevel.ROUTINE,
        condition=lambda f: bool(f.get("dysuria")) and (_num(f.get("temperature"), 0) < 38.0) and not bool(f.get("flank_pain")),
        hypotheses=["Infection urinaire simple possible (à évaluer)"],
        advice=["Boire régulièrement.", "Consulter pour confirmation si persiste."],
        why="Symptômes urinaires sans fièvre : souvent moins urgent."
    ))

    rules.append(Rule(
        id="R-R-03",
        title="Céphalée sans drapeau rouge",
        level=UrgencyLevel.ROUTINE,
        condition=lambda f: bool(f.get("headache")) and not bool(f.get("worst_headache")) and not bool(f.get("neuro_deficit")),
        hypotheses=["Céphalée tension / migraine possible (à évaluer)"],
        advice=["Sommeil régulier, hydratation, éviter déclencheurs.", "Consulter si nouveau / change / persistant."],
        why="Céphalée sans red flags : souvent non urgent."
    ))

    # -------------------------
    # AUTO-SOINS / CONSEILS
    # -------------------------
    rules.append(Rule(
        id="R-S-01",
        title="Rhume/allergie probable",
        level=UrgencyLevel.SELF_CARE,
        condition=lambda f: bool(f.get("runny_nose")) and bool(f.get("sneezing")) and (_num(f.get("temperature"), 0) < 38.0),
        hypotheses=["Rhume ou allergie (hypothèse générale)"],
        advice=["Repos, hydratation.", "Surveiller l’évolution.", "Consulter si aggravation."],
        why="Nez qui coule + éternuements + pas de fièvre = souvent bénin."
    ))

    return rules


RULES = build_rules()


def infer(facts: Facts) -> Dict[str, Any]:
    fired: List[Rule] = [r for r in RULES if r.condition(facts)]
    level = max((r.level for r in fired), default=UrgencyLevel.SELF_CARE)

    hyp_counter = Counter()
    for r in fired:
        for h in r.hypotheses:
            hyp_counter[h] += 1
    top_hypotheses = (
        [h for h, _ in hyp_counter.most_common(2)]
        if hyp_counter else ["Aucune hypothèse particulière (surveillance)"]
    )

    advice_list: List[str] = []
    seen = set()
    for r in fired:
        for a in r.advice:
            if a not in seen:
                advice_list.append(a)
                seen.add(a)
    if not advice_list:
        advice_list = ["Surveiller l’évolution des symptômes.", "Consulter si aggravation ou doute."]

    return {
        "urgency_level": level,
        "urgency_label": URGENCY_LABELS[level],
        "urgency_explanation": URGENCY_EXPLANATION[level],
        "hypotheses": top_hypotheses,
        "advice": advice_list,
        "fired_rules": fired,
    }
