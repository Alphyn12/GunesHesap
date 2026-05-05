from __future__ import annotations

from datetime import datetime
from io import BytesIO
import csv
import re
from statistics import median
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def clean_cell(value: Any) -> str:
    """H\u00fccre de\u011ferini normalize et ve CSV/Excel formula injection'a kar\u015f\u0131 koru.

    G\u00fcvenlik (S-03 / CSV Injection):
    Excel ve LibreOffice Calc, h\u00fccre i\u00e7eri\u011fi '=', '+', '-', '@' gibi karakterlerle
    ba\u015fl\u0131yorsa bunu form\u00fcl olarak yorumlar ve otomatik \u00e7al\u0131\u015ft\u0131r\u0131r.
    Bu g\u00fcvenlik a\u00e7\u0131\u011f\u0131, d\u0131\u015fa aktar\u0131lan CSV/XLSX raporlar\u0131n\u0131n ba\u015fka bir kullan\u0131c\u0131
    taraf\u0131ndan a\u00e7\u0131lmas\u0131nda k\u00f6t\u00fcye kullan\u0131labilir.
    \u00c7\u00f6z\u00fcm: Tehlikeli ba\u015flang\u0131\u00e7 karakterleri tek t\u0131rnakla escape edilir (Excel safe).
    """
    cleaned = str(value or "").replace("\ufeff", "").strip()
    # Formula injection karakterleri: '=' '+' '-' '@' '\t' '\r' '\n'
    if cleaned and cleaned[0] in ("=", "+", "-", "@", "\t", "\r", "\n"):
        cleaned = "'" + cleaned  # Excel safe escape \u2014 form\u00fcl olarak yorumlanmaz
    return cleaned


def finite(value: Any, fallback: float | None = 0.0) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number == number else fallback


def parse_timestamp(value: Any) -> datetime | None:
    raw = clean_cell(value)
    if not raw:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
    ):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def percentile(values: list[float], p: float = 0.95) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    idx = min(len(sorted_values) - 1, max(0, int((len(sorted_values) - 1) * p)))
    return sorted_values[idx]


def infer_delimiter(sample: str) -> str:
    counts = {
        "\t": sample.count("\t"),
        ";": sample.count(";"),
        ",": sample.count(","),
    }
    return max(counts.items(), key=lambda item: item[1])[0]


def parse_text_rows(content: bytes) -> list[list[str]]:
    text = content.decode("utf-8-sig", errors="replace")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    delimiter = infer_delimiter("\n".join(lines[:8]))
    reader = csv.reader(lines, delimiter=delimiter)
    return [[clean_cell(cell) for cell in row] for row in reader]


def column_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
    index = 0
    for char in letters:
        index = index * 26 + (ord(char) - 64)
    return max(index - 1, 0)


def read_shared_strings(zf: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall("main:si", NS):
        parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        values.append("".join(parts))
    return values


def resolve_first_sheet_path(zf: ZipFile) -> str:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    relation_map = {
        rel.attrib.get("Id"): rel.attrib.get("Target")
        for rel in rels.findall("pkgrel:Relationship", NS)
    }
    first_sheet = workbook.find("main:sheets/main:sheet", NS)
    if first_sheet is None:
        raise ValueError("XLSX dosyasında worksheet bulunamadı.")
    rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    target = relation_map.get(rel_id)
    if not target:
        raise ValueError("XLSX worksheet ilişkisi çözülemedi.")
    if target.startswith("/"):
        return target.lstrip("/")
    return f"xl/{target}" if not target.startswith("xl/") else target


def parse_xlsx_rows(content: bytes) -> list[list[str]]:
    with ZipFile(BytesIO(content)) as zf:
        shared_strings = read_shared_strings(zf)
        sheet_path = resolve_first_sheet_path(zf)
        root = ET.fromstring(zf.read(sheet_path))
        rows: list[list[str]] = []
        for row in root.findall(".//main:sheetData/main:row", NS):
            parsed: dict[int, str] = {}
            for cell in row.findall("main:c", NS):
                ref = cell.attrib.get("r", "A1")
                idx = column_index(ref)
                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", NS)
                inline_node = cell.find("main:is/main:t", NS)
                if inline_node is not None:
                    parsed[idx] = clean_cell(inline_node.text)
                elif cell_type == "s" and value_node is not None:
                    shared_idx = int(value_node.text or 0)
                    parsed[idx] = clean_cell(shared_strings[shared_idx] if shared_idx < len(shared_strings) else "")
                else:
                    parsed[idx] = clean_cell(value_node.text if value_node is not None else "")
            if not parsed:
                continue
            max_idx = max(parsed)
            rows.append([parsed.get(i, "") for i in range(max_idx + 1)])
        return rows


def parse_tabular_rows(filename: str, content: bytes) -> list[list[str]]:
    if re.search(r"\.(xlsx|xls)$", filename, re.IGNORECASE):
        return parse_xlsx_rows(content)
    return parse_text_rows(content)


def header_score(value: str, patterns: list[str]) -> int:
    lower = clean_cell(value).lower()
    return 1 if any(pattern in lower for pattern in patterns) else 0


def detect_columns(rows: list[list[str]]) -> dict[str, int | None]:
    header = rows[0] if rows else []
    candidates = []
    for idx, cell in enumerate(header):
        candidates.append(
            {
                "idx": idx,
                "timestamp": header_score(cell, ["timestamp", "date", "time", "tarih", "zaman", "datetime"]),
                "value": header_score(cell, ["kw", "kwh", "power", "load", "energy", "yük", "güç", "enerji"]),
                "severity": header_score(cell, ["severity", "level", "alarm", "priority", "durum"]),
                "code": header_score(cell, ["code", "fault", "event", "alarm", "hata"]),
                "message": header_score(cell, ["message", "description", "text", "note", "açıklama", "mesaj"]),
            }
        )
    by_score = lambda key: sorted(candidates, key=lambda item: item[key], reverse=True)[0]["idx"] if candidates else 0
    return {
        "timestampIdx": by_score("timestamp"),
        "valueIdx": by_score("value"),
        "severityIdx": next((item["idx"] for item in candidates if item["severity"] > 0), None),
        "codeIdx": next((item["idx"] for item in candidates if item["code"] > 0), None),
        "messageIdx": next((item["idx"] for item in candidates if item["message"] > 0), None),
    }


def infer_unit_hint(header: list[str]) -> str:
    joined = " ".join(clean_cell(cell).lower() for cell in header)
    if "kwh" in joined:
        return "kwh"
    if "wh" in joined:
        return "wh"
    return "kw"


def normalize_power_kw(value: Any, interval_minutes: float, unit_hint: str) -> float | None:
    n = finite(value, None)
    if n is None or n < 0:
        return None
    hours = max(interval_minutes / 60, 1 / 60)
    if unit_hint == "wh":
        return (n / 1000) / hours
    if unit_hint == "kwh":
        return n / hours
    return n


def normalize_energy_kwh(value: Any, interval_minutes: float, unit_hint: str) -> float | None:
    n = finite(value, None)
    if n is None or n < 0:
        return None
    hours = max(interval_minutes / 60, 1 / 60)
    if unit_hint == "wh":
        return n / 1000
    if unit_hint == "kwh":
        return n
    return n * hours


def infer_interval_minutes(samples: list[dict[str, Any]]) -> int | None:
    diffs: list[float] = []
    for idx in range(1, min(len(samples), 2048)):
        diff = (samples[idx]["timestamp"] - samples[idx - 1]["timestamp"]).total_seconds() / 60
        if 0 < diff <= 24 * 60:
            diffs.append(diff)
    if not diffs:
        return None
    return max(1, round(median(diffs)))


def build_hourly_buckets(samples: list[dict[str, Any]], interval_minutes: int, unit_hint: str) -> list[dict[str, Any]]:
    buckets: dict[datetime, dict[str, Any]] = {}
    for sample in samples:
        ts = sample["timestamp"]
        hour_ts = ts.replace(minute=0, second=0, microsecond=0)
        bucket = buckets.setdefault(hour_ts, {"ts": hour_ts, "energyKwh": 0.0, "peakKw": 0.0})
        power_kw = normalize_power_kw(sample["value"], interval_minutes, unit_hint)
        energy_kwh = normalize_energy_kwh(sample["value"], interval_minutes, unit_hint)
        if power_kw is not None:
            bucket["peakKw"] = max(bucket["peakKw"], power_kw)
        if energy_kwh is not None:
            bucket["energyKwh"] += energy_kwh
    return [buckets[key] for key in sorted(buckets)]


def compress_hourly_to_8760(hourly: list[dict[str, Any]]) -> list[float] | None:
    filtered = [bucket for bucket in hourly if not (bucket["ts"].month == 2 and bucket["ts"].day == 29)]
    if len(filtered) < 8760:
        return None
    return [round(bucket["energyKwh"], 6) for bucket in filtered[:8760]]


def parse_high_resolution_load(filename: str, content: bytes, kind: str = "load") -> dict[str, Any]:
    rows = parse_tabular_rows(filename, content)
    if len(rows) < 2:
        raise ValueError("Dosya en az iki satır içermeli.")
    columns = detect_columns(rows)
    unit_hint = infer_unit_hint(rows[0])
    samples = []
    for row in rows[1:]:
        timestamp = parse_timestamp(row[columns["timestampIdx"]] if columns["timestampIdx"] is not None and columns["timestampIdx"] < len(row) else "")
        value = finite(row[columns["valueIdx"]] if columns["valueIdx"] is not None and columns["valueIdx"] < len(row) else None, None)
        if timestamp is None or value is None or value < 0:
            continue
        samples.append({"timestamp": timestamp, "value": value})
    if not samples:
        raise ValueError("Geçerli zaman damgalı saha yük satırı bulunamadı.")
    samples.sort(key=lambda item: item["timestamp"])
    interval_minutes = infer_interval_minutes(samples)
    if interval_minutes is None:
        raise ValueError("Örnekleme aralığı çözülemedi. Dosyada zaman damgası kolonu gerekli.")
    hourly = build_hourly_buckets(samples, interval_minutes, unit_hint)
    total_energy = sum(normalize_energy_kwh(sample["value"], interval_minutes, unit_hint) or 0.0 for sample in samples)
    duration_hours = max(0.0, (samples[-1]["timestamp"] - samples[0]["timestamp"]).total_seconds() / 3600)
    powers = [normalize_power_kw(sample["value"], interval_minutes, unit_hint) or 0.0 for sample in samples]
    peak_bucket = max(hourly, key=lambda item: item["peakKw"], default=None)
    derived_8760 = compress_hourly_to_8760(hourly) if len(hourly) >= 8760 and duration_hours >= 360 * 24 else None
    return {
        "kind": "high-resolution-load",
        "loadProfileKind": kind,
        "sampleCount": len(samples),
        "intervalMinutes": interval_minutes,
        "totalEnergyKwh": round(total_energy, 3),
        "durationHours": round(duration_hours, 1),
        "durationDays": round(duration_hours / 24, 1),
        "observedPeakKw": round(max(powers) if powers else 0.0, 3),
        "p95Kw": round(percentile(powers, 0.95), 3),
        "averageKw": round(total_energy / max(duration_hours, 1 / 60), 3),
        "firstTimestamp": samples[0]["timestamp"].isoformat(),
        "lastTimestamp": samples[-1]["timestamp"].isoformat(),
        "hourlyBucketCount": len(hourly),
        "peakHourTimestamp": peak_bucket["ts"].isoformat() if peak_bucket else None,
        "derivedHourly8760": derived_8760,
        "derivedHourly8760Ready": isinstance(derived_8760, list) and len(derived_8760) == 8760,
    }


def classify_event(text: str) -> str:
    lower = clean_cell(text).lower()
    if re.search(r"(trip|shutdown|stopped|disconnect|tripped|kesinti|kapand)", lower):
        return "trip"
    if re.search(r"(overload|over current|overcurrent|surge|aşırı yük|over power)", lower):
        return "overload"
    if re.search(r"(battery low|low battery|battery voltage|low soc|low voltage|under voltage|undervoltage|düşük gerilim|düşük soc)", lower):
        return "battery"
    if re.search(r"(fault|error|fail|hata|arıza)", lower):
        return "fault"
    return "other"


def event_flags(text: str) -> dict[str, bool]:
    lower = clean_cell(text).lower()
    return {
        "trip": bool(re.search(r"(trip|shutdown|stopped|disconnect|tripped|kesinti|kapand)", lower)),
        "overload": bool(re.search(r"(overload|over current|overcurrent|surge|aşırı yük|over power)", lower)),
        "fault": bool(re.search(r"(fault|error|fail|hata|arıza)", lower)),
        "battery": bool(re.search(r"(battery low|low battery|battery voltage|low soc|low voltage|under voltage|undervoltage|düşük gerilim|düşük soc)", lower)),
    }


def parse_inverter_event_log(filename: str, content: bytes) -> dict[str, Any]:
    rows = parse_tabular_rows(filename, content)
    if len(rows) < 2:
        raise ValueError("Dosya en az iki satır içermeli.")
    columns = detect_columns(rows)
    events = []
    for row in rows[1:]:
        timestamp = parse_timestamp(row[columns["timestampIdx"]] if columns["timestampIdx"] is not None and columns["timestampIdx"] < len(row) else "")
        severity = clean_cell(row[columns["severityIdx"]]) if columns["severityIdx"] is not None and columns["severityIdx"] < len(row) else ""
        code = clean_cell(row[columns["codeIdx"]]) if columns["codeIdx"] is not None and columns["codeIdx"] < len(row) else ""
        message = clean_cell(row[columns["messageIdx"]]) if columns["messageIdx"] is not None and columns["messageIdx"] < len(row) else " | ".join(clean_cell(cell) for cell in row)
        text = " | ".join(part for part in (severity, code, message) if part)
        if not text:
            continue
        events.append({"timestamp": timestamp, "severity": severity, "code": code, "text": text, "type": classify_event(text), "flags": event_flags(text)})
    if not events:
        raise ValueError("Geçerli inverter olay kaydı bulunamadı.")
    timed = sorted([event for event in events if event["timestamp"] is not None], key=lambda item: item["timestamp"])
    return {
        "kind": "inverter-event-log",
        "eventCount": len(events),
        "tripCount": sum(1 for event in events if event["flags"]["trip"]),
        "overloadCount": sum(1 for event in events if event["flags"]["overload"]),
        "faultCount": sum(1 for event in events if event["flags"]["fault"]),
        "batteryAlarmCount": sum(1 for event in events if event["flags"]["battery"]),
        "criticalEventCount": sum(1 for event in events if event["type"] != "other"),
        "firstTimestamp": timed[0]["timestamp"].isoformat() if timed else None,
        "lastTimestamp": timed[-1]["timestamp"].isoformat() if timed else None,
        "uniqueCodes": sorted({event["code"] for event in events if event["code"]})[:20],
    }


def analyze_field_import(filename: str, content: bytes, kind: str) -> dict[str, Any]:
    if kind in {"load", "critical-load"}:
        return parse_high_resolution_load(filename, content, kind=kind)
    if kind == "inverter-log":
        return parse_inverter_event_log(filename, content)
    raise ValueError(f"Desteklenmeyen saha import türü: {kind}")
