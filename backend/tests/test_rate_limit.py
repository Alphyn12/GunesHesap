"""
Rate limiting davranış testleri — Solar Rota Backend

Her endpoint için:
  - Limit altında kalan istekler 429 almaz
  - Limit aşıldığında 429 + Retry-After header döner
  - /health hiçbir zaman rate limit'e takılmaz

Testler conftest.py'deki autouse fixture ile her çalışmadan önce
limiter sayaçlarını sıfırlar.
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.rate_limit import LIMITS, limiter

client = TestClient(app)


# ── Yardımcı: örnek istek gövdeleri ─────────────────────────────────────────

def _pv_body():
    return {
        "schema": "GH-PV-ENGINE-CONTRACT-2026.04-v1",
        "requestedEngine": "python-backend",
        "scenario": {"key": "on-grid", "label": "On-Grid", "proposalTone": "commercial-grid"},
        "site": {"lat": 39.9334, "lon": 32.8597, "cityName": "Ankara", "ghi": 1620, "timezone": "Europe/Istanbul"},
        "roof": {"areaM2": 80, "tiltDeg": 33, "azimuthDeg": 180, "azimuthName": "Güney", "shadingPct": 10, "soilingPct": 3},
        "system": {
            "panelType": "mono", "panelWattPeak": 430,
            "panelAreaM2": 1.134 * 1.762, "panelTempCoeffPerC": -0.0034,
            "panelDegradationRate": 0.0045, "panelFirstYearDegradationRate": 0.02,
            "bifacialGain": 0, "inverterType": "string", "inverterEfficiency": 0.97,
            "cableLossPct": 0, "wiringMismatchPct": 0,
            "batteryEnabled": False, "netMeteringEnabled": True,
        },
        "load": {"dailyConsumptionKwh": 30, "monthlyConsumptionKwh": None, "hourlyConsumption8760": None},
        "tariff": {
            "tariffType": "commercial", "tariffRegime": "auto",
            "importRateTryKwh": 8.44, "exportRateTryKwh": 2.0,
            "annualPriceIncrease": 0.12, "discountRate": 0.18,
            "sourceCheckedAt": "2026-04-14",
        },
        "governance": {"quoteInputsVerified": True, "hasSignedCustomerBillData": True, "evidence": {}},
    }


def _thermal_body():
    return {
        "vocStcV": 49.5, "vocCoeffPctPerC": -0.27,
        "vmpStcV": 41.2, "vmpCoeffPctPerC": -0.34,
        "pmaxStcW": 430, "pmaxCoeffPctPerC": -0.34,
        "inverterMaxInputV": 800, "inverterMpptOptimalV": 600,
    }


# ── /health — limit yok ──────────────────────────────────────────────────────

def test_health_is_never_rate_limited():
    """50 ardışık /health isteği 429 döndürmemeli."""
    for _ in range(50):
        r = client.get("/health")
        assert r.status_code == 200, f"Beklenmeyen durum: {r.status_code}"


# ── /api/pv/calculate ────────────────────────────────────────────────────────

def test_pv_calculate_allows_requests_under_limit():
    """`pv_calculate` limiti bitmeden önceki istekler 200 döner."""
    limit_str = LIMITS["pv_calculate"]           # örn. "10/minute"
    max_allowed = int(limit_str.split("/")[0])
    for i in range(max_allowed):
        r = client.post("/api/pv/calculate", json=_pv_body())
        assert r.status_code != 429, f"İstek {i+1} beklenmedik şekilde 429 döndü"


def test_pv_calculate_blocks_when_limit_exceeded():
    """Limit aşılınca 429 + JSON body + Retry-After header döner."""
    limit_str = LIMITS["pv_calculate"]
    max_allowed = int(limit_str.split("/")[0])
    for _ in range(max_allowed):
        client.post("/api/pv/calculate", json=_pv_body())

    r = client.post("/api/pv/calculate", json=_pv_body())
    assert r.status_code == 429
    body = r.json()
    assert body["error"] == "rate_limited"
    assert "detail" in body
    assert "Retry-After" in r.headers


# ── /api/pvgis-proxy ─────────────────────────────────────────────────────────

def test_pvgis_proxy_blocks_after_limit():
    """`pvgis_proxy` limiti aşılınca 429 döner."""
    limit_str = LIMITS["pvgis_proxy"]
    max_allowed = int(limit_str.split("/")[0])
    base = "?lat=39.9&lon=32.8&peakpower=10&angle=30&aspect=0"
    for _ in range(max_allowed):
        client.get(f"/api/pvgis-proxy{base}")

    r = client.get(f"/api/pvgis-proxy{base}")
    assert r.status_code == 429
    assert r.json()["error"] == "rate_limited"


# ── /api/panel/thermal-check ─────────────────────────────────────────────────

def test_panel_thermal_blocks_after_limit():
    """`panel_thermal` limiti aşılınca 429 döner."""
    limit_str = LIMITS["panel_thermal"]
    max_allowed = int(limit_str.split("/")[0])
    for _ in range(max_allowed):
        client.post("/api/panel/thermal-check", json=_thermal_body())

    r = client.post("/api/panel/thermal-check", json=_thermal_body())
    assert r.status_code == 429


# ── /api/financial/proposal ──────────────────────────────────────────────────

def test_financial_blocks_after_limit():
    """`financial` limiti aşılınca 429 döner."""
    limit_str = LIMITS["financial"]
    max_allowed = int(limit_str.split("/")[0])
    for _ in range(max_allowed):
        client.post("/api/financial/proposal", json=_pv_body())

    r = client.post("/api/financial/proposal", json=_pv_body())
    assert r.status_code == 429


# ── Retry-After değeri makul ─────────────────────────────────────────────────

def test_retry_after_header_is_positive_integer():
    """429 yanıtındaki Retry-After değeri pozitif tam sayı olmalı."""
    limit_str = LIMITS["pv_calculate"]
    max_allowed = int(limit_str.split("/")[0])
    for _ in range(max_allowed):
        client.post("/api/pv/calculate", json=_pv_body())

    r = client.post("/api/pv/calculate", json=_pv_body())
    assert r.status_code == 429
    retry_after = int(r.headers["Retry-After"])
    assert retry_after > 0


# ── RATE_LIMIT_DISABLED ortam değişkeni ──────────────────────────────────────

def test_limits_dict_has_all_required_keys():
    """LIMITS sözlüğü tüm endpoint anahtarlarını içermeli."""
    required = {"pv_calculate", "pvlib_calculate", "financial",
                "pvgis_proxy", "field_import", "panel_thermal"}
    assert required.issubset(LIMITS.keys())


def test_each_limit_string_is_valid_format():
    """Her limit değeri '<sayı>/<periyot>' formatında olmalı."""
    import re
    pattern = re.compile(r"^\d+/(second|minute|hour|day)$")
    for key, val in LIMITS.items():
        assert pattern.match(val), f"Geçersiz limit formatı — {key}: {val!r}"
