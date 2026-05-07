"""
Lead persistence service — Step 7 "Teklif Al" iletişim formu.

V1 davranışı: form payload'ını append-only JSONL dosyasına yazar ve UUID üretir.
Hedef dosya yolu SOLARROTA_LEAD_LOG_PATH ortam değişkeniyle override edilebilir
(varsayılan: tmp/leads.jsonl, çalışma dizinine göreli).

V2 için planlanan: SMTP/CRM webhook entegrasyonu.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from backend.models.engine_contracts import LeadSubmitRequest

logger = logging.getLogger(__name__)

_DEFAULT_LEAD_LOG_PATH = "tmp/leads.jsonl"


def _resolve_log_path() -> Path:
    raw = os.getenv("SOLARROTA_LEAD_LOG_PATH", _DEFAULT_LEAD_LOG_PATH).strip()
    return Path(raw or _DEFAULT_LEAD_LOG_PATH)


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    visible = local[:1] if local else ""
    return f"{visible}***@{domain}"


def _mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 4:
        return "***"
    return f"***{digits[-4:]}"


def _scrub_pii_for_logs(payload: LeadSubmitRequest) -> Dict[str, Any]:
    """E-posta ve telefonu maskeleyen log-friendly dict döner."""
    return {
        "firstName": payload.firstName,
        "lastName": payload.lastName[:1] + "." if payload.lastName else "",
        "email": _mask_email(payload.email),
        "phone": _mask_phone(payload.phone),
        "contactTime": payload.contactTime,
        "locale": payload.locale,
        "hasProposalSnapshot": payload.proposalSnapshot is not None,
    }


def persist_lead(payload: LeadSubmitRequest) -> str:
    """Append-only JSONL dosyasına lead kaydı yazar; UUID döner.

    Raises:
        OSError: dosya yazılamadığında (çağıran 500 üretir).
    """
    lead_id = uuid.uuid4().hex
    log_path = _resolve_log_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    record = {
        "leadId": lead_id,
        "receivedAt": datetime.now(timezone.utc).isoformat(),
        "payload": payload.model_dump(mode="json"),
    }
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    logger.info("[lead-submit] persisted lead %s — %s", lead_id, _scrub_pii_for_logs(payload))
    # TODO (V2): SMTP/CRM webhook gönderimi — şu an dosyaya yazma yeterli.
    return lead_id
