"""
Stateless API Key Authentication — Solar Rota Backend
======================================================
Tasarım:
  • SOLARROTA_API_KEY ortam değişkeni boşsa → dev-mode, auth atlanır.
    Bu sayede mevcut testler değiştirilmeden çalışmaya devam eder.
  • Key dolu ise iki kontrol yapılır:
      1. timing-safe compare (hmac.compare_digest) — timing attack koruması
      2. Timestamp replay window (varsayılan 30 s) — eski key tekrarı engellenir

Kullanım (routes.py):
    from backend.auth import verify_api_key
    @router.post("/api/pv/calculate", dependencies=[Depends(verify_api_key)])
    def endpoint(...): ...
"""
from __future__ import annotations

import hmac
import os
import time

from fastapi import Header, HTTPException, status

# .env veya ortam değişkeninden okunur.
# Boş/tanımlı değilse → dev-mode (localhost geliştirme), auth atlanır.
_API_KEY: str = os.getenv("SOLARROTA_API_KEY", "").strip()

# Replay saldırısına karşı kabul edilen azami zaman farkı (ms)
_REPLAY_WINDOW_MS: int = int(os.getenv("SOLARROTA_REPLAY_WINDOW_MS", "30000"))


def is_dev_mode() -> bool:
    """API key tanımlanmamışsa (dev-mode) True döndürür."""
    return not _API_KEY


def verify_api_key(
    x_api_key: str = Header(default="", alias="X-Api-Key"),
    x_timestamp: str = Header(default="", alias="X-Timestamp"),
) -> None:
    """FastAPI Depends() bağımlılığı olarak kullanılır.

    SOLARROTA_API_KEY tanımlı değilse (dev-mode) sessizce geçer.
    Tanımlıysa:
      • Geçersiz key → HTTP 401
      • Eksik / süresi dolmuş timestamp → HTTP 401
    """
    if not _API_KEY:
        # Dev-mode: key tanımlanmamış → auth atlanır.
        # Testler ve localhost geliştirme bu yoldan geçer.
        return

    # 1. API key doğrulama — timing-safe (side-channel koruması)
    if not hmac.compare_digest(x_api_key, _API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # 2. Timestamp replay koruması
    try:
        ts_ms = int(x_timestamp)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Timestamp header (Unix milliseconds required)",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    now_ms = int(time.time() * 1000)
    if abs(now_ms - ts_ms) > _REPLAY_WINDOW_MS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                f"Request timestamp expired "
                f"(delta={abs(now_ms - ts_ms)}ms, window={_REPLAY_WINDOW_MS}ms)"
            ),
            headers={"WWW-Authenticate": "ApiKey"},
        )
