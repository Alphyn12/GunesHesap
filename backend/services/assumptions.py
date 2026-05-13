from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict


_ROOT = Path(__file__).resolve().parents[2]
_ASSUMPTIONS_DIR = _ROOT / "shared" / "assumptions"


@lru_cache(maxsize=1)
def load_cost_assumptions() -> Dict[str, Any]:
    with (_ASSUMPTIONS_DIR / "cost-assumptions-tr-2026-q2.json").open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_financial_assumptions() -> Dict[str, Any]:
    with (_ASSUMPTIONS_DIR / "financial-assumptions-tr-2026-q2.json").open("r", encoding="utf-8") as f:
        return json.load(f)
