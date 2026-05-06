from __future__ import annotations

from typing import Any

from backend.engines.pvlib_engine import calculate_pvlib_production, can_use_pvlib, engine_source, pvlib_status
from backend.engines.simple_engine import calculate_production
from backend.models.engine_contracts import EngineRequest


PVLIB_REQUESTED = {"auto", "python-backend", "pvlib-service", "pvlib-backed"}


def _coordinate_blocker(request: EngineRequest) -> str | None:
    if request.site.lat is None or request.site.lon is None:
        return "site coordinates missing"
    lat = float(request.site.lat)
    lon = float(request.site.lon)
    if lat < -90 or lat > 90 or lon < -180 or lon > 180:
        return "site coordinates outside valid latitude/longitude bounds"
    return None


def calculate_backend_production(request: EngineRequest) -> dict[str, Any]:
    fallback_reason = None
    if request.requestedEngine in PVLIB_REQUESTED:
        if can_use_pvlib(request):
            try:
                payload = calculate_pvlib_production(request)
                payload["raw"] = {**payload.get("raw", {}), "pvlib": pvlib_status()}
                return payload
            except Exception as exc:
                fallback_reason = f"pvlib backend path failed: {exc}"
        else:
            coordinate_reason = _coordinate_blocker(request)
            if coordinate_reason:
                fallback_reason = f"pvlib backend path unavailable: {coordinate_reason}."
            else:
                fallback_reason = "pvlib backend path unavailable: pvlib missing or installed capacity is zero."

    deterministic = calculate_production(request)
    return {
        "engineSource": engine_source("fallback", fallback_reason),
        "production": {
            **deterministic["production"],
            "annual_kwh": deterministic["production"].get("annualEnergyKwh"),
            "monthly_kwh": deterministic["production"].get("monthlyEnergyKwh"),
            "engine_used": "python-deterministic-fallback",
            "engine_quality": "fallback-estimate",
            "confidence_level": "medium-low" if fallback_reason else "medium",
            "assumption_flags": {
                "usesClearSkyIrradianceScaledToInputGhi": False,
                "usesMeasuredWeather": False,
                "usesHourlySolarPosition": False,
                "usesPvlibTemperatureModel": False,
                "usesSimplifiedInverterModel": True,
            },
        },
        "losses": {
            **deterministic["losses"],
            "modelCompleteness": deterministic["losses"].get("modelCompleteness", "deterministic fallback"),
            "fallbackReason": fallback_reason,
        },
        "raw": {
            "engineUsed": "python-deterministic-fallback",
            "engine_used": "python-deterministic-fallback",
            "engineQuality": "fallback-estimate",
            "engine_quality": "fallback-estimate",
            "confidenceLevel": "medium-low" if fallback_reason else "medium",
            "confidence_level": "medium-low" if fallback_reason else "medium",
            "sourceNotes": engine_source("fallback", fallback_reason).notes,
            "source_notes": engine_source("fallback", fallback_reason).notes,
            "fallbackUsed": bool(fallback_reason),
            "fallback_flags": [fallback_reason] if fallback_reason else [],
            "pvlib": pvlib_status(),
        },
    }
