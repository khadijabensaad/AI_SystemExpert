# Mini Système Expert — Triage Médical (Pédagogique)

Système expert de triage médical développé en Python dans le cadre d'un mini-projet IA & Systèmes Experts (ISI Tunis, 2025-2026), en binôme avec Safa Douma.

## Objectif

Ce n'est **pas un outil de diagnostic médical**. L'objectif est pédagogique : illustrer le fonctionnement d'un système expert symbolique (raisonnement SI...ALORS) à travers un cas d'usage concret — orienter un utilisateur selon la gravité probable de sa situation (auto-soins, RDV non urgent, consultation rapide, urgences).

## Architecture

Le système suit l'architecture classique d'un système expert :

- **Base de faits** — dictionnaire Python représentant le cas patient (symptômes, âge, température, SpO2...)
- **Base de règles** — règles `SI condition ALORS conclusion`, chacune avec un identifiant, un niveau d'urgence, des hypothèses, des conseils et une justification (`why`)
- **Moteur d'inférence** — raisonnement en **chaînage avant** : teste toutes les règles, garde celles qui se déclenchent, retient le niveau d'urgence le plus grave
- **Module d'explication** — affiche les règles déclenchées et leur justification, pour une décision transparente

## Stack technique

- **Python**
- **Streamlit** — interface de saisie et d'affichage des résultats

## Structure du code
├── app.py # Interface Streamlit
├── triage_engine.py # Base de règles + moteur d'inférence
└── requirements.txt

## Niveaux de sortie

- 🟢 Conseils généraux / surveillance
- 🟡 RDV médical (non urgent)
- 🟠 Consulter rapidement (< 24–48h)
- 🔴 URGENCES (immédiat)

## Lancer le projet

```powershell
.\.venv\Scripts\Activate.ps1
python -m streamlit run app.py
```

## Limites

Règles simplifiées à visée pédagogique — ne remplace en aucun cas un avis médical professionnel.
