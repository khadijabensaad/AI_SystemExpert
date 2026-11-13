"""Tests du moteur et de la couche service.  Lancer : python -m unittest discover -s tests -v"""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.service import MediSphereService, ServiceError  # noqa: E402


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "knowledge", self.tmp / "knowledge", ignore=shutil.ignore_patterns("history"))
        self.svc = MediSphereService(self.tmp / "knowledge", self.tmp / "cases.db")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- scénarios de référence -------------------------------------------
    def test_all_scenarios_pass(self):
        q = self.svc.quality()
        failed = [s for s in q["scenarios"] if not s["passed"]]
        self.assertEqual(failed, [], f"Scénarios en échec : {failed}")
        self.assertGreaterEqual(q["coverage"]["ratio"], 0.9)

    # --- comportements clés -----------------------------------------------
    def test_no_symptom_is_not_self_care(self):
        r = self.svc.infer({"age": 30, "temperature": 36.8}, closed_world=True)
        self.assertIsNone(r["level"])
        self.assertFalse(r["conclusive"])

    def test_spo2_unknown_is_not_used(self):
        r = self.svc.infer({"cough": True}, closed_world=True)
        self.assertNotIn("R-EM-02", r["fired"])

    def test_open_world_is_provisional_and_asks_questions(self):
        r = self.svc.infer({"cough": True, "temperature": 38.5})
        self.assertTrue(r["provisional"])
        asked = [q["fact"] for q in r["missing"]]
        self.assertIn("stiff_neck", asked)
        self.assertIn("dyspnea_severe", asked)

    def test_forward_chaining_two_levels(self):
        r = self.svc.infer({"age": 80, "cough": True, "temperature": 38.2}, closed_world=True)
        derived = {d["fact"]: d for d in r["derived"]}
        self.assertTrue(derived["elderly"]["value"])
        self.assertTrue(derived["vulnerable"]["value"])
        self.assertGreater(derived["vulnerable"]["iteration"], derived["elderly"]["iteration"] - 1)

    def test_contradiction_detected_and_corrected(self):
        r = self.svc.infer({"worst_headache": True, "headache": False}, closed_world=True)
        self.assertIn("C-01", [c["id"] for c in r["contradictions"]])
        self.assertEqual(r["level"], "EMERGENCY")

    def test_conflict_resolution_precaution(self):
        r = self.svc.infer({"runny_nose": True, "sneezing": True, "chest_pain": True, "temperature": 37}, closed_world=True)
        self.assertEqual(r["level"], "EMERGENCY")
        self.assertTrue(r["conflicts"])
        self.assertNotIn("Repos, hydratation, lavage du nez.", r["advice"])

    def test_risk_modifier_is_decisive(self):
        r = self.svc.infer({"age": 50, "immunodepressed": True, "temperature": 38.3}, closed_world=True)
        self.assertEqual(r["level"], "URGENT")
        self.assertEqual(r["decisive_rule"], "R-RF-01")

    def test_out_of_range_value_ignored(self):
        r = self.svc.infer({"temperature": 55, "cough": True}, closed_world=True)
        self.assertTrue(any("hors plage" in w["message"] for w in r["warnings"]))

    def test_what_if(self):
        w = self.svc.what_if({"cough": True, "temperature": 38.5}, {"dyspnea_severe": True}, closed_world=True)
        self.assertEqual(w["before"]["level"], "ROUTINE")
        self.assertEqual(w["after"]["level"], "EMERGENCY")
        self.assertIn("R-EM-02", w["newly_fired"])
        self.assertIn("R-R-01", w["no_longer_fired"])

    # --- gestion de la base -----------------------------------------------
    def test_rule_crud_and_versioning(self):
        v0 = self.svc.kb.version
        rule = {"id": "R-T-01", "title": "Test", "kind": "triage", "category": "combination", "level": "ROUTINE",
                "priority": 20, "condition": {"fact": "rash"}, "hypotheses": ["Éruption"], "advice": ["Consulter"]}
        self.svc.create_rule(rule)
        self.assertNotEqual(self.svc.kb.version, v0)
        r = self.svc.infer({"rash": True}, closed_world=True)
        self.assertIn("R-T-01", r["fired"])
        self.svc.toggle_rule("R-T-01", False)
        r = self.svc.infer({"rash": True}, closed_world=True)
        self.assertNotIn("R-T-01", r["fired"])
        self.svc.restore(v0)
        self.assertIsNone(self.svc.kb.get_rule("R-T-01"))

    def test_invalid_rule_rejected(self):
        with self.assertRaises(ServiceError):
            self.svc.create_rule({"id": "X", "title": "x", "kind": "triage", "category": "critical",
                                  "level": "EMERGENCY", "condition": {"fact": "does_not_exist"}})

    def test_cases(self):
        c = self.svc.add_case("Démo", {"chest_pain": True}, True)
        self.assertEqual(c["level"], "EMERGENCY")
        self.assertEqual(self.svc.stats()["cases_total"], 1)

    def test_graph(self):
        g = self.svc.graph()
        ids = {n["id"] for n in g["nodes"]}
        for e in g["edges"]:
            self.assertIn(e["source"], ids)
            self.assertIn(e["target"], ids)


if __name__ == "__main__":
    unittest.main()
