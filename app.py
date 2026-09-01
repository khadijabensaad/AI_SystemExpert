# app.py
import streamlit as st
from triage_engine import infer, UrgencyLevel

st.set_page_config(page_title="Mini Système Expert - Triage", page_icon="🩺", layout="wide")

st.title("🩺 Mini Système Expert — Triage médical (pédagogique)")
st.caption("Base de faits + base de règles + moteur d’inférence + explication des règles déclenchées.")

st.warning(
    "⚠️ Outil éducatif : ce n’est pas un diagnostic. "
    "En cas de signes graves ou doute → consultez un professionnel / urgences."
)

# Reset pour éviter que Streamlit garde d'anciennes valeurs
c_reset, _ = st.columns([1, 9])
with c_reset:
    if st.button("🔄 Réinitialiser"):
        st.session_state.clear()
        st.rerun()

st.divider()

with st.form("triage_form"):

    st.subheader("1) Contexte patient")
    c1, c2, c3 = st.columns([1, 1, 2])

    with c1:
        age = st.number_input("Âge", min_value=0, max_value=120, value=22, step=1)
        duration_days = st.number_input("Durée des symptômes (jours)", min_value=0, max_value=60, value=2, step=1)

    with c2:
        pregnant = st.checkbox("Grossesse (si applicable)", value=False)

    with c3:
        factors = st.multiselect(
            "Facteurs (optionnel)",
            ["Immunodéprimé(e)", "Maladie chronique", "Fumeur", "Asthme/COPD"],
            default=[]
        )

    st.subheader("2) Signes vitaux (si connus)")
    v1, v2 = st.columns([2, 1])

    with v1:
        temperature = st.number_input(
            "Température (°C)",
            min_value=34.0, max_value=42.0,
            value=37.2, step=0.1, format="%.1f"
        )

    with v2:
        spo2_known = st.checkbox("Je connais ma saturation (SpO2)", value=False)

        # ✅ Le champ est TOUJOURS visible, mais désactivé si non coché
        spo2 = st.number_input(
            "SpO2 (%)",
            min_value=50, max_value=100,
            value=98, step=1,
            disabled=not spo2_known
        )

    st.subheader("3) Symptômes")
    tab1, tab2, tab3, tab4 = st.tabs(["Respiratoire", "Digestif", "Neurologique", "Urinaire"])

    with tab1:
        cough = st.checkbox("Toux", value=False)
        chest_pain = st.checkbox("Douleur thoracique", value=False)
        dyspnea_severe = st.checkbox("Essoufflement sévère", value=False)
        runny_nose = st.checkbox("Nez qui coule", value=False)
        sneezing = st.checkbox("Éternuements", value=False)

    with tab2:
        vomiting = st.checkbox("Vomissements", value=False)
        diarrhea = st.checkbox("Diarrhée", value=False)
        dehydration_signs = st.checkbox("Signes de déshydratation (soif intense, peu d’urines…)", value=False)

    with tab3:
        headache = st.checkbox("Maux de tête", value=False)
        worst_headache = st.checkbox("Céphalée brutale et exceptionnelle (\"pire de ma vie\")", value=False)
        neuro_deficit = st.checkbox("Déficit neurologique (faiblesse, confusion, parole…)", value=False)
        stiff_neck = st.checkbox("Raideur de nuque", value=False)

    with tab4:
        dysuria = st.checkbox("Brûlures urinaires", value=False)
        urinary_frequency = st.checkbox("Envies fréquentes d’uriner", value=False)
        flank_pain = st.checkbox("Douleur lombaire (flanc)", value=False)

    submitted = st.form_submit_button("✅ Évaluer")

# -------------------------
# INFÉRENCE
# -------------------------
if submitted:
    facts = {
        "age": age,
        "duration_days": duration_days,
        "pregnant": pregnant,
        "temperature": temperature,

        # Respiratoire
        "cough": cough,
        "chest_pain": chest_pain,
        "dyspnea_severe": dyspnea_severe,
        "runny_nose": runny_nose,
        "sneezing": sneezing,

        # Digestif
        "vomiting": vomiting,
        "diarrhea": diarrhea,
        "dehydration_signs": dehydration_signs,

        # Neuro
        "headache": headache,
        "worst_headache": worst_headache,
        "neuro_deficit": neuro_deficit,
        "stiff_neck": stiff_neck,

        # Urinaire
        "dysuria": dysuria,
        "urinary_frequency": urinary_frequency,
        "flank_pain": flank_pain,

        # facteurs (optionnels)
        "immunodepressed": "Immunodéprimé(e)" in factors,
        "chronic": "Maladie chronique" in factors,
        "smoker": "Fumeur" in factors,
        "asthma_copd": "Asthme/COPD" in factors,
    }

    # ✅ IMPORTANT : on ajoute SpO2 seulement si connue
    if spo2_known:
        facts["spo2"] = spo2

    result = infer(facts)
    level = result["urgency_level"]

    st.divider()
    st.subheader("✅ Résultat du système expert")

    if level == UrgencyLevel.EMERGENCY:
        st.error(result["urgency_label"])
    elif level == UrgencyLevel.URGENT_24_48H:
        st.warning(result["urgency_label"])
    elif level == UrgencyLevel.ROUTINE:
        st.info(result["urgency_label"])
    else:
        st.success(result["urgency_label"])

    st.write(result["urgency_explanation"])

    st.markdown("### Hypothèses générales (non-diagnostic)")
    for h in result["hypotheses"]:
        st.write(f"- {h}")

    st.markdown("### Conseils généraux")
    for a in result["advice"]:
        st.write(f"- {a}")

    st.markdown("### Règles déclenchées (explication)")
    fired = result["fired_rules"]
    if not fired:
        st.info("Aucune règle spécifique déclenchée → surveillance / auto-soins.")
    else:
        for r in fired:
            st.markdown(f"**{r.id} — {r.title}**")
            st.caption(f"Pourquoi : {r.why}")

    st.warning("⚠️ Si les symptômes s’aggravent, ou si vous êtes inquiet(e), consultez un professionnel.")

    with st.expander("DEBUG: facts"):
        st.json(facts)
