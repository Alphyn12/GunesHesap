"""
/api/lead/submit endpoint testleri — Step 7 "Teklif Al" iletişim formu.

Kapsam:
  • Happy path — tüm geçerli alanlarla 200 + leadId
  • Eksik consent — consentMarketing=False → 422
  • Geçersiz telefon formatı → 422
  • Geçersiz e-posta formatı → 422
  • Eksik zorunlu alan (firstName) → 422
  • Rate limit aşımı → 429
  • Persistence — JSONL dosyasına yazılıyor
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.rate_limit import LIMITS

client = TestClient(app)


def _valid_payload(**overrides):
    payload = {
        "firstName": "Ali",
        "lastName": "Yılmaz",
        "phone": "+90 555 123 45 67",
        "email": "ali@example.com",
        "address": "İstanbul, Kadıköy",
        "contactTime": "morning",
        "consentMarketing": True,
        "consentDataProcessing": True,
        "consentThirdParty": True,
        "locale": "tr",
    }
    payload.update(overrides)
    return payload


@pytest.fixture(autouse=True)
def isolate_lead_log(tmp_path, monkeypatch):
    """Her testte ayrı bir log dosyası — testler birbirinin verisini bozmasın."""
    log_path = tmp_path / "leads.jsonl"
    monkeypatch.setenv("SOLARROTA_LEAD_LOG_PATH", str(log_path))
    yield log_path


def test_lead_submit_happy_path(isolate_lead_log: Path):
    response = client.post("/api/lead/submit", json=_valid_payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["leadId"], str) and len(body["leadId"]) >= 16
    assert "receivedAt" in body

    # JSONL dosyası oluşmalı ve 1 satır içermeli
    assert isolate_lead_log.exists()
    lines = isolate_lead_log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["leadId"] == body["leadId"]
    assert record["payload"]["email"] == "ali@example.com"


def test_lead_submit_phone_alternative_format():
    """Yerel format 05XX XXX XX XX da kabul edilmeli."""
    response = client.post("/api/lead/submit", json=_valid_payload(phone="0555 123 45 67"))
    assert response.status_code == 200, response.text


def test_lead_submit_missing_consent_marketing():
    response = client.post("/api/lead/submit", json=_valid_payload(consentMarketing=False))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("consent" in str(err).lower() for err in detail)


def test_lead_submit_missing_consent_data_processing():
    response = client.post("/api/lead/submit", json=_valid_payload(consentDataProcessing=False))
    assert response.status_code == 422


def test_lead_submit_missing_consent_third_party():
    response = client.post("/api/lead/submit", json=_valid_payload(consentThirdParty=False))
    assert response.status_code == 422


def test_lead_submit_invalid_phone():
    response = client.post("/api/lead/submit", json=_valid_payload(phone="123"))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("phone" in str(err).lower() for err in detail)


def test_lead_submit_invalid_email():
    response = client.post("/api/lead/submit", json=_valid_payload(email="not-an-email"))
    assert response.status_code == 422


def test_lead_submit_missing_required_field():
    payload = _valid_payload()
    del payload["firstName"]
    response = client.post("/api/lead/submit", json=payload)
    assert response.status_code == 422


def test_lead_submit_rejects_extra_fields():
    """extra='forbid' — şüpheli ekstra alanlar reddedilmeli (spam koruması)."""
    response = client.post("/api/lead/submit", json=_valid_payload(extraField="hack"))
    assert response.status_code == 422


def test_lead_submit_rate_limit():
    """Limit aşılınca 429 döner (lead_submit: 5/minute)."""
    limit_str = LIMITS["lead_submit"]
    max_allowed = int(limit_str.split("/")[0])
    for _ in range(max_allowed):
        client.post("/api/lead/submit", json=_valid_payload())

    response = client.post("/api/lead/submit", json=_valid_payload())
    assert response.status_code == 429
    assert response.json()["error"] == "rate_limited"
    assert "Retry-After" in response.headers


def test_lead_submit_optional_fields_omitted():
    """address, contactTime, proposalSnapshot opsiyonel — çıkarsa hala 200."""
    payload = _valid_payload()
    del payload["address"]
    del payload["contactTime"]
    response = client.post("/api/lead/submit", json=payload)
    assert response.status_code == 200, response.text


def test_lead_submit_with_proposal_snapshot(isolate_lead_log: Path):
    """proposalSnapshot frontend'in Step 7 KPI özetini geçirebileceği serbest dict."""
    snapshot = {"annualEnergy": 12500, "systemPower": 8.5, "totalCost": 250000, "scenarioKey": "on-grid"}
    response = client.post(
        "/api/lead/submit",
        json=_valid_payload(proposalSnapshot=snapshot),
    )
    assert response.status_code == 200, response.text
    record = json.loads(isolate_lead_log.read_text(encoding="utf-8").splitlines()[0])
    assert record["payload"]["proposalSnapshot"] == snapshot
