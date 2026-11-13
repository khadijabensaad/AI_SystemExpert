"""Historique des cas pédagogiques (SQLite, bibliothèque standard)."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class CaseStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.Lock()
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS cases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    name TEXT NOT NULL,
                    notes TEXT DEFAULT '',
                    facts TEXT NOT NULL,
                    closed_world INTEGER NOT NULL DEFAULT 0,
                    level TEXT,
                    label TEXT,
                    decisive_rule TEXT,
                    fired TEXT,
                    kb_version TEXT
                )"""
            )

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            with conn:  # commit / rollback
                yield conn
        finally:
            conn.close()

    @staticmethod
    def _row(r: sqlite3.Row) -> Dict[str, Any]:
        d = dict(r)
        d["facts"] = json.loads(d["facts"])
        d["fired"] = json.loads(d["fired"] or "[]")
        d["closed_world"] = bool(d["closed_world"])
        return d

    def add(self, name: str, facts: Dict[str, Any], closed_world: bool, result: Dict[str, Any], notes: str = "") -> Dict[str, Any]:
        with self._lock, self._conn() as c:
            cur = c.execute(
                "INSERT INTO cases (created_at, name, notes, facts, closed_world, level, label, decisive_rule, fired, kb_version)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (datetime.now().isoformat(timespec="seconds"), name, notes, json.dumps(facts, ensure_ascii=False),
                 int(closed_world), result["level"], result["label"], result["decisive_rule"],
                 json.dumps(result["fired"]), result["kb_version"]),
            )
            new_id = cur.lastrowid
        return self.get(new_id)  # type: ignore[arg-type]

    def get(self, case_id: int) -> Optional[Dict[str, Any]]:
        with self._conn() as c:
            r = c.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
            return self._row(r) if r else None

    def list(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._conn() as c:
            return [self._row(r) for r in c.execute("SELECT * FROM cases ORDER BY id DESC LIMIT ?", (limit,))]

    def delete(self, case_id: int) -> bool:
        with self._lock, self._conn() as c:
            return c.execute("DELETE FROM cases WHERE id = ?", (case_id,)).rowcount > 0

    def count(self) -> int:
        with self._conn() as c:
            return c.execute("SELECT COUNT(*) FROM cases").fetchone()[0]

    def level_distribution(self) -> Dict[str, int]:
        with self._conn() as c:
            return {(r[0] or "NONE"): r[1] for r in c.execute("SELECT level, COUNT(*) FROM cases GROUP BY level")}
