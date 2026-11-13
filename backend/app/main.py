"""API FastAPI de MediSphere AI.

Lancement :  uvicorn app.main:app --reload --port 8000
Documentation interactive : http://localhost:8000/docs
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .service import MediSphereService, ServiceError

BASE = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = Path(os.environ.get("MEDISPHERE_KNOWLEDGE", BASE / "knowledge"))
DB_PATH = Path(os.environ.get("MEDISPHERE_DB", BASE / "data" / "cases.db"))
FRONTEND_DIST = BASE.parent / "frontend" / "dist"

service = MediSphereService(KNOWLEDGE_DIR, DB_PATH)

app = FastAPI(
    title="MediSphere AI — API du système expert",
    description="Système expert de triage pédagogique : moteur d'inférence explicable. Ne constitue pas un outil de diagnostic.",
    version="2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


# ------------------------------------------------------------------ modèles
class InferRequest(BaseModel):
    facts: Dict[str, Any] = Field(default_factory=dict)
    closed_world: bool = False


class WhatIfRequest(BaseModel):
    base_facts: Dict[str, Any] = Field(default_factory=dict)
    changes: Dict[str, Any] = Field(default_factory=dict)
    closed_world: bool = False


class RuleTestRequest(BaseModel):
    rule: Dict[str, Any]
    facts: Dict[str, Any] = Field(default_factory=dict)
    closed_world: bool = False


class ToggleRequest(BaseModel):
    enabled: bool


class CaseRequest(BaseModel):
    name: str = "Cas sans nom"
    facts: Dict[str, Any] = Field(default_factory=dict)
    closed_world: bool = False
    notes: str = ""


class ScenarioRequest(BaseModel):
    name: str
    description: str = ""
    facts: Dict[str, Any]
    closed_world: bool = True
    expected_level: Optional[str] = None
    expected_rules: list = Field(default_factory=list)


# ---------------------------------------------------------------- routes
@app.get("/api/meta")
def meta():
    return service.meta()


@app.get("/api/facts")
def facts():
    return service.facts()


@app.post("/api/infer")
def infer(body: InferRequest):
    return service.infer(body.facts, body.closed_world)


@app.post("/api/whatif")
def what_if(body: WhatIfRequest):
    return service.what_if(body.base_facts, body.changes, body.closed_world)


@app.get("/api/rules")
def list_rules():
    return service.list_rules()


@app.get("/api/rules/{rule_id}")
def get_rule(rule_id: str):
    return service.get_rule(rule_id)


@app.post("/api/rules", status_code=201)
def create_rule(rule: Dict[str, Any]):
    return service.create_rule(rule)


@app.put("/api/rules/{rule_id}")
def update_rule(rule_id: str, rule: Dict[str, Any]):
    return service.update_rule(rule_id, rule)


@app.patch("/api/rules/{rule_id}/toggle")
def toggle_rule(rule_id: str, body: ToggleRequest):
    return service.toggle_rule(rule_id, body.enabled)


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: str):
    return service.delete_rule(rule_id)


@app.post("/api/rules/validate")
def validate_rule(rule: Dict[str, Any], is_new: bool = False):
    return service.validate_rule(rule, is_new)


@app.post("/api/rules/test")
def test_rule(body: RuleTestRequest):
    return service.test_rule(body.rule, body.facts, body.closed_world)


@app.get("/api/graph")
def graph():
    return service.graph()


@app.get("/api/quality")
def quality():
    return service.quality()


@app.get("/api/versions")
def versions():
    return service.history()


@app.post("/api/versions/{version}/restore")
def restore(version: str):
    return service.restore(version)


@app.get("/api/scenarios")
def scenarios():
    return service.scenarios()


@app.post("/api/scenarios", status_code=201)
def add_scenario(body: ScenarioRequest):
    data = body.model_dump()
    if data["expected_level"] is None:
        data.pop("expected_level")
    return service.add_scenario(data)


@app.get("/api/cases")
def list_cases():
    return service.list_cases()


@app.get("/api/cases/{case_id}")
def get_case(case_id: int):
    return service.get_case(case_id)


@app.post("/api/cases", status_code=201)
def add_case(body: CaseRequest):
    return service.add_case(body.name, body.facts, body.closed_world, body.notes)


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: int):
    return service.delete_case(case_id)


@app.get("/api/stats")
def stats():
    return service.stats()


# ------------------------------------------- interface compilée (optionnel)
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = FRONTEND_DIST / path
        if path and file.is_file():
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
