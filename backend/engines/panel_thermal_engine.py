from __future__ import annotations

import math
from typing import Any

REFERENCE_TEMP_C = 25.0
DEFAULT_TEMPERATURES_C: tuple[float, ...] = (-10.0, 25.0, 60.0)
COLD_TEMP_C = -10.0
HOT_TEMP_C = 60.0


def _temperature_corrected(stc_value: float, coeff_pct_per_c: float, target_temp_c: float) -> float:
    """Apply datasheet temperature coefficient (in %/°C) to an STC value at target_temp_c.

    Formula: NewValue = STC * (1 + (coeff_pct / 100) * ΔT)  where ΔT = target - 25.
    """
    delta_t = target_temp_c - REFERENCE_TEMP_C
    return stc_value * (1 + (coeff_pct_per_c / 100.0) * delta_t)


def _scenario_for_temperature(
    target_temp_c: float,
    voc_stc: float,
    voc_coeff_pct_per_c: float,
    vmp_stc: float,
    vmp_coeff_pct_per_c: float,
    pmax_stc_w: float,
    pmax_coeff_pct_per_c: float,
) -> dict[str, Any]:
    delta_t = target_temp_c - REFERENCE_TEMP_C
    voc = _temperature_corrected(voc_stc, voc_coeff_pct_per_c, target_temp_c)
    vmp = _temperature_corrected(vmp_stc, vmp_coeff_pct_per_c, target_temp_c)
    pmax_w = _temperature_corrected(pmax_stc_w, pmax_coeff_pct_per_c, target_temp_c)
    return {
        "ambientTempC": round(target_temp_c, 2),
        "deltaTC": round(delta_t, 2),
        "vocV": round(voc, 3),
        "vmpV": round(vmp, 3),
        "pmaxW": round(pmax_w, 3),
        "vocCoeffUsedPctPerC": voc_coeff_pct_per_c,
        "vmpCoeffUsedPctPerC": vmp_coeff_pct_per_c,
        "pmaxCoeffUsedPctPerC": pmax_coeff_pct_per_c,
    }


def calculate_panel_thermal_sizing(
    *,
    voc_stc: float,
    voc_coeff_pct_per_c: float,
    vmp_stc: float,
    pmax_stc_w: float,
    pmax_coeff_pct_per_c: float,
    inverter_max_input_v: float,
    inverter_mppt_optimal_v: float,
    vmp_coeff_pct_per_c: float | None = None,
    temperatures_c: tuple[float, ...] | list[float] | None = None,
) -> dict[str, Any]:
    """Datasheet-driven temperature correction + safe inverter string sizing.

    Returns per-temperature corrected Voc/Vmp/Pmax, the safe maximum series panel
    count (math.floor against the COLDEST scenario's Voc — never round up), and a
    realistic peak system power using that floor count multiplied by the HOTTEST
    scenario's per-panel watt output.

    Inputs are validated; coefficients are accepted in %/°C (e.g. -0.29 for
    -0.29 %/°C). If no Vmp coefficient is supplied, the Voc coefficient is reused
    per the standard datasheet convention.
    """
    if voc_stc <= 0:
        raise ValueError("voc_stc must be positive")
    if vmp_stc <= 0:
        raise ValueError("vmp_stc must be positive")
    if pmax_stc_w <= 0:
        raise ValueError("pmax_stc_w must be positive")
    if inverter_max_input_v <= 0:
        raise ValueError("inverter_max_input_v must be positive")
    if inverter_mppt_optimal_v <= 0:
        raise ValueError("inverter_mppt_optimal_v must be positive")
    if inverter_mppt_optimal_v > inverter_max_input_v:
        raise ValueError("inverter_mppt_optimal_v cannot exceed inverter_max_input_v")

    vmp_coeff = vmp_coeff_pct_per_c if vmp_coeff_pct_per_c is not None else voc_coeff_pct_per_c
    vmp_coeff_source = "explicit" if vmp_coeff_pct_per_c is not None else "fallback-voc-coeff"

    temps = tuple(temperatures_c) if temperatures_c else DEFAULT_TEMPERATURES_C
    if not temps:
        raise ValueError("temperatures_c must contain at least one value")
    # Always include -10 and +60 so the safety/realism scenarios are present.
    temps = tuple(sorted({*temps, COLD_TEMP_C, HOT_TEMP_C}))

    scenarios = [
        _scenario_for_temperature(
            target_temp_c=t,
            voc_stc=voc_stc,
            voc_coeff_pct_per_c=voc_coeff_pct_per_c,
            vmp_stc=vmp_stc,
            vmp_coeff_pct_per_c=vmp_coeff,
            pmax_stc_w=pmax_stc_w,
            pmax_coeff_pct_per_c=pmax_coeff_pct_per_c,
        )
        for t in temps
    ]

    coldest = min(scenarios, key=lambda s: s["ambientTempC"])
    hottest = max(scenarios, key=lambda s: s["ambientTempC"])

    coldest_voc = coldest["vocV"]
    raw_max_series = inverter_max_input_v / coldest_voc
    safe_max_series_panels = int(math.floor(raw_max_series))

    # A floor of 0 means a single panel already exceeds the inverter ceiling — that
    # is a real datasheet incompatibility the caller needs to surface, not silently
    # bump to 1.
    realistic_peak_power_w = safe_max_series_panels * hottest["pmaxW"]

    # Optional MPPT context: how close the coldest Vmp string would sit to the
    # inverter's optimal MPPT voltage at the safe panel count.
    mppt_string_vmp_cold_v = safe_max_series_panels * coldest["vmpV"]
    mppt_string_vmp_hot_v = safe_max_series_panels * hottest["vmpV"]

    return {
        "inputs": {
            "vocStcV": voc_stc,
            "vocCoeffPctPerC": voc_coeff_pct_per_c,
            "vmpStcV": vmp_stc,
            "vmpCoeffPctPerC": vmp_coeff,
            "vmpCoeffSource": vmp_coeff_source,
            "pmaxStcW": pmax_stc_w,
            "pmaxCoeffPctPerC": pmax_coeff_pct_per_c,
            "inverterMaxInputV": inverter_max_input_v,
            "inverterMpptOptimalV": inverter_mppt_optimal_v,
            "temperaturesC": list(temps),
            "referenceTempC": REFERENCE_TEMP_C,
        },
        "scenarios": scenarios,
        "coldestScenario": coldest,
        "hottestScenario": hottest,
        "stringSizing": {
            "rawMaxSeriesPanels": round(raw_max_series, 4),
            "safeMaxSeriesPanels": safe_max_series_panels,
            "roundingRule": "math.floor (never round up — protects inverter from over-voltage)",
            "limitingScenario": {
                "ambientTempC": coldest["ambientTempC"],
                "vocV": coldest_voc,
                "inverterMaxInputV": inverter_max_input_v,
            },
            "stringVmpAtColdestV": round(mppt_string_vmp_cold_v, 3),
            "stringVmpAtHottestV": round(mppt_string_vmp_hot_v, 3),
            "mpptOptimalDeltaColdV": round(mppt_string_vmp_cold_v - inverter_mppt_optimal_v, 3),
            "mpptOptimalDeltaHotV": round(mppt_string_vmp_hot_v - inverter_mppt_optimal_v, 3),
        },
        "realisticPeakPower": {
            "panelCount": safe_max_series_panels,
            "perPanelWattAtHottestC": hottest["pmaxW"],
            "totalWatt": round(realistic_peak_power_w, 2),
            "totalKw": round(realistic_peak_power_w / 1000.0, 4),
            "method": "safe_max_series_panels * P_max(hottestScenarioC)",
        },
    }
