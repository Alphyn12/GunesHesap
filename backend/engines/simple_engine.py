from __future__ import annotations

import logging
from typing import Dict, List

from backend.models.engine_contracts import EngineRequest

logger = logging.getLogger(__name__)


MONTH_WEIGHTS = [0.055, 0.062, 0.085, 0.095, 0.105, 0.115, 0.112, 0.108, 0.090, 0.075, 0.055, 0.043]

PANEL_WATT = {
    "mono_perc": 435,
    "n_type_topcon": 455,
    "bifacial_topcon": 455,
    "hjt": 460,
    "mono": 435,
    "poly": 455,
    "bifacial": 455,
}

PANEL_AREA_M2 = {
    "mono_perc": 1.134 * 1.762,
    "n_type_topcon": 1.134 * 1.762,
    "bifacial_topcon": 1.134 * 1.762,
    "hjt": 1.205 * 1.728,
    "mono": 1.134 * 1.762,
    "poly": 1.134 * 1.762,
    "bifacial": 1.134 * 1.762,
}

INVERTER_EFF = {
    "string": 0.97,
    "micro": 0.965,
    "optimizer": 0.985,
}

TILT_COEFFS = {
    0: 0.78,
    10: 0.90,
    15: 0.94,
    20: 0.97,
    25: 0.99,
    30: 1.00,
    33: 1.00,
    35: 1.00,
    40: 0.99,
    45: 0.97,
    50: 0.94,
    60: 0.87,
    75: 0.75,
    90: 0.62,
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _annual_ghi_to_psh(ghi: float | None, city_name: str | None = None) -> float:
    # BUG-15 fix: coerce to float first so string inputs don't silently fall through.
    # Heuristic: PSH (peak sun hours/day) is physically bounded to ~10 h/day.
    # Any value > 20 must be annual GHI kWh/m²/year → divide by 365.
    # Values 0 < v ≤ 20 are treated as daily PSH (reasonable range: 3–7 for Turkey).
    # Annual GHI < 20 kWh/m²/year is physically impossible, so the threshold is unambiguous.
    try:
        ghi = float(ghi) if ghi is not None else None
    except (TypeError, ValueError):
        ghi = None
    if ghi and ghi > 20:
        return ghi / 365
    if ghi and 0 < ghi <= 20:
        # Clamp to physical maximum of 10 h/day; values 10–20 indicate bad upstream data.
        if ghi > 10:
            logger.warning("PSH %.2f h/day clamped to 10 (city=%s) — likely bad upstream data", ghi, city_name)
        return min(ghi, 10.0)
    fallback = {
        # Marmara
        "İstanbul": 4.24, "Edirne": 4.08, "Tekirdağ": 4.08, "Kırklareli": 4.03,
        "Çanakkale": 4.27, "Bursa": 4.32, "Balıkesir": 4.33, "Bilecik": 4.14,
        "Kocaeli": 4.05, "Sakarya": 4.11, "Düzce": 3.89, "Bolu": 4.00,
        "Bartın": 3.81, "Karabük": 3.95, "Zonguldak": 3.78,
        # İç Anadolu
        "Ankara": 4.44, "Eskişehir": 4.33, "Kırıkkale": 4.38, "Kırşehir": 4.44,
        "Çankırı": 4.22, "Çorum": 4.33, "Yozgat": 4.33, "Amasya": 4.16,
        "Tokat": 4.11, "Sivas": 4.38, "Kayseri": 4.52, "Nevşehir": 4.52,
        "Aksaray": 4.49, "Niğde": 4.52, "Konya": 4.60, "Karaman": 4.66, "Afyonkarahisar": 4.44,
        # Ege
        "İzmir": 4.71, "Izmir": 4.71, "Manisa": 4.60, "Aydın": 4.82, "Denizli": 4.71,
        "Muğla": 4.88, "Kütahya": 4.36, "Uşak": 4.55, "Isparta": 4.66, "Burdur": 4.71,
        # Akdeniz
        "Antalya": 4.93, "Mersin": 4.90, "Adana": 4.87, "Hatay": 4.93,
        "Osmaniye": 4.82, "Kahramanmaraş": 4.88,
        # Karadeniz
        "Trabzon": 3.62, "Giresun": 3.62, "Ordu": 3.67, "Samsun": 3.78,
        "Sinop": 3.78, "Kastamonu": 3.97, "Rize": 3.45, "Artvin": 3.51,
        "Gümüşhane": 4.11, "Bayburt": 4.16,
        # Doğu Anadolu
        "Erzurum": 4.33, "Erzincan": 4.49, "Malatya": 4.71, "Elazığ": 4.71,
        "Van": 4.66, "Bitlis": 4.49, "Muş": 4.44, "Bingöl": 4.60,
        "Tunceli": 4.55, "Hakkari": 4.66, "Kars": 4.25, "Ardahan": 4.05,
        "Ağrı": 4.44, "Iğdır": 4.60,
        # Güneydoğu Anadolu
        "Şanlıurfa": 5.15, "Gaziantep": 4.99, "Diyarbakır": 4.79, "Mardin": 5.04,
        "Adıyaman": 4.93, "Batman": 4.82, "Şırnak": 4.82, "Siirt": 4.82,
    }
    return fallback.get(city_name or "", 4.50)


def _tilt_factor(tilt: float) -> float:
    tilt = _clamp(float(tilt), 0, 90)
    keys = sorted(TILT_COEFFS)
    if tilt <= keys[0]:
        return TILT_COEFFS[keys[0]]
    if tilt >= keys[-1]:
        return TILT_COEFFS[keys[-1]]
    for low, high in zip(keys, keys[1:]):
        if low <= tilt <= high:
            if low == high:
                return TILT_COEFFS[low]
            ratio = (tilt - low) / (high - low)
            return TILT_COEFFS[low] + ratio * (TILT_COEFFS[high] - TILT_COEFFS[low])
    raise RuntimeError(f"_tilt_factor: no bracket matched for tilt={tilt} (keys={keys})")


def _azimuth_factor(azimuth: float) -> float:
    delta = abs(((azimuth - 180 + 180) % 360) - 180)
    return _clamp(1 - delta * 0.0017, 0.55, 1.0)


def panel_watt_peak(request: EngineRequest) -> float:
    explicit = getattr(request.system, "panelWattPeak", None)
    if explicit and float(explicit) > 0:
        return float(explicit)
    return float(PANEL_WATT.get(request.system.panelType, PANEL_WATT["mono_perc"]))


def panel_area_m2(request: EngineRequest) -> float:
    explicit = getattr(request.system, "panelAreaM2", None)
    if explicit and float(explicit) > 0:
        return float(explicit)
    return float(PANEL_AREA_M2.get(request.system.panelType, PANEL_AREA_M2["mono_perc"]))


def inverter_efficiency(request: EngineRequest) -> float:
    explicit = getattr(request.system, "inverterEfficiency", None)
    if explicit and 0 < float(explicit) <= 1:
        return float(explicit)
    return float(INVERTER_EFF.get(request.system.inverterType, INVERTER_EFF["string"]))


def bifacial_gain(request: EngineRequest) -> float:
    explicit = getattr(request.system, "bifacialGain", None)
    if explicit is not None:
        return max(0.0, float(explicit))
    return 0.10 if request.system.panelType in {"bifacial", "bifacial_topcon"} else 0.0


def cable_loss_factor(request: EngineRequest) -> float:
    # Explicit None check: cableLossPct=0 must NOT fall through to wiringMismatchPct.
    cab = getattr(request.system, "cableLossPct", None)
    loss_pct = cab if cab is not None else (getattr(request.system, "wiringMismatchPct", 0) or 0)
    return 1 - _clamp(float(loss_pct), 0, 50) / 100


def layout_snapshot(request: EngineRequest) -> dict | None:
    snap = getattr(request.system, "layoutSnapshot", None)
    if snap and hasattr(snap, "model_dump"):
        snap = snap.model_dump()
    return snap if isinstance(snap, dict) else None


def system_power_from_layout_snapshot(request: EngineRequest) -> tuple[float, int] | None:
    snap = layout_snapshot(request)
    if not snap or not snap.get("authoritativeSizing"):
        return None
    kwp = float(snap.get("chosenSystemPowerKwp") or 0)
    panel_count = int(round(float(snap.get("panelCount") or 0)))
    if kwp > 0 and panel_count > 0:
        return kwp, panel_count
    return None


def layout_sections_from_snapshot(request: EngineRequest) -> list[dict]:
    snap = layout_snapshot(request)
    sections = snap.get("sections") if snap else None
    if not isinstance(sections, list):
        return []

    panel_watt = panel_watt_peak(request)
    normalized = []
    for section in sections:
        if section and hasattr(section, "model_dump"):
            section = section.model_dump()
        if not isinstance(section, dict):
            continue
        panel_count = int(round(float(section.get("panelCount") or 0)))
        system_power_kwp = float(section.get("systemPowerKwp") or 0)
        if system_power_kwp <= 0 and panel_count > 0:
            system_power_kwp = panel_count * panel_watt / 1000
        if system_power_kwp <= 0:
            continue
        normalized.append(
            {
                "systemPowerKwp": system_power_kwp,
                "panelCount": panel_count,
                "tiltDeg": float(section.get("tiltDeg") if section.get("tiltDeg") is not None else request.roof.tiltDeg),
                "azimuthDeg": float(section.get("azimuthDeg") if section.get("azimuthDeg") is not None else request.roof.azimuthDeg),
                "shadingPct": float(section.get("shadingPct") if section.get("shadingPct") is not None else request.roof.shadingPct),
            }
        )
    return normalized


def calculate_production(request: EngineRequest) -> Dict[str, object]:
    panel_type = request.system.panelType
    panel_watt = panel_watt_peak(request)
    panel_area = panel_area_m2(request)
    snapshot_power = system_power_from_layout_snapshot(request)
    if snapshot_power:
        system_power_kwp, panel_count = snapshot_power
    else:
        usable_area = max(0, request.roof.areaM2) * max(0.1, min(1.0, request.roof.usableRoofRatio))
        panel_count = int(usable_area // panel_area)
        system_power_kwp = panel_count * panel_watt / 1000

    psh = _annual_ghi_to_psh(request.site.ghi, request.site.cityName)
    soiling_factor = 1 - _clamp(request.roof.soilingPct, 0, 50) / 100
    inverter_factor = inverter_efficiency(request)
    _bifacial_base_gain = bifacial_gain(request)
    wiring_factor = cable_loss_factor(request)
    sections = layout_sections_from_snapshot(request)
    use_section_geometry = bool(sections)

    if use_section_geometry:
        base_energy = 0.0
        annual_energy = 0.0
        orientation_weighted = 0.0
        shading_weighted = 0.0
        for section in sections:
            section_power = section["systemPowerKwp"]
            section_base = section_power * psh * 365
            section_orientation = _tilt_factor(section["tiltDeg"]) * _azimuth_factor(section["azimuthDeg"])
            section_shading_factor = 1 - _clamp(section["shadingPct"], 0, 80) / 100
            section_bifacial = 1 + _bifacial_base_gain * (1 - _clamp(section["shadingPct"], 0, 80) / 200)
            base_energy += section_base
            annual_energy += section_base * section_shading_factor * soiling_factor * inverter_factor * section_orientation * section_bifacial * wiring_factor
            orientation_weighted += section_orientation * section_power
            shading_weighted += section["shadingPct"] * section_power
        orientation_factor = orientation_weighted / max(system_power_kwp, 1e-9)
        shading_pct = shading_weighted / max(system_power_kwp, 1e-9)
    else:
        base_energy = system_power_kwp * psh * 365
        shading_pct = request.roof.shadingPct
        shading_factor = 1 - _clamp(shading_pct, 0, 80) / 100
        orientation_factor = _tilt_factor(request.roof.tiltDeg) * _azimuth_factor(request.roof.azimuthDeg)
        bifacial_factor = 1 + _bifacial_base_gain * (1 - _clamp(shading_pct, 0, 80) / 200)
        annual_energy = base_energy * shading_factor * soiling_factor * inverter_factor * orientation_factor * bifacial_factor * wiring_factor
    monthly = [round(annual_energy * weight) for weight in MONTH_WEIGHTS]

    if use_section_geometry:
        bifacial_factor = 1 + _bifacial_base_gain * (1 - _clamp(shading_pct, 0, 80) / 200)

    # Faz-1 D3: emit bifacial gain in kWh so frontend authoritative path can prefer
    # the engine value over a hard-coded 5 % fallback.
    bifacial_gain_kwh = annual_energy * (bifacial_factor - 1) / max(bifacial_factor, 1e-9)
    losses = {
        "baseEnergyKwh": round(base_energy),
        "orientationFactor": round(orientation_factor, 4),
        "shadingPct": round(shading_pct, 3),
        "soilingPct": request.roof.soilingPct,
        "inverterEfficiency": inverter_factor,
        "bifacialFactor": bifacial_factor,
        "bifacialGainKwh": round(max(0.0, bifacial_gain_kwh), 2),
        "wiringLossPct": round((1 - wiring_factor) * 100, 3),
        "modelCompleteness": "deterministic backend fallback aligned to frontend panel/inverter contract; pvlib hourly model chain preferred when available",
        "layoutSnapshotUsed": bool(snapshot_power),
        "layoutSectionGeometryUsed": use_section_geometry,
        "layoutSnapshot": layout_snapshot(request),
        # Faz-1 D1: simple deterministic fallback uses a synthetic GHI/PSH model — not
        # real meteorology — so it must not be promoted to authoritative on the frontend.
        "weatherSource": "psh-deterministic-synthetic",
        "parityNotes": [
            "Panel wattage, panel area, inverter efficiency, bifacial gain, and cable loss are read from the shared request contract when present.",
            "This fallback still uses a deterministic GHI/PSH orientation model, so it is not expected to numerically match pvlib-backed or browser PVGIS output exactly.",
        ],
    }
    return {
        "production": {
            "annualEnergyKwh": round(annual_energy),
            "monthlyEnergyKwh": monthly,
            "systemPowerKwp": round(system_power_kwp, 3),
            "panelCount": panel_count,
            "psh": round(psh, 3),
            "capacityFactorPct": round((annual_energy / max(system_power_kwp * 8760, 1)) * 100, 2),
        },
        "losses": losses,
    }


def annual_load_kwh(request: EngineRequest) -> float:
    monthly = request.load.monthlyConsumptionKwh
    if monthly and len(monthly) == 12:
        return sum(max(0, float(value or 0)) for value in monthly)
    hourly = request.load.hourlyConsumption8760
    if hourly and len(hourly) == 8760:
        return sum(max(0, float(value or 0)) for value in hourly)
    return max(0, request.load.dailyConsumptionKwh) * 365


def monthly_from_annual(total: float) -> List[float]:
    return [round(total * weight, 2) for weight in MONTH_WEIGHTS]
