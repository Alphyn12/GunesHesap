"""
Merkezi rate limit konfigürasyonu — Solar Rota Backend

Her endpoint için varsayılan limitler aşağıda tanımlıdır.
RATE_LIMIT_<ENDPOINT> env var'larıyla override edilebilir:

  RATE_LIMIT_PV_CALCULATE=10/minute
  RATE_LIMIT_PVGIS_PROXY=5/minute

Test ortamında tüm limitleri devre dışı bırakmak için:
  RATE_LIMIT_DISABLED=true

IP tespiti: varsayılan olarak REMOTE_ADDR kullanılır.
Reverse proxy arkasındaysa FORWARDED_ALLOW_IPS ve
Limiter(headers_enabled=True) ayarını etkinleştirin.
"""
from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# ── Varsayılan limitler ───────────────────────────────────────────────────────
_DEFAULTS: dict[str, str] = {
    "pv_calculate":   "10/minute",
    "pvlib_calculate": "10/minute",
    "financial":      "20/minute",
    "pvgis_proxy":    "5/minute",
    "field_import":   "5/minute",
    "panel_thermal":  "30/minute",
}

# Tüm limitleri test/geliştirme için etkisiz hale getiren yüksek değer
_DISABLED_LIMIT = "99999/minute"

_disabled = os.getenv("RATE_LIMIT_DISABLED", "").lower() in ("1", "true", "yes")


def _resolve(key: str) -> str:
    if _disabled:
        return _DISABLED_LIMIT
    return os.getenv(f"RATE_LIMIT_{key.upper()}", _DEFAULTS[key])


LIMITS: dict[str, str] = {k: _resolve(k) for k in _DEFAULTS}

limiter = Limiter(key_func=get_remote_address)
