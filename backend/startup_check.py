"""
Startup auth güvenlik kontrolü — Solar Rota Backend

Uygulama başladığında SOLARROTA_API_KEY varlığını ortam bağlamıyla
karşılaştırır ve üç seviyeden birini üretir:

  ok       — key mevcut, ya da yerel geliştirme (bulut sinyali yok)
  warning  — bilinen bir bulut platform sinyali var ama key set edilmemiş
  critical — SOLARROTA_ENV=production açıkça set edilmiş ama key yok
             → apply_startup_check() sys.exit(1) çağırır

Bağlam → seviye eşleşmesi:
  Yerel dev / CI  (sinyal yok, key yok) → ok      (dev-mode, sessiz)
  Bulut sinyali   (PORT vb., key yok)   → warning (log + /health'e yansı)
  SOLARROTA_ENV=production + key yok    → critical (log + sys.exit)
  Key set edilmiş (herhangi ortam)      → ok      (auth aktif)
"""
from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Bilinen bulut platform ortam değişkenleri ve açıklamaları.
# Herhangi biri set edilmişse "cloud" ortamında çalışıyoruz demektir.
_CLOUD_SIGNALS: dict[str, str] = {
    "PORT":                       "generic cloud port binding",
    "RAILWAY_ENVIRONMENT":        "Railway",
    "FLY_APP_NAME":               "Fly.io",
    "RENDER":                     "Render",
    "VERCEL":                     "Vercel",
    "HEROKU_APP_NAME":            "Heroku",
    "K_SERVICE":                  "Google Cloud Run",
    "WEBSITE_INSTANCE_ID":        "Azure App Service",
    "ECS_CONTAINER_METADATA_URI": "AWS ECS",
}


@dataclass
class StartupCheckResult:
    """check_auth_config() tarafından döndürülen değerlendirme sonucu."""

    level: str
    """Önem seviyesi: 'ok' | 'warning' | 'critical'"""

    messages: list[str] = field(default_factory=list)
    """Operatöre gösterilecek log mesajları."""

    cloud_signals: list[str] = field(default_factory=list)
    """Tespit edilen bulut platform adları (boşsa yerel ortam)."""

    auth_mode: str = "dev-mode"
    """Auth durumu: 'key-required' | 'dev-mode'"""


def check_auth_config() -> StartupCheckResult:
    """Ortam değişkenlerini inceleyerek auth yapılandırmasını değerlendirir.

    Üç sonuçtan birini döndürür:
      ok       — güvenli ya da yerel geliştirme
      warning  — bulut sinyali var, key yok
      critical — SOLARROTA_ENV=production + key yok
    """
    api_key = os.getenv("SOLARROTA_API_KEY", "").strip()
    explicit_env = os.getenv("SOLARROTA_ENV", "").strip().lower()

    # Key set edilmişse her ortamda güvenli
    if api_key:
        return StartupCheckResult(
            level="ok",
            auth_mode="key-required",
            messages=["API key yapılandırıldı — kimlik doğrulama aktif."],
        )

    # Key yok — ortamı sınıflandır
    detected_signals = [
        label
        for var, label in _CLOUD_SIGNALS.items()
        if os.getenv(var)
    ]

    # Açık production bildirimi + key yok → kritik, başlatmayı durdur
    if explicit_env == "production":
        return StartupCheckResult(
            level="critical",
            cloud_signals=detected_signals,
            auth_mode="dev-mode",
            messages=[
                "SOLARROTA_ENV=production ayarlı ama SOLARROTA_API_KEY boş.",
                "Tüm /api/* endpoint'leri kimlik doğrulamasız açık olacaktı.",
                "Başlatma iptal edildi. SOLARROTA_API_KEY değerini set edin.",
            ],
        )

    # Bulut sinyali var ama key yok → uyarı, devam et
    if detected_signals:
        signal_str = ", ".join(detected_signals)
        return StartupCheckResult(
            level="warning",
            cloud_signals=detected_signals,
            auth_mode="dev-mode",
            messages=[
                f"Bulut ortamı sinyali algılandı ({signal_str}) "
                f"ancak SOLARROTA_API_KEY set edilmemiş.",
                "Dev-mode aktif: /api/* endpoint'leri kimlik doğrulamasız erişilebilir.",
                "Production deploy için SOLARROTA_API_KEY ve "
                "SOLARROTA_ENV=production değişkenlerini set edin.",
            ],
        )

    # Yerel geliştirme veya CI — beklenen dev-mode
    return StartupCheckResult(
        level="ok",
        auth_mode="dev-mode",
        messages=["Yerel geliştirme modu (dev-mode) — kimlik doğrulama atlanıyor."],
    )


def apply_startup_check(result: StartupCheckResult) -> None:
    """Kontrol sonucunu loglara yazar; critical seviyede sys.exit(1) çağırır.

    Args:
        result: check_auth_config() tarafından döndürülen sonuç.

    Raises:
        SystemExit(1): Yalnızca result.level == 'critical' olduğunda.
    """
    if result.level == "critical":
        for msg in result.messages:
            logger.critical("[startup-check] %s", msg)
        sys.exit(1)

    if result.level == "warning":
        for msg in result.messages:
            logger.warning("[startup-check] %s", msg)
        return

    # ok seviyesi — tek satır info
    if result.messages:
        logger.info("[startup-check] %s", result.messages[0])
