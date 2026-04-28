from __future__ import annotations

from math import ceil, isfinite, log2, pi, sin, sqrt
from typing import Any

from backend.models.engine_contracts import EngineRequest
from backend.engines.pvlib_engine import CITY_SUMMER_TEMPS


HOURS_PER_YEAR = 8760
MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
DAY_HOURS = {6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17}
NIGHT_HOURS = {0, 1, 2, 3, 4, 5, 18, 19, 20, 21, 22, 23}
PV_DAYLIGHT_HOURS = {5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19}

RESIDENTIAL_LOAD = [
    0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.05, 0.06, 0.04, 0.03, 0.03, 0.03,
    0.04, 0.04, 0.04, 0.04, 0.05, 0.07, 0.08, 0.08, 0.07, 0.06, 0.04, 0.03,
]
COMMERCIAL_LOAD = [
    0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.07, 0.08, 0.08, 0.08,
    0.08, 0.08, 0.08, 0.08, 0.07, 0.06, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01,
]
HOURLY_SOLAR_PROFILE = {
    "summer": [0, 0, 0, 0, 0, 0.02, 0.08, 0.18, 0.35, 0.55, 0.75, 0.90, 0.95, 1.00, 0.95, 0.88, 0.72, 0.50, 0.28, 0.10, 0.02, 0, 0, 0],
    "winter": [0, 0, 0, 0, 0, 0, 0, 0.05, 0.15, 0.32, 0.52, 0.70, 0.78, 0.75, 0.65, 0.45, 0.22, 0.05, 0, 0, 0, 0, 0, 0],
    "spring": [0, 0, 0, 0, 0, 0.01, 0.05, 0.14, 0.28, 0.48, 0.68, 0.82, 0.90, 0.92, 0.85, 0.70, 0.50, 0.30, 0.12, 0.03, 0, 0, 0, 0],
    "autumn": [0, 0, 0, 0, 0, 0, 0.02, 0.10, 0.22, 0.40, 0.58, 0.72, 0.77, 0.74, 0.63, 0.46, 0.26, 0.08, 0.01, 0, 0, 0, 0, 0],
}

DEVICE_LOAD_TEMPLATES = {
    "lighting": [0.005, 0.005, 0.005, 0.005, 0.005, 0.010, 0.020, 0.030, 0.020, 0.015, 0.015, 0.015, 0.015, 0.015, 0.015, 0.020, 0.030, 0.060, 0.080, 0.085, 0.085, 0.075, 0.060, 0.025],
    "refrigerator": [0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0413],
    "hvac": [0.000, 0.000, 0.000, 0.000, 0.000, 0.005, 0.015, 0.040, 0.070, 0.090, 0.090, 0.085, 0.085, 0.080, 0.075, 0.070, 0.065, 0.060, 0.065, 0.070, 0.065, 0.035, 0.005, 0.000],
    "security": [0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0417, 0.0413],
    "pump": [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.050, 0.120, 0.140, 0.140, 0.140, 0.120, 0.100, 0.100, 0.100, 0.090, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
    "entertainment": [0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.010, 0.020, 0.030, 0.030, 0.030, 0.030, 0.030, 0.030, 0.030, 0.030, 0.040, 0.075, 0.105, 0.120, 0.120, 0.100, 0.065, 0.025],
    "kitchen": [0.000, 0.000, 0.000, 0.000, 0.000, 0.010, 0.080, 0.120, 0.080, 0.050, 0.030, 0.030, 0.080, 0.100, 0.060, 0.030, 0.020, 0.060, 0.090, 0.090, 0.060, 0.040, 0.020, 0.000],
    "laundry": [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.010, 0.040, 0.100, 0.130, 0.130, 0.120, 0.110, 0.110, 0.100, 0.090, 0.060, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
    "workshop": [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.010, 0.120, 0.140, 0.140, 0.140, 0.110, 0.110, 0.110, 0.110, 0.010, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
    "gaming": [0.005, 0.005, 0.005, 0.005, 0.005, 0.000, 0.000, 0.000, 0.010, 0.020, 0.020, 0.020, 0.020, 0.020, 0.020, 0.020, 0.040, 0.070, 0.110, 0.140, 0.145, 0.130, 0.090, 0.050],
    "generic": [0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.034],
}

SEASONAL_LOAD_FACTORS = {
    "lighting": {"summer": 0.65, "spring": 0.85, "autumn": 0.90, "winter": 1.25},
    "refrigerator": {"summer": 1.15, "spring": 1.00, "autumn": 1.00, "winter": 0.85},
    "hvac": {"summer": 2.00, "spring": 0.55, "autumn": 0.60, "winter": 0.85},
    "security": {"summer": 1.00, "spring": 1.00, "autumn": 1.00, "winter": 1.00},
    "pump": {"summer": 1.60, "spring": 1.20, "autumn": 0.40, "winter": 0.00},
    "entertainment": {"summer": 0.85, "spring": 1.00, "autumn": 1.05, "winter": 1.10},
    "kitchen": {"summer": 1.00, "spring": 1.00, "autumn": 1.00, "winter": 1.00},
    "laundry": {"summer": 1.00, "spring": 1.00, "autumn": 1.00, "winter": 1.00},
    "workshop": {"summer": 1.00, "spring": 1.05, "autumn": 1.00, "winter": 0.95},
    "gaming": {"summer": 0.85, "spring": 1.00, "autumn": 1.05, "winter": 1.10},
    "generic": {"summer": 1.00, "spring": 1.00, "autumn": 1.00, "winter": 1.00},
}

CATEGORY_SURGE_MULTIPLIERS = {
    "lighting": 1.0,
    "refrigerator": 1.5,
    "hvac": 1.8,
    "security": 1.0,
    "pump": 2.5,
    "entertainment": 1.1,
    "kitchen": 1.2,
    "laundry": 1.4,
    "workshop": 1.5,
    "gaming": 1.1,
    "generic": 1.0,
}

USAGE_TYPE_PEAK_FACTORS = {
    "continuous": 1.02,
    "cyclic": 1.18,
    "scheduled": 1.14,
    "manual": 1.22,
}

CATEGORY_PEAK_RISK_FACTORS = {
    "lighting": 1.06,
    "refrigerator": 1.08,
    "hvac": 1.15,
    "security": 1.03,
    "pump": 1.20,
    "entertainment": 1.08,
    "kitchen": 1.16,
    "laundry": 1.18,
    "workshop": 1.20,
    "gaming": 1.10,
    "generic": 1.08,
}

SYNTHETIC_PV_REGIME_LIBRARY = {
    "winter": [
        {"key": "storm", "multiplier": 0.03, "shapeExponent": 0.72},
        {"key": "overcast", "multiplier": 0.10, "shapeExponent": 0.82},
        {"key": "broken-cloud", "multiplier": 0.24, "shapeExponent": 0.92},
        {"key": "mixed", "multiplier": 0.46, "shapeExponent": 1.00},
        {"key": "clear", "multiplier": 0.78, "shapeExponent": 1.10},
        {"key": "clear-cold", "multiplier": 1.06, "shapeExponent": 1.18},
    ],
    "spring": [
        {"key": "storm", "multiplier": 0.05, "shapeExponent": 0.76},
        {"key": "overcast", "multiplier": 0.16, "shapeExponent": 0.88},
        {"key": "broken-cloud", "multiplier": 0.34, "shapeExponent": 0.97},
        {"key": "mixed", "multiplier": 0.58, "shapeExponent": 1.02},
        {"key": "clear", "multiplier": 0.86, "shapeExponent": 1.10},
        {"key": "clear-bright", "multiplier": 1.10, "shapeExponent": 1.18},
    ],
    "summer": [
        {"key": "storm", "multiplier": 0.08, "shapeExponent": 0.82},
        {"key": "overcast", "multiplier": 0.22, "shapeExponent": 0.92},
        {"key": "broken-cloud", "multiplier": 0.44, "shapeExponent": 1.00},
        {"key": "mixed", "multiplier": 0.66, "shapeExponent": 1.06},
        {"key": "clear", "multiplier": 0.90, "shapeExponent": 1.14},
        {"key": "clear-high", "multiplier": 1.06, "shapeExponent": 1.22},
    ],
    "autumn": [
        {"key": "storm", "multiplier": 0.04, "shapeExponent": 0.74},
        {"key": "overcast", "multiplier": 0.13, "shapeExponent": 0.84},
        {"key": "broken-cloud", "multiplier": 0.28, "shapeExponent": 0.94},
        {"key": "mixed", "multiplier": 0.50, "shapeExponent": 1.00},
        {"key": "clear", "multiplier": 0.80, "shapeExponent": 1.10},
        {"key": "clear-crisp", "multiplier": 1.04, "shapeExponent": 1.16},
    ],
}

SYNTHETIC_PV_REGIME_PATTERNS = {
    "winter": [5, 4, 2, 1, 0, 1, 2, 4, 5, 3, 2, 1, 0, 2],
    "spring": [4, 5, 3, 2, 1, 2, 3, 5, 4, 3, 2, 4],
    "summer": [5, 5, 4, 3, 2, 3, 4, 5, 5, 4, 3, 5],
    "autumn": [4, 3, 1, 0, 1, 2, 3, 4, 2, 1, 3, 5],
}

BAD_WEATHER_CONFIG = {
    "light": {"days": 5, "pvFactor": 0.15},
    "moderate": {"days": 10, "pvFactor": 0.05},
    "severe": {"days": 15, "pvFactor": 0.0},
}

OFFGRID_STRESS_SCENARIOS = [
    {"key": "low-pv-year", "label": "Low PV year", "pvFactor": 0.90, "loadFactor": 1.00, "criticalLoadFactor": 1.00, "batteryEol": False},
    {"key": "load-growth", "label": "Load growth", "pvFactor": 1.00, "loadFactor": 1.15, "criticalLoadFactor": 1.15, "batteryEol": False},
    {"key": "battery-eol", "label": "Battery end-of-life", "pvFactor": 1.00, "loadFactor": 1.00, "criticalLoadFactor": 1.00, "batteryEol": True},
    {"key": "combined-design-stress", "label": "Combined design stress", "pvFactor": 0.85, "loadFactor": 1.15, "criticalLoadFactor": 1.15, "batteryEol": True},
]

DEFAULT_FIELD_MODEL_THRESHOLDS = {
    "criticalCoverageMin": 0.999,
    "totalCoverageMin": 0.98,
    "unmetCriticalMaxKwh": 1.0,
    "generatorCriticalPeakReservePct": 0.10,
}

BATTERY_DYNAMIC_EFFICIENCY_PRESETS = {
    "LFP": {"chargeRatePenalty": 0.040, "dischargeRatePenalty": 0.055, "topSocPenalty": 0.022, "lowSocPenalty": 0.042},
    "NMC": {"chargeRatePenalty": 0.050, "dischargeRatePenalty": 0.068, "topSocPenalty": 0.030, "lowSocPenalty": 0.055},
    "AGM": {"chargeRatePenalty": 0.070, "dischargeRatePenalty": 0.090, "topSocPenalty": 0.040, "lowSocPenalty": 0.080},
    "GEL": {"chargeRatePenalty": 0.070, "dischargeRatePenalty": 0.090, "topSocPenalty": 0.040, "lowSocPenalty": 0.080},
    "LEAD_ACID": {"chargeRatePenalty": 0.075, "dischargeRatePenalty": 0.095, "topSocPenalty": 0.045, "lowSocPenalty": 0.085},
    "DEFAULT": {"chargeRatePenalty": 0.045, "dischargeRatePenalty": 0.060, "topSocPenalty": 0.026, "lowSocPenalty": 0.048},
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def finite(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return numeric if isfinite(numeric) else default


def complete_hourly(values: Any) -> list[float] | None:
    if not isinstance(values, list) or len(values) < HOURS_PER_YEAR:
        return None
    normalized = [max(0.0, finite(value, 0.0)) for value in values[:HOURS_PER_YEAR]]
    return normalized


def sum_positive(values: list[float]) -> float:
    return sum(max(0.0, finite(value, 0.0)) for value in values)


def get_load_season_for_month(month_idx: int) -> str:
    if month_idx == 11 or month_idx <= 1:
        return "winter"
    if 2 <= month_idx <= 4:
        return "spring"
    if 5 <= month_idx <= 7:
        return "summer"
    return "autumn"


def normalize_profile(values: list[float], allowed_hours: set[int] | None = None) -> list[float]:
    safe = []
    for hour in range(24):
        raw = values[hour] if hour < len(values) else 0.0
        safe.append(max(0.0, finite(raw, 0.0)) if allowed_hours is None or hour in allowed_hours else 0.0)
    total = sum(safe)
    if total <= 0:
        active_hours = list(allowed_hours or set(range(24)))
        return [1 / len(active_hours) if hour in active_hours else 0 for hour in range(24)]
    return [value / total for value in safe]


def exact_masked_template(raw_template: list[float], hour_set: set[int]) -> list[float]:
    return normalize_profile(raw_template, hour_set)


def blend_day_night_template(raw_template: list[float], day_hours: float, night_hours: float) -> list[float]:
    if night_hours > 0 and day_hours > 0:
        day_template = exact_masked_template(raw_template, DAY_HOURS)
        night_template = exact_masked_template(raw_template, NIGHT_HOURS)
        total_hours = day_hours + night_hours
        day_fraction = day_hours / total_hours if total_hours > 0 else 1.0
        night_fraction = night_hours / total_hours if total_hours > 0 else 0.0
        return [day_template[idx] * day_fraction + night_template[idx] * night_fraction for idx in range(24)]
    if night_hours > 0 and day_hours <= 0:
        return exact_masked_template(raw_template, NIGHT_HOURS)
    return normalize_profile(raw_template)


def month_totals_from_hourly(hourly8760: list[float]) -> list[float]:
    monthly: list[float] = []
    cursor = 0
    for days in MONTH_DAYS:
        hours = days * 24
        monthly.append(sum_positive(hourly8760[cursor:cursor + hours]))
        cursor += hours
    return monthly


def reshape_solar_day_profile(base_profile: list[float], exponent: float) -> list[float]:
    adjusted = [pow(value, exponent) if value > 0 else 0.0 for value in base_profile]
    return normalize_profile(adjusted, PV_DAYLIGHT_HOURS)


def synthetic_city_summer_peak(city_name: str | None = None) -> float:
    return clamp(finite(CITY_SUMMER_TEMPS.get(city_name or "", CITY_SUMMER_TEMPS["default"]), CITY_SUMMER_TEMPS["default"]), 20.0, 42.0)


def synthetic_ambient_temperature_c(day_of_year: int, hour: int, city_name: str | None = None) -> float:
    summer_peak = synthetic_city_summer_peak(city_name)
    winter_trough = clamp(summer_peak - 22.0, 4.0, 18.0)
    seasonal_mean = (summer_peak + winter_trough) / 2
    seasonal_amplitude = (summer_peak - winter_trough) / 2
    seasonal = seasonal_mean + seasonal_amplitude * sin((2 * pi * (day_of_year - 172)) / 365)
    diurnal = 4.5 * sin((2 * pi * (hour - 9)) / 24)
    return seasonal + diurnal


def apply_synthetic_temperature_shaping(profile24: list[float], day_of_year: int, city_name: str | None = None, panel_temp_coeff_per_c: float | None = None) -> tuple[list[float], list[dict[str, float] | None]]:
    gamma = finite(panel_temp_coeff_per_c, -0.0034)
    max_weight = max(profile24) if profile24 else 1.0
    max_weight = max(max_weight, 1e-9)
    factors: list[dict[str, float] | None] = []
    shaped = []
    for hour, weight in enumerate(profile24):
        if weight <= 0:
            factors.append(None)
            shaped.append(0.0)
            continue
        irradiance_fraction = clamp(weight / max_weight, 0.0, 1.25)
        ambient_temp_c = synthetic_ambient_temperature_c(day_of_year, hour, city_name)
        cell_temp_c = ambient_temp_c + (irradiance_fraction * 18.0) + 2.0
        factor = clamp(1 + (gamma * (cell_temp_c - 25.0)), 0.82, 1.08)
        factors.append({"factor": factor, "ambientTempC": ambient_temp_c, "cellTempC": cell_temp_c})
        shaped.append(weight * factor)
    return normalize_profile(shaped, PV_DAYLIGHT_HOURS), factors


def build_clustered_pv_from_monthly(monthly_kwh: list[float], city_name: str | None = None, panel_temp_coeff_per_c: float | None = None) -> tuple[list[float], dict[str, Any]]:
    hourly8760: list[float] = []
    daily_totals: list[float] = []
    regime_keys: list[str] = []
    longest_low_cluster_days = 0
    current_low_cluster_days = 0
    minimum_hourly_temp_factor = float("inf")
    maximum_hourly_temp_factor = 0.0
    peak_summer_cell_temp_c = float("-inf")
    peak_summer_noon_temp_factor = 1.0

    for month_idx, monthly_total in enumerate(monthly_kwh[:12]):
        days_in_month = MONTH_DAYS[month_idx]
        season = get_load_season_for_month(month_idx)
        regime_library = SYNTHETIC_PV_REGIME_LIBRARY[season]
        regime_pattern = SYNTHETIC_PV_REGIME_PATTERNS[season]
        base_profile = normalize_profile(HOURLY_SOLAR_PROFILE[season], PV_DAYLIGHT_HOURS)
        day_descriptors = []
        month_day_start = sum(MONTH_DAYS[:month_idx])
        for day_idx in range(days_in_month):
            pattern_idx = (day_idx + (month_idx * 3)) % len(regime_pattern)
            regime = regime_library[regime_pattern[pattern_idx]]
            day_of_year = month_day_start + day_idx + 1
            shaped_profile, hourly_temp_factors = apply_synthetic_temperature_shaping(
                reshape_solar_day_profile(base_profile, regime["shapeExponent"]),
                day_of_year,
                city_name=city_name,
                panel_temp_coeff_per_c=panel_temp_coeff_per_c,
            )
            for entry in hourly_temp_factors:
                if not entry:
                    continue
                minimum_hourly_temp_factor = min(minimum_hourly_temp_factor, entry["factor"])
                maximum_hourly_temp_factor = max(maximum_hourly_temp_factor, entry["factor"])
            noon_entry = hourly_temp_factors[13]
            if 5 <= month_idx <= 7 and noon_entry:
                peak_summer_cell_temp_c = max(peak_summer_cell_temp_c, noon_entry["cellTempC"])
                peak_summer_noon_temp_factor = min(peak_summer_noon_temp_factor, noon_entry["factor"])
            day_descriptors.append(
                {
                    "regimeKey": regime["key"],
                    "multiplier": regime["multiplier"],
                    "profile": shaped_profile,
                }
            )
        monthly_weight = sum(max(0.001, descriptor["multiplier"]) for descriptor in day_descriptors)
        month_scale = max(0.0, finite(monthly_total, 0.0)) / monthly_weight if monthly_weight > 0 else 0.0
        for descriptor in day_descriptors:
            day_energy = month_scale * descriptor["multiplier"]
            daily_totals.append(day_energy)
            regime_keys.append(descriptor["regimeKey"])
            if descriptor["multiplier"] <= 0.16:
                current_low_cluster_days += 1
                longest_low_cluster_days = max(longest_low_cluster_days, current_low_cluster_days)
            else:
                current_low_cluster_days = 0
            for weight in descriptor["profile"]:
                hourly8760.append(day_energy * weight)

    annual_target = sum_positive(monthly_kwh)
    raw_annual = sum_positive(hourly8760)
    scaled_hourly = [value * annual_target / raw_annual for value in hourly8760] if raw_annual > 0 and annual_target > 0 else [0.0] * HOURS_PER_YEAR
    average_daily = annual_target / len(daily_totals) if daily_totals else 0.0
    min_daily = min(daily_totals) if daily_totals else 0.0
    max_daily = max(daily_totals) if daily_totals else 0.0
    metadata = {
        "syntheticWeatherModel": "clustered-seasonal-regime-v1",
        "syntheticTemperatureModel": "city-seasonal-cell-derate-v1",
        "longestLowPvClusterDays": longest_low_cluster_days,
        "minimumDailyPvKwh": min_daily,
        "maximumDailyPvKwh": max_daily,
        "minimumDailyFractionOfAverage": min_daily / average_daily if average_daily > 0 else 0.0,
        "maximumDailyFractionOfAverage": max_daily / average_daily if average_daily > 0 else 0.0,
        "uniqueRegimeCount": len(set(regime_keys)),
        "minimumHourlyTempFactor": minimum_hourly_temp_factor if minimum_hourly_temp_factor != float("inf") else 1.0,
        "maximumHourlyTempFactor": maximum_hourly_temp_factor if maximum_hourly_temp_factor > 0 else 1.0,
        "peakSummerCellTempC": peak_summer_cell_temp_c if peak_summer_cell_temp_c != float("-inf") else None,
        "peakSummerNoonTempFactor": peak_summer_noon_temp_factor,
        "annualEnergyPreserved": True,
    }
    return scaled_hourly, metadata


def seasonal_norm_factors() -> dict[str, float]:
    result: dict[str, float] = {}
    for category, factors in SEASONAL_LOAD_FACTORS.items():
        total = 0.0
        for month_idx, days in enumerate(MONTH_DAYS):
            total += days * finite(factors.get(get_load_season_for_month(month_idx), 1), 1)
        result[category] = total / 365 if total > 0 else 1.0
    return result


SEASONAL_NORM_FACTORS = seasonal_norm_factors()


def build_simple_peak_from_energy(total_hourly: list[float], critical_hourly: list[float]) -> tuple[list[float], list[float]]:
    return [max(0.0, value) for value in total_hourly], [max(0.0, value) for value in critical_hourly]


def device_surge_multiplier(device: dict[str, Any], category: str) -> float:
    explicit = device.get("startupFactor", device.get("surgeMultiplier"))
    if explicit is not None and finite(explicit, 0) > 0:
        return clamp(finite(explicit, 1.0), 1.0, 6.0)
    return CATEGORY_SURGE_MULTIPLIERS.get(category, 1.0)


def synthetic_peak_envelope_factor(device: dict[str, Any], category: str, template_value: float, hours_per_day: float) -> float:
    usage_type = device.get("usageType") or "manual"
    usage_factor = USAGE_TYPE_PEAK_FACTORS.get(usage_type, USAGE_TYPE_PEAK_FACTORS["manual"])
    category_factor = CATEGORY_PEAK_RISK_FACTORS.get(category, CATEGORY_PEAK_RISK_FACTORS["generic"])
    normalized_hours = clamp(hours_per_day / 24 if hours_per_day > 0 else 0, 0, 1)
    sparse_use_boost = 1 + ((1 - normalized_hours) * 0.22)
    concentration_boost = 1 + max(0.0, (template_value - (1 / 24)) * 1.6)
    quantity = max(1, int(round(finite(device.get("quantity"), 1))))
    quantity_boost = 1 + min(0.18, log2(quantity) * 0.05) if quantity > 1 else 1.0
    return clamp(usage_factor * category_factor * sparse_use_boost * concentration_boost * quantity_boost, 1.0, 1.9)


def battery_dynamic_efficiency_preset(chemistry: str | None = None) -> dict[str, float]:
    key = str(chemistry or "").strip().upper().replace("-", "_")
    return BATTERY_DYNAMIC_EFFICIENCY_PRESETS.get(key, BATTERY_DYNAMIC_EFFICIENCY_PRESETS["DEFAULT"])


def resolve_dynamic_battery_efficiency(
    mode: str = "discharge",
    base_efficiency: float = 0.95,
    soc_kwh: float = 0.0,
    usable_capacity_kwh: float = 0.0,
    soc_reserve_kwh: float = 0.0,
    power_kw: float = 0.0,
    max_power_kw: float | None = None,
    chemistry: str | None = None,
    enabled: bool = True,
) -> float:
    base = clamp(finite(base_efficiency, 0.95), 0.5, 1.0)
    if not enabled or usable_capacity_kwh <= 0 or power_kw <= 1e-9:
        return base
    preset = battery_dynamic_efficiency_preset(chemistry)
    derived_max_power = max_power_kw if max_power_kw is not None and max_power_kw > 0 else max(0.1, usable_capacity_kwh * 0.5)
    normalized_power = clamp(power_kw / derived_max_power, 0.0, 1.5)
    rate_penalty = pow(normalized_power, 1.35) * (preset["chargeRatePenalty"] if mode == "charge" else preset["dischargeRatePenalty"])
    if mode == "charge":
        soc_ratio = clamp((soc_kwh / usable_capacity_kwh) if usable_capacity_kwh > 0 else 0.0, 0.0, 1.0)
        soc_stress = clamp((soc_ratio - 0.82) / 0.18, 0.0, 1.0)
        soc_penalty = soc_stress * preset["topSocPenalty"]
    else:
        available_band = max(1e-6, usable_capacity_kwh - soc_reserve_kwh)
        dischargeable_soc = clamp((soc_kwh - soc_reserve_kwh) / available_band, 0.0, 1.0)
        soc_stress = clamp((0.18 - dischargeable_soc) / 0.18, 0.0, 1.0)
        soc_penalty = soc_stress * preset["lowSocPenalty"]
    return clamp(base * (1 - rate_penalty - soc_penalty), 0.5, 1.0)


def clamp_score(value: float) -> int:
    return int(clamp(round(finite(value, 0.0)), 0, 100))


def uncertainty_for_score(score: int, tier: str) -> dict[str, int]:
    if tier == "field-validated":
        return {"lowPct": 3, "highPct": 8}
    if score >= 85:
        return {"lowPct": 5, "highPct": 12}
    if score >= 75:
        return {"lowPct": 8, "highPct": 18}
    if score >= 65:
        return {"lowPct": 12, "highPct": 28}
    if score >= 55:
        return {"lowPct": 20, "highPct": 40}
    if score >= 45:
        return {"lowPct": 30, "highPct": 55}
    return {"lowPct": 40, "highPct": 70}


def build_accuracy_assessment(
    production_profile: dict[str, Any],
    load_profile: dict[str, Any],
    battery: dict[str, Any],
    generator: dict[str, Any],
    dispatch_options: dict[str, Any],
    calculation_mode: str = "basic",
    bad_weather_enabled: bool = False,
) -> dict[str, Any]:
    factors = []
    blockers = []
    score = 20

    def add(points: float, key: str, note: str) -> None:
        nonlocal score
        score += points
        factors.append({"key": key, "points": points, "note": note})

    def penalize(points: float, key: str, note: str) -> None:
        nonlocal score
        score -= abs(points)
        factors.append({"key": key, "points": -abs(points), "note": note})

    if production_profile.get("hasRealHourlyProduction"):
        add(25, "real-hourly-pv", "Gercek 8760 PV uretim serisi kullanildi.")
    elif production_profile.get("productionDispatchProfile") == "monthly-production-derived-synthetic-8760":
        add(10, "synthetic-hourly-pv", "PV saatleri aylik uretimden sentetik 8760 profile dagitildi.")
        blockers.append("Gercek 8760 PV uretimi yok; uretim saat ici dagilimi sentetik.")
    else:
        blockers.append("Dispatch icin guvenilir PV saatlik serisi yok.")

    if production_profile.get("productionFallback") or production_profile.get("fallbackUsed"):
        penalize(5, "production-fallback", "Canli/authoritative uretim yerine fallback uretim kullanildi.")

    if load_profile.get("hasRealHourlyLoad"):
        add(24, "real-hourly-load", "Gercek 8760 toplam yuk profili kullanildi.")
    elif load_profile.get("mode") == "device-list":
        add(14, "device-library-load", "Cihaz kutuphanesi ve manuel cihazlar sentetik saatlik yuke cevrildi.")
        blockers.append("Cihaz kutuphanesi gercek sayac profili degildir; kullanim saatleri kullanici beyanina dayanir.")
    else:
        add(8, "daily-kwh-load", "Gunluk toplam tuketim varsayilan profil ile 8760 saate dagitildi.")
        blockers.append("Gercek yuk profili veya cihaz envanteri yok; gunluk tuketim varsayilan profil ile dagitildi.")

    critical_basis = load_profile.get("criticalLoadBasis")
    if critical_basis == "real-hourly-critical-load":
        add(14, "real-critical-load", "Kritik yuk ayri 8760 seriyle verildi.")
    elif critical_basis == "device-critical-flags":
        add(8, "device-critical-flags", "Kritik yuk cihaz isaretlerinden turetildi.")
        blockers.append("Kritik yuk onceligi cihaz isaretlerine dayanir; kritik yuk saha olcumu degildir.")
    elif critical_basis == "fraction-of-real-hourly-load":
        add(7, "critical-fraction-real-load", "Gercek toplam yukten kritik oran turetildi.")
        blockers.append("Kritik yuk ayri olculmedi; toplam yukten oranla turetildi.")
    else:
        add(4, "critical-fraction-synthetic", "Kritik yuk oran varsayimiyla turetildi.")
        blockers.append("Kritik yuk gercek cihaz/saha profili degil; oran varsayimi kullanildi.")

    if finite(battery.get("maxChargePowerKw", battery.get("maxChargeKw")), float("nan")) == finite(
        battery.get("maxChargePowerKw", battery.get("maxChargeKw")), float("nan")
    ):
        add(3, "battery-charge-limit", "Batarya sarj kW limiti dispatch icine girdi.")
    else:
        blockers.append("Batarya sarj kW limiti eksik; sarj gucu sinirsiz varsayilabilir.")
    if finite(battery.get("maxDischargePowerKw", battery.get("maxDischargeKw")), float("nan")) == finite(
        battery.get("maxDischargePowerKw", battery.get("maxDischargeKw")), float("nan")
    ):
        add(3, "battery-discharge-limit", "Batarya desarj kW limiti dispatch icine girdi.")
    else:
        blockers.append("Batarya desarj kW limiti eksik; pik yuk yeterliligi oldugundan iyi gorunebilir.")
    inverter_limit = dispatch_options.get("inverterAcLimitKw")
    if isfinite(finite(inverter_limit, float("nan"))):
        add(3, "inverter-ac-limit", "Inverter AC limiti ve surge varsayimi uygulandi.")
    else:
        blockers.append("Inverter AC limiti eksik; guc limiti kaynakli unmet yuk kacabilir.")
    if bad_weather_enabled:
        add(3, "bad-weather-dispatch", "Kotu hava penceresi dispatch yeniden cozulerek test edildi.")

    generator_enabled = bool(generator and generator.get("enabled") and finite(generator.get("capacityKw"), 0.0) > 0)
    if generator_enabled and finite(generator.get("fuelCostPerKwh"), 0.0) > 0:
        add(2, "generator-cost", "Jenerator enerji ve yakit maliyeti dispatch sonucuna bagli.")
    elif generator_enabled:
        blockers.append("Jenerator etkin ama yakit maliyeti eksik veya sifir; ekonomi oldugundan iyi gorunebilir.")

    tier = "basic-synthetic"
    if load_profile.get("mode") == "device-list":
        tier = "device-library"
    if production_profile.get("hasRealHourlyProduction") or load_profile.get("hasRealHourlyLoad"):
        tier = "advanced-hourly"
    if (
        production_profile.get("hasRealHourlyProduction")
        and load_profile.get("hasRealHourlyLoad")
        and critical_basis == "real-hourly-critical-load"
        and isfinite(finite(battery.get("maxChargePowerKw", battery.get("maxChargeKw")), float("nan")))
        and isfinite(finite(battery.get("maxDischargePowerKw", battery.get("maxDischargeKw")), float("nan")))
        and isfinite(finite(inverter_limit, float("nan")))
    ):
        tier = "field-input-ready"

    if calculation_mode == "advanced" and tier == "basic-synthetic":
        blockers.append("Ileri mod secildi ama gercek 8760 veya cihaz envanteri girilmedi; sonuc basit sentetik seviyede kaldi.")
        penalize(4, "advanced-request-missing-data", "Ileri mod icin beklenen veri seti eksik.")

    accuracy_score = clamp_score(score)
    uncertainty = uncertainty_for_score(accuracy_score, tier)
    confidence_level = (
        "high"
        if accuracy_score >= 85
        else "medium-high"
        if accuracy_score >= 70
        else "medium"
        if accuracy_score >= 55
        else "low"
        if accuracy_score >= 40
        else "very-low"
    )

    interpretation = (
        "Saatlik girdiler guclu; yine de saha kabul ve operasyon kaniti olmadan garanti degildir."
        if accuracy_score >= 85
        else "Muhendislik on tasarimina yaklasir; kritik yuk ve kotu hava kararlari icin saha verisi gerekir."
        if accuracy_score >= 65
        else "On fizibilite icin kullanilabilir; batarya/jenerator yeterliliginde cift haneli sapma beklenebilir."
        if accuracy_score >= 50
        else "Kaba on fizibilite; dispatch sonucu karar degil, veri toplama yonlendirmesidir."
    )

    return {
        "version": "OFFGRID-ACCURACY-2026.04-v1",
        "calculationMode": calculation_mode,
        "tier": tier,
        "accuracyScore": accuracy_score,
        "confidenceLevel": confidence_level,
        "expectedUncertaintyPct": uncertainty,
        "errorIsNotBounded": True,
        "interpretation": interpretation,
        "factors": factors,
        "blockers": list(dict.fromkeys(blockers)),
    }


def build_field_model_maturity_gate(
    stress_analysis: dict[str, Any],
    phase1_ready: bool = False,
    phase2_ready: bool = False,
    generator: dict[str, Any] | None = None,
    thresholds: dict[str, float] | None = None,
) -> dict[str, Any]:
    applied_thresholds = thresholds or DEFAULT_FIELD_MODEL_THRESHOLDS
    blockers = []
    warnings = []
    scenarios = stress_analysis.get("scenarios") if isinstance(stress_analysis, dict) else None
    scenarios = scenarios if isinstance(scenarios, list) else []
    gen_enabled = bool(generator and generator.get("enabled") and finite(generator.get("capacityKw"), 0.0) > 0)

    if not phase1_ready:
        blockers.append("Faz 1 saatlik dispatch girdileri tamamlanmadan Faz 3 model olgunlugu kabul edilemez.")
    if not phase2_ready:
        blockers.append("Faz 2 dogrulanmis saha kanitlari tamamlanmadan Faz 3 model olgunlugu kabul edilemez.")
    if not scenarios:
        blockers.append("Faz 3 stres senaryolari calistirilmadi.")

    for row in scenarios:
        if finite(row.get("criticalLoadCoverage"), 0.0) < applied_thresholds["criticalCoverageMin"]:
            blockers.append(
                f'{row.get("key")}: kritik yuk kapsamasi {(finite(row.get("criticalLoadCoverage"), 0.0) * 100):.2f}%; '
                f'esik {(applied_thresholds["criticalCoverageMin"] * 100):.2f}%.'
            )
        if finite(row.get("unmetCriticalKwh"), 0.0) > applied_thresholds["unmetCriticalMaxKwh"]:
            blockers.append(
                f'{row.get("key")}: karsilanamayan kritik yuk {round(finite(row.get("unmetCriticalKwh"), 0.0))} kWh/yil; '
                f'esik {applied_thresholds["unmetCriticalMaxKwh"]} kWh/yil.'
            )
        if finite(row.get("totalLoadCoverage"), 0.0) < applied_thresholds["totalCoverageMin"]:
            blockers.append(
                f'{row.get("key")}: toplam yuk kapsamasi {(finite(row.get("totalLoadCoverage"), 0.0) * 100):.2f}%; '
                f'esik {(applied_thresholds["totalCoverageMin"] * 100):.2f}%.'
            )
        if finite(row.get("inverterPowerLimitedKwh"), 0.0) > 0:
            warnings.append(f'{row.get("key")}: inverter guc limiti {round(finite(row.get("inverterPowerLimitedKwh"), 0.0))} kWh/yil yuku etkiliyor.')
        if finite(row.get("batteryDischargeLimitedKwh"), 0.0) > 0:
            warnings.append(f'{row.get("key")}: batarya desarj kW limiti {round(finite(row.get("batteryDischargeLimitedKwh"), 0.0))} kWh/yil yuku etkiliyor.')

    if gen_enabled:
        reserve = stress_analysis.get("generatorCriticalPeakReservePct") if isinstance(stress_analysis, dict) else None
        if reserve is None or finite(reserve, -1.0) < applied_thresholds["generatorCriticalPeakReservePct"]:
            blockers.append(
                f'Jenerator kritik pik yuk icin en az %{round(applied_thresholds["generatorCriticalPeakReservePct"] * 100)} kapasite payi saglamiyor.'
            )
    elif any(finite(row.get("unmetCriticalKwh"), 0.0) > applied_thresholds["unmetCriticalMaxKwh"] for row in scenarios):
        blockers.append("Jenerator yokken stres senaryolarinda kritik yuk karsilanamiyor.")

    unique_blockers = list(dict.fromkeys(blockers))
    unique_warnings = list(dict.fromkeys(warnings))
    phase3_ready = len(unique_blockers) == 0
    return {
        "version": "OGD-FIELD-MODEL-2026.04-v3",
        "status": "phase3-ready" if phase3_ready else "blocked",
        "phase3Ready": phase3_ready,
        "stressReady": len(scenarios) > 0 and phase3_ready,
        "fieldGuaranteeReady": False,
        "thresholds": applied_thresholds,
        "blockers": unique_blockers,
        "warnings": unique_warnings,
        "worstCriticalScenario": stress_analysis.get("worstCriticalScenario") if isinstance(stress_analysis, dict) else None,
        "worstTotalScenario": stress_analysis.get("worstTotalScenario") if isinstance(stress_analysis, dict) else None,
        "maxUnmetCriticalScenario": stress_analysis.get("maxUnmetCriticalScenario") if isinstance(stress_analysis, dict) else None,
        "generatorCriticalPeakReservePct": stress_analysis.get("generatorCriticalPeakReservePct") if isinstance(stress_analysis, dict) else None,
    }


def summarize_synthetic_peak_model(
    mode: str,
    baseline_peak: list[float],
    total_peak: list[float],
    critical_peak: list[float],
    calibration_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    max_baseline = max(baseline_peak) if baseline_peak else 0.0
    max_total = max(total_peak) if total_peak else 0.0
    max_critical = max(critical_peak) if critical_peak else 0.0
    peak_envelope_hours = sum(1 for idx, value in enumerate(total_peak) if value > (baseline_peak[idx] if idx < len(baseline_peak) else 0) + 1e-9)
    max_factor = (max_total / max_baseline) if max_baseline > 0 else 1.0
    severity = calibration_meta.get("forcedSeverity") if calibration_meta else None
    if not severity:
        severity = "high" if max_factor >= 1.35 else "medium" if max_factor >= 1.18 else "low"
    return {
        "peakModel": "field-calibrated-peak-envelope" if calibration_meta and calibration_meta.get("applied")
        else ("synthetic-conservative-envelope" if mode == "device-list" else "energy-shaped-fallback-peak"),
        "peakEnvelopeApplied": mode == "device-list" or bool(calibration_meta and calibration_meta.get("applied")),
        "severity": severity,
        "peakEnvelopeHours": peak_envelope_hours,
        "peakEnvelopeMaxFactor": max_factor,
        "maxBaselinePeakKw": max_baseline,
        "maxSyntheticPeakKw": max_total,
        "maxCriticalPeakKw": max_critical,
        "peakDeltaKw": max(0.0, max_total - max_baseline),
        "fieldCalibration": calibration_meta or None,
    }


def peak_array_percentile(values: list[float], percentile_value: float = 0.95) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(max(0.0, finite(value, 0.0)) for value in values)
    idx = min(len(sorted_values) - 1, max(0, int((len(sorted_values) - 1) * percentile_value)))
    return sorted_values[idx]


def round_up_to_step(value: float, step: float = 0.1) -> float:
    numeric = max(0.0, finite(value, 0.0))
    safe_step = max(0.001, finite(step, 0.1))
    return ceil(numeric / safe_step) * safe_step


def apply_field_peak_calibration(
    mode: str,
    hourly_peak: list[float],
    critical_peak: list[float],
    baseline_peak: list[float] | None = None,
    field_import_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    high_res = (field_import_summary or {}).get("highResolutionLoad") or {}
    inverter_log = (field_import_summary or {}).get("inverterEventLog") or {}
    if not high_res.get("sampleCount"):
        return {
            "hourlyPeakKw8760": hourly_peak,
            "criticalPeakKw8760": critical_peak,
            "baselinePeakKw8760": baseline_peak or [],
            "calibrationMeta": None,
        }

    current_max_peak = max((max(0.0, finite(value, 0.0)) for value in hourly_peak), default=0.0)
    current_p95_peak = peak_array_percentile(hourly_peak, 0.95)
    observed_peak_kw = max(0.0, finite(high_res.get("observedPeakKw"), 0.0))
    observed_p95_kw = max(0.0, finite(high_res.get("p95Kw"), 0.0))
    trip_count = max(0, int(finite(inverter_log.get("tripCount"), 0.0)))
    overload_count = max(0, int(finite(inverter_log.get("overloadCount"), 0.0)))
    peak_match_factor = (observed_peak_kw / current_max_peak) if current_max_peak > 0 and observed_peak_kw > 0 else 1.0
    p95_match_factor = (observed_p95_kw / current_p95_peak) if current_p95_peak > 0 and observed_p95_kw > 0 else 1.0
    event_penalty_factor = 1 + min(0.35, (trip_count * 0.08) + (overload_count * 0.05))
    calibration_factor = clamp(max(1.0, peak_match_factor, p95_match_factor) * event_penalty_factor, 1.0, 2.5)
    meta = {
        "mode": mode,
        "observedPeakKw": observed_peak_kw,
        "observedP95Kw": observed_p95_kw,
        "tripCount": trip_count,
        "overloadCount": overload_count,
        "intervalMinutes": finite(high_res.get("intervalMinutes"), 0.0),
        "durationDays": finite(high_res.get("durationDays"), 0.0),
        "calibrationFactor": calibration_factor if calibration_factor > 1.001 else 1.0,
        "eventPenaltyFactor": event_penalty_factor,
        "applied": calibration_factor > 1.001,
        "forcedSeverity": "high" if trip_count > 0 or overload_count >= 2 else ("medium" if calibration_factor >= 1.18 else "low"),
    }
    if calibration_factor <= 1.001:
        return {
            "hourlyPeakKw8760": hourly_peak,
            "criticalPeakKw8760": critical_peak,
            "baselinePeakKw8760": baseline_peak or [],
            "calibrationMeta": meta,
        }

    scaled_hourly = [max(0.0, finite(value, 0.0)) * calibration_factor for value in hourly_peak]
    scaled_critical = [min(scaled_hourly[idx], max(0.0, finite(value, 0.0)) * calibration_factor) for idx, value in enumerate(critical_peak)]
    return {
        "hourlyPeakKw8760": scaled_hourly,
        "criticalPeakKw8760": scaled_critical,
        "baselinePeakKw8760": baseline_peak or [max(0.0, finite(value, 0.0)) for value in hourly_peak],
        "calibrationMeta": meta,
    }


def build_offgrid_design_corrections(
    dispatch: dict[str, Any],
    load_profile: dict[str, Any],
    field_import_summary: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    high_res = (field_import_summary or {}).get("highResolutionLoad") or {}
    inverter_log = (field_import_summary or {}).get("inverterEventLog") or {}
    synthetic_peak_model = load_profile.get("syntheticPeakModel") or {}
    calibration = synthetic_peak_model.get("fieldCalibration") or {}
    hourly_peak = load_profile.get("hourlyPeakKw8760") if isinstance(load_profile.get("hourlyPeakKw8760"), list) else []
    critical_peak = load_profile.get("criticalPeakKw8760") if isinstance(load_profile.get("criticalPeakKw8760"), list) else []
    current_inverter_ac_kw = max(0.0, finite(dispatch.get("inverterAcLimitKw"), 0.0))
    current_surge_multiplier = max(1.0, finite(dispatch.get("inverterSurgeMultiplier"), 1.0))
    current_surge_limit_kw = max(0.0, finite(dispatch.get("inverterSurgeLimitKw"), current_inverter_ac_kw * current_surge_multiplier))
    current_battery_max_discharge_kw = max(0.0, finite(dispatch.get("maxDischargePowerKw"), 0.0))
    inverter_power_limited_kwh = max(0.0, finite(dispatch.get("inverterPowerLimitedLoadKwh"), 0.0))
    inverter_power_limit_hours = max(0.0, finite(dispatch.get("inverterPowerLimitHours"), 0.0))
    battery_discharge_limited_kwh = max(0.0, finite(dispatch.get("batteryDischargeLimitedKwh"), 0.0))
    unmet_critical_kwh = max(0.0, finite(dispatch.get("unmetCriticalLoadKwh"), 0.0))
    trip_count = max(0, int(finite(calibration.get("tripCount", inverter_log.get("tripCount")), 0.0)))
    overload_count = max(0, int(finite(calibration.get("overloadCount", inverter_log.get("overloadCount")), 0.0)))
    observed_peak_kw = max(0.0, finite(calibration.get("observedPeakKw", high_res.get("observedPeakKw")), 0.0))
    observed_p95_kw = max(0.0, finite(calibration.get("observedP95Kw", high_res.get("p95Kw")), 0.0))
    calibration_factor = max(1.0, finite(calibration.get("calibrationFactor"), 1.0))
    modeled_peak_kw = max(
        finite(synthetic_peak_model.get("maxSyntheticPeakKw"), 0.0),
        peak_array_percentile(hourly_peak, 0.99),
        observed_peak_kw,
    )
    modeled_p95_kw = max(
        peak_array_percentile(hourly_peak, 0.95),
        observed_p95_kw,
    )
    modeled_critical_peak_kw = max(
        finite(synthetic_peak_model.get("maxCriticalPeakKw"), 0.0),
        peak_array_percentile(critical_peak, 0.99),
    )
    modeled_critical_p95_kw = peak_array_percentile(critical_peak, 0.95)
    field_signals_present = bool(high_res.get("sampleCount") or inverter_log.get("eventCount") or calibration)

    required_inverter_ac_kw = max(
        current_inverter_ac_kw,
        modeled_p95_kw * (1.10 if field_signals_present else 1.06),
        modeled_peak_kw * (1.14 if trip_count > 0 or inverter_power_limited_kwh > 0 else (1.10 if synthetic_peak_model.get("peakEnvelopeApplied") else 1.05)),
        modeled_critical_peak_kw * 1.08 if battery_discharge_limited_kwh > 0 else 0.0,
    )
    recommended_inverter_ac_kw = round_up_to_step(required_inverter_ac_kw, 0.1)
    surge_target_from_recommended_ac = (modeled_peak_kw / recommended_inverter_ac_kw) if recommended_inverter_ac_kw > 0 else 1.0
    required_surge_multiplier = clamp(
        max(
            current_surge_multiplier,
            surge_target_from_recommended_ac * (1.08 if trip_count > 0 or overload_count > 0 else 1.03),
            1.35 if trip_count > 0 else 1.20,
            1.25 if overload_count > 0 else 1.0,
        ),
        1.0,
        3.0,
    )
    recommended_surge_multiplier = round_up_to_step(required_surge_multiplier, 0.05)

    required_battery_max_discharge_kw = max(
        current_battery_max_discharge_kw,
        modeled_critical_p95_kw * 1.08,
        modeled_critical_peak_kw * (1.12 if battery_discharge_limited_kwh > 0 or unmet_critical_kwh > 0 else 1.05),
    )
    recommended_battery_max_discharge_kw = round_up_to_step(required_battery_max_discharge_kw, 0.1)

    delta_inverter_ac_kw = max(0.0, recommended_inverter_ac_kw - current_inverter_ac_kw)
    delta_surge_multiplier = max(0.0, recommended_surge_multiplier - current_surge_multiplier)
    delta_battery_max_discharge_kw = max(0.0, recommended_battery_max_discharge_kw - current_battery_max_discharge_kw)
    has_correction = (
        delta_inverter_ac_kw > 0.049
        or delta_surge_multiplier > 0.024
        or delta_battery_max_discharge_kw > 0.049
        or trip_count > 0
        or overload_count > 0
        or inverter_power_limited_kwh > 0
        or battery_discharge_limited_kwh > 0
        or modeled_peak_kw > current_surge_limit_kw + 1e-9
        or modeled_critical_peak_kw > current_battery_max_discharge_kw + 1e-9
    )
    if not has_correction:
        return None

    reasons: list[str] = []
    if calibration.get("applied"):
        reasons.append("field-peak-calibration")
    if trip_count > 0:
        reasons.append("inverter-trip-events")
    if overload_count > 0:
        reasons.append("inverter-overload-events")
    if inverter_power_limited_kwh > 0:
        reasons.append("dispatch-inverter-power-limit")
    if battery_discharge_limited_kwh > 0:
        reasons.append("dispatch-battery-discharge-limit")
    if modeled_peak_kw > current_surge_limit_kw + 1e-9:
        reasons.append("modeled-peak-exceeds-surge-limit")
    if modeled_critical_peak_kw > current_battery_max_discharge_kw + 1e-9:
        reasons.append("critical-peak-exceeds-battery-discharge")
    if unmet_critical_kwh > 0.1:
        reasons.append("critical-load-unmet")

    severity_score = 0
    if calibration_factor >= 1.25:
        severity_score += 2
    elif calibration_factor > 1.05:
        severity_score += 1
    if trip_count > 0:
        severity_score += 3
    if overload_count > 0:
        severity_score += min(2, overload_count)
    if inverter_power_limited_kwh > 50:
        severity_score += 2
    elif inverter_power_limited_kwh > 0:
        severity_score += 1
    if battery_discharge_limited_kwh > 50:
        severity_score += 2
    elif battery_discharge_limited_kwh > 0:
        severity_score += 1
    if unmet_critical_kwh > 1:
        severity_score += 2
    severity = "high" if severity_score >= 6 else "medium" if severity_score >= 3 else "low"

    return {
        "severity": severity,
        "fieldSignalsPresent": field_signals_present,
        "fieldCalibrationApplied": bool(calibration.get("applied")),
        "reasons": reasons,
        "current": {
            "inverterAcKw": current_inverter_ac_kw,
            "inverterSurgeMultiplier": current_surge_multiplier,
            "inverterSurgeLimitKw": current_surge_limit_kw,
            "batteryMaxDischargeKw": current_battery_max_discharge_kw,
        },
        "recommended": {
            "inverterAcKw": recommended_inverter_ac_kw,
            "inverterSurgeMultiplier": recommended_surge_multiplier,
            "inverterSurgeLimitKw": round_up_to_step(recommended_inverter_ac_kw * recommended_surge_multiplier, 0.1),
            "batteryMaxDischargeKw": recommended_battery_max_discharge_kw,
        },
        "deltas": {
            "inverterAcKw": delta_inverter_ac_kw,
            "inverterSurgeMultiplier": delta_surge_multiplier,
            "batteryMaxDischargeKw": delta_battery_max_discharge_kw,
        },
        "triggers": {
            "modeledPeakKw": modeled_peak_kw,
            "modeledP95Kw": modeled_p95_kw,
            "modeledCriticalPeakKw": modeled_critical_peak_kw,
            "modeledCriticalP95Kw": modeled_critical_p95_kw,
            "observedPeakKw": observed_peak_kw,
            "observedP95Kw": observed_p95_kw,
            "tripCount": trip_count,
            "overloadCount": overload_count,
            "calibrationFactor": calibration_factor,
            "inverterPowerLimitedKwh": inverter_power_limited_kwh,
            "inverterPowerLimitHours": inverter_power_limit_hours,
            "batteryDischargeLimitedKwh": battery_discharge_limited_kwh,
            "unmetCriticalKwh": unmet_critical_kwh,
        },
    }


def build_offgrid_load_profile(request: EngineRequest) -> dict[str, Any]:
    load = request.load
    governance_extra = getattr(request.governance, "model_extra", {}) or {}
    field_import_summary = governance_extra.get("fieldImports") or None
    hourly_load = complete_hourly(getattr(load, "hourlyConsumption8760", None))
    critical_real = complete_hourly(getattr(load, "offgridCriticalLoad8760", None))
    critical_fraction = clamp(finite(getattr(load, "offgridCriticalFraction", None), 0.45), 0.0, 1.0)

    if hourly_load:
        critical_hourly = critical_real or [value * critical_fraction for value in hourly_load]
        critical_hourly = [min(hourly_load[idx], critical_hourly[idx]) for idx in range(HOURS_PER_YEAR)]
        total_peak, critical_peak = build_simple_peak_from_energy(hourly_load, critical_hourly)
        return {
            "mode": "hourly-8760",
            "loadSource": "real-hourly-8760",
            "criticalLoadBasis": "real-hourly-critical-load" if critical_real else "fraction-of-real-hourly-load",
            "hasRealHourlyLoad": True,
            "totalHourly8760": hourly_load,
            "criticalHourly8760": critical_hourly,
            "hourlyPeakKw8760": total_peak,
            "criticalPeakKw8760": critical_peak,
            "annualTotalKwh": sum_positive(hourly_load),
            "annualCriticalKwh": sum_positive(critical_hourly),
            "deviceSummary": [],
            "syntheticPeakModel": None,
            "deviceCount": len(getattr(load, "offgridDevices", None) or []),
            "criticalDeviceCount": 0,
        }

    devices = getattr(load, "offgridDevices", None) or []
    valid_devices = [
        device for device in devices
        if isinstance(device, dict) and finite(device.get("powerW"), 0) > 0 and finite(device.get("hoursPerDay"), 0) > 0
    ]
    if not valid_devices:
        daily_kwh = max(0.0, finite(getattr(load, "dailyConsumptionKwh", 0), 0.0))
        base_profile = normalize_profile(COMMERCIAL_LOAD if request.tariff.tariffType == "commercial" else RESIDENTIAL_LOAD)
        total_hourly: list[float] = []
        critical_hourly: list[float] = []
        for month_idx, days in enumerate(MONTH_DAYS):
            for _ in range(days):
                for hour in range(24):
                    value = daily_kwh * base_profile[hour]
                    total_hourly.append(value)
                    critical_hourly.append(value * critical_fraction)
        total_peak, critical_peak = build_simple_peak_from_energy(total_hourly, critical_hourly)
        calibrated = apply_field_peak_calibration(
            "simple-fallback",
            total_peak,
            critical_peak,
            field_import_summary=field_import_summary,
        )
        return {
            "mode": "simple-fallback",
            "loadSource": "daily-kwh-synthetic-profile",
            "criticalLoadBasis": "critical-fraction-of-synthetic-load",
            "hasRealHourlyLoad": False,
            "totalHourly8760": total_hourly,
            "criticalHourly8760": critical_hourly,
            "hourlyPeakKw8760": calibrated["hourlyPeakKw8760"],
            "criticalPeakKw8760": calibrated["criticalPeakKw8760"],
            "annualTotalKwh": sum_positive(total_hourly),
            "annualCriticalKwh": sum_positive(critical_hourly),
            "deviceSummary": [],
            "syntheticPeakModel": summarize_synthetic_peak_model(
                "simple-fallback",
                calibrated["baselinePeakKw8760"],
                calibrated["hourlyPeakKw8760"],
                calibrated["criticalPeakKw8760"],
                calibrated["calibrationMeta"],
            ) if calibrated["calibrationMeta"] else None,
            "deviceCount": 0,
            "criticalDeviceCount": 0,
        }

    total_hourly = [0.0] * HOURS_PER_YEAR
    critical_hourly = [0.0] * HOURS_PER_YEAR
    total_peak = [0.0] * HOURS_PER_YEAR
    critical_peak = [0.0] * HOURS_PER_YEAR
    baseline_peak = [0.0] * HOURS_PER_YEAR
    device_summary = []
    critical_device_count = 0

    for device in valid_devices:
        power_kw = max(0.0, finite(device.get("powerW"), 0.0)) / 1000
        hours_per_day = clamp(finite(device.get("hoursPerDay"), 0.0), 0, 24)
        night_hours = clamp(finite(device.get("nightHoursPerDay", 0.0), 0.0), 0, hours_per_day)
        day_hours = hours_per_day - night_hours
        daily_kwh = power_kw * hours_per_day
        is_critical = bool(device.get("isCritical"))
        category = device.get("category") if device.get("category") in DEVICE_LOAD_TEMPLATES else "generic"
        template = blend_day_night_template(DEVICE_LOAD_TEMPLATES[category], day_hours, night_hours)
        surge_multiplier = device_surge_multiplier(device, category)
        peak_envelope = [synthetic_peak_envelope_factor(device, category, weight, hours_per_day) for weight in template]
        norm_factor = SEASONAL_NORM_FACTORS.get(category, 1.0)
        season_factors = SEASONAL_LOAD_FACTORS.get(category, {})
        cursor = 0
        for month_idx, days in enumerate(MONTH_DAYS):
            season = get_load_season_for_month(month_idx)
            seasonal_daily_kwh = daily_kwh * finite(season_factors.get(season, 1), 1.0) / norm_factor if norm_factor > 0 else daily_kwh
            for _ in range(days):
                for hour in range(24):
                    value = seasonal_daily_kwh * template[hour]
                    total_hourly[cursor] += value
                    if value > 1e-9:
                        baseline_peak[cursor] += power_kw * surge_multiplier
                        total_peak[cursor] += power_kw * surge_multiplier * peak_envelope[hour]
                    if is_critical:
                        critical_hourly[cursor] += value
                        if value > 1e-9:
                            critical_peak[cursor] += power_kw * surge_multiplier * peak_envelope[hour]
                    cursor += 1
        if is_critical:
            critical_device_count += 1
        device_summary.append(
            {
                "name": device.get("name") or category,
                "dailyWh": round(power_kw * 1000 * hours_per_day),
                "dailyKwh": round(daily_kwh, 3),
                "annualKwh": round(daily_kwh * 365, 2),
                "isCritical": is_critical,
                "category": category,
                "surgeMultiplier": surge_multiplier,
            }
        )

    calibrated = apply_field_peak_calibration(
        "device-list",
        total_peak,
        critical_peak,
        baseline_peak=baseline_peak,
        field_import_summary=field_import_summary,
    )
    return {
        "mode": "device-list",
        "loadSource": "device-library-and-manual-inventory",
        "criticalLoadBasis": "device-critical-flags",
        "hasRealHourlyLoad": False,
        "totalHourly8760": total_hourly,
        "criticalHourly8760": critical_hourly,
        "hourlyPeakKw8760": calibrated["hourlyPeakKw8760"],
        "criticalPeakKw8760": calibrated["criticalPeakKw8760"],
        "annualTotalKwh": sum_positive(total_hourly),
        "annualCriticalKwh": sum_positive(critical_hourly),
        "deviceSummary": device_summary,
        "syntheticPeakModel": summarize_synthetic_peak_model(
            "device-list",
            calibrated["baselinePeakKw8760"],
            calibrated["hourlyPeakKw8760"],
            calibrated["criticalPeakKw8760"],
            calibrated["calibrationMeta"],
        ),
        "deviceCount": len(valid_devices),
        "criticalDeviceCount": critical_device_count,
    }


def build_offgrid_pv_profile(request: EngineRequest, production: dict[str, Any]) -> dict[str, Any]:
    request_hourly = complete_hourly(getattr(request.load, "hourlyProduction8760", None))
    if request_hourly:
        return {
            "pvHourly8760": request_hourly,
            "annualKwh": sum_positive(request_hourly),
            "hasRealHourlyProduction": True,
            "productionDispatchProfile": "real-hourly-pv-8760",
            "productionSeriesSource": "user-supplied-real-hourly-pv",
            "productionSourceLabel": "Real hourly PV 8760",
            "productionFallback": False,
            "fallbackUsed": False,
            "resolution": "hourly",
            "missingHours": 0,
            "dispatchBus": "ac-load-bus-kwh",
            "synthetic": False,
        }
    backend_hourly = complete_hourly(production.get("hourlyEnergyKwh") or production.get("hourly_kwh"))
    if backend_hourly:
        return {
            "pvHourly8760": backend_hourly,
            "annualKwh": sum_positive(backend_hourly),
            "hasRealHourlyProduction": True,
            "productionDispatchProfile": "real-hourly-pv-8760",
            "productionSeriesSource": "backend-hourly-production",
            "productionSourceLabel": "Backend hourly PV 8760",
            "productionFallback": False,
            "fallbackUsed": False,
            "resolution": "hourly",
            "missingHours": 0,
            "dispatchBus": "ac-load-bus-kwh",
            "synthetic": False,
        }
    monthly = production.get("monthlyEnergyKwh") or production.get("monthly_kwh") or [0.0] * 12
    monthly = [max(0.0, finite(value, 0.0)) for value in monthly[:12]]
    clustered_hourly, weather_meta = build_clustered_pv_from_monthly(
        monthly,
        city_name=request.site.cityName,
        panel_temp_coeff_per_c=request.system.panelTempCoeffPerC,
    )
    return {
        "pvHourly8760": clustered_hourly,
        "annualKwh": sum_positive(clustered_hourly),
        "hasRealHourlyProduction": False,
        "productionDispatchProfile": "monthly-production-derived-synthetic-8760",
        "productionSeriesSource": "monthly-production-derived-synthetic-8760",
        "productionSourceLabel": "Monthly-derived synthetic 8760",
        "productionFallback": True,
        "fallbackUsed": True,
        "resolution": "hourly",
        "missingHours": 0,
        "dispatchBus": "ac-load-bus-kwh",
        "synthetic": True,
        "syntheticWeatherModel": weather_meta["syntheticWeatherModel"],
        "syntheticWeatherMetadata": weather_meta,
    }


def eol_battery_config(battery: dict[str, Any]) -> dict[str, Any]:
    usable = max(0.0, finite(battery.get("usableCapacityKwh"), 0.0))
    reserve = max(0.0, finite(battery.get("socReserveKwh"), 0.0))
    initial = max(reserve, finite(battery.get("initialSocKwh"), reserve))
    eol_capacity_pct = clamp(finite(battery.get("eolCapacityPct"), 0.80 if usable > 0 else 0.80) / (100 if finite(battery.get("eolCapacityPct"), 0.0) > 1 else 1), 0.5, 1.0)
    eol_eff_loss = clamp(finite(battery.get("eolEfficiencyLossPct"), 0.03 if usable > 0 else 0.03) / (100 if finite(battery.get("eolEfficiencyLossPct"), 0.0) > 1 else 1), 0, 0.3)
    eol_usable = usable * eol_capacity_pct
    reserve_pct = reserve / usable if usable > 0 else 0.0
    initial_pct = initial / usable if usable > 0 else reserve_pct
    return {
        **battery,
        "usableCapacityKwh": eol_usable,
        "socReserveKwh": eol_usable * reserve_pct,
        "initialSocKwh": eol_usable * initial_pct,
        "efficiency": clamp(finite(battery.get("efficiency"), 0.92) - eol_eff_loss, 0.5, 1.0),
        "maxChargePowerKw": finite(battery.get("maxChargePowerKw"), 0.0) * 0.90 if finite(battery.get("maxChargePowerKw"), 0.0) > 0 else battery.get("maxChargePowerKw"),
        "maxDischargePowerKw": finite(battery.get("maxDischargePowerKw"), 0.0) * 0.90 if finite(battery.get("maxDischargePowerKw"), 0.0) > 0 else battery.get("maxDischargePowerKw"),
    }


def run_offgrid_dispatch(pv_hourly: list[float], load_hourly: list[float], critical_hourly: list[float], battery: dict[str, Any], generator: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    usable_cap = max(0.0, finite(battery.get("usableCapacityKwh"), 0.0))
    round_trip_eff = clamp(finite(battery.get("efficiency"), 0.92), 0.5, 1.0)
    charge_eff = finite(battery.get("chargeEfficiency"), sqrt(round_trip_eff)) or sqrt(round_trip_eff)
    discharge_eff = finite(battery.get("dischargeEfficiency"), sqrt(round_trip_eff)) or sqrt(round_trip_eff)
    charge_eff = clamp(charge_eff, 0.5, 1.0)
    discharge_eff = clamp(discharge_eff, 0.5, 1.0)
    soc_reserve = max(0.0, min(usable_cap * 0.5, finite(battery.get("socReserveKwh"), 0.0)))
    max_charge_kw = finite(battery.get("maxChargePowerKw"), float("inf")) if finite(battery.get("maxChargePowerKw"), 0.0) > 0 else float("inf")
    max_discharge_kw = finite(battery.get("maxDischargePowerKw"), float("inf")) if finite(battery.get("maxDischargePowerKw"), 0.0) > 0 else float("inf")
    inverter_ac_limit = finite(options.get("inverterAcLimitKw"), float("inf")) if finite(options.get("inverterAcLimitKw"), 0.0) > 0 else float("inf")
    inverter_surge_multiplier = clamp(finite(options.get("inverterSurgeMultiplier"), 1.25), 1.0, 6.0)
    inverter_surge_limit = inverter_ac_limit * inverter_surge_multiplier if inverter_ac_limit != float("inf") else float("inf")
    load_peak = options.get("loadPeakKw8760") or load_hourly
    critical_peak = options.get("criticalPeakKw8760") or critical_hourly
    generator_enabled = bool(generator.get("enabled")) and finite(generator.get("capacityKw"), 0.0) > 0
    generator_capacity = max(0.0, finite(generator.get("capacityKw"), 0.0))
    generator_fuel_cost = max(0.0, finite(generator.get("fuelCostPerKwh"), 0.0))
    generator_strategy = options.get("generatorStrategy") or generator.get("strategy") or "critical-backup"
    generator_start_soc_pct = clamp(finite(options.get("generatorStartSocPct"), 0.0), 0.0, 100.0)
    generator_start_soc = max(soc_reserve, usable_cap * (generator_start_soc_pct / 100))
    generator_stop_soc_pct = clamp(finite(options.get("generatorStopSocPct"), generator_start_soc_pct + 15 if generator_start_soc_pct > 0 else 100.0), generator_start_soc_pct, 100.0)
    generator_stop_soc = max(generator_start_soc, usable_cap * (generator_stop_soc_pct / 100))
    generator_min_load_rate = clamp(finite(options.get("generatorMinLoadRatePct"), 0.0) / 100, 0.0, 1.0)
    generator_charge_battery_enabled = bool(options.get("generatorChargeBatteryEnabled", generator.get("chargeBatteryEnabled", False)))
    generator_max_hours_per_day = clamp(finite(options.get("generatorMaxHoursPerDay"), 24.0), 0.0, 24.0) if options.get("generatorMaxHoursPerDay") is not None else float("inf")
    autonomy_threshold_pct = clamp(finite(options.get("autonomyThresholdPct"), 1.0), 0.0, 25.0)
    dynamic_battery_efficiency_enabled = options.get("dynamicBatteryEfficiency", True) is not False and battery.get("dynamicEfficiencyModelEnabled", True) is not False
    battery_chemistry = battery.get("chemistry") or options.get("batteryChemistry") or ""
    soc = clamp(finite(battery.get("initialSocKwh"), soc_reserve), soc_reserve, usable_cap) if usable_cap > 0 else 0.0

    direct_pv = battery_to_load = generator_to_load = generator_to_critical = generator_to_battery = 0.0
    generator_output = generator_wasted = curtailed_pv = unmet_load = unmet_critical = total_pv = 0.0
    charged_from_pv = total_charged = pv_battery_served = pv_battery_critical_served = 0.0
    battery_charge_limited = battery_discharge_limited = inverter_limited = 0.0
    inverter_power_limit_hours = generator_run_hours = generator_fuel_cost_annual = 0.0
    autonomous_days = autonomous_days_with_generator = 0
    min_soc = soc if usable_cap > 0 else 0.0
    soc_sum = 0.0
    effective_charge_efficiency_weighted = effective_charge_input_kwh = 0.0
    effective_discharge_efficiency_weighted = effective_discharge_output_kwh = 0.0
    hourly_trace = []
    daily_unmet = daily_unmet_with_generator = daily_load = 0.0
    generator_run_hours_today = 0.0
    generator_running = False

    for idx in range(HOURS_PER_YEAR):
        if idx > 0 and idx % 24 == 0:
            generator_run_hours_today = 0.0
        pv = max(0.0, finite(pv_hourly[idx], 0.0))
        load = max(0.0, finite(load_hourly[idx], 0.0))
        critical = max(0.0, min(load, finite(critical_hourly[idx], 0.0)))
        non_critical = max(0.0, load - critical)
        load_peak_kw = max(load, finite(load_peak[idx], load))
        critical_peak_kw = max(critical, min(load_peak_kw, finite(critical_peak[idx], critical)))
        non_critical_peak_kw = max(0.0, load_peak_kw - critical_peak_kw)
        total_pv += pv

        critical_target = critical
        non_critical_target = non_critical
        if inverter_ac_limit != float("inf"):
            critical_target = min(critical_target, inverter_ac_limit)
            non_critical_target = min(non_critical_target, max(0.0, inverter_ac_limit - critical_target))
        if inverter_surge_limit != float("inf"):
            if critical_peak_kw > inverter_surge_limit + 1e-9:
                critical_scale = clamp(inverter_surge_limit / critical_peak_kw if critical_peak_kw > 0 else 0.0, 0.0, 1.0)
                critical_target *= critical_scale
                non_critical_target = 0.0
            elif non_critical_peak_kw > 0 and load_peak_kw > inverter_surge_limit + 1e-9:
                allowed_non_critical_peak = max(0.0, inverter_surge_limit - critical_peak_kw)
                non_critical_scale = clamp(allowed_non_critical_peak / non_critical_peak_kw if non_critical_peak_kw > 0 else 0.0, 0.0, 1.0)
                non_critical_target *= non_critical_scale
        pv_battery_target_load = max(0.0, min(load, critical_target + non_critical_target))
        inverter_limited_this_hour = max(0.0, load - pv_battery_target_load)
        if inverter_limited_this_hour > 1e-9:
            inverter_limited += inverter_limited_this_hour
            inverter_power_limit_hours += 1

        direct_to_critical = min(pv, critical_target)
        direct_to_non_critical = min(max(0.0, pv - direct_to_critical), non_critical_target)
        direct_self = direct_to_critical + direct_to_non_critical
        direct_pv += direct_self
        pv_surplus = max(0.0, pv - direct_self)

        charge_room = max(0.0, (usable_cap - soc) / charge_eff) if usable_cap > 0 else 0.0
        potential_charge_from_pv = min(pv_surplus, charge_room)
        charge_from_pv = min(potential_charge_from_pv, max_charge_kw)
        effective_charge_eff = resolve_dynamic_battery_efficiency(
            mode="charge",
            base_efficiency=charge_eff,
            soc_kwh=soc,
            usable_capacity_kwh=usable_cap,
            soc_reserve_kwh=soc_reserve,
            power_kw=charge_from_pv,
            max_power_kw=None if max_charge_kw == float("inf") else max_charge_kw,
            chemistry=battery_chemistry,
            enabled=dynamic_battery_efficiency_enabled,
        )
        if potential_charge_from_pv > charge_from_pv + 1e-9:
            battery_charge_limited += potential_charge_from_pv - charge_from_pv
        soc += charge_from_pv * effective_charge_eff
        charged_from_pv += charge_from_pv
        total_charged += charge_from_pv * effective_charge_eff
        effective_charge_efficiency_weighted += charge_from_pv * effective_charge_eff
        effective_charge_input_kwh += charge_from_pv
        pv_surplus -= charge_from_pv
        curtailed_pv += max(0.0, pv_surplus)

        critical_deficit = max(0.0, critical_target - direct_to_critical)
        non_critical_deficit = max(0.0, non_critical_target - direct_to_non_critical)
        total_deficit = critical_deficit + non_critical_deficit
        battery_discharge = battery_to_critical = battery_to_non_critical = 0.0
        if total_deficit > 0 and soc > soc_reserve + 1e-9:
            effective_discharge_eff = resolve_dynamic_battery_efficiency(
                mode="discharge",
                base_efficiency=discharge_eff,
                soc_kwh=soc,
                usable_capacity_kwh=usable_cap,
                soc_reserve_kwh=soc_reserve,
                power_kw=min(total_deficit, max_discharge_kw),
                max_power_kw=None if max_discharge_kw == float("inf") else max_discharge_kw,
                chemistry=battery_chemistry,
                enabled=dynamic_battery_efficiency_enabled,
            )
            available_discharge = max(0.0, (soc - soc_reserve) * effective_discharge_eff)
            discharge_budget = min(available_discharge, max_discharge_kw)
            power_limited_discharge = max(0.0, min(total_deficit, available_discharge) - discharge_budget)
            if power_limited_discharge > 1e-9:
                battery_discharge_limited += power_limited_discharge
            discharge_to_critical = min(critical_deficit, discharge_budget)
            soc -= discharge_to_critical / effective_discharge_eff
            battery_to_critical = discharge_to_critical
            battery_discharge += discharge_to_critical
            discharge_to_non_critical = min(non_critical_deficit, max(0.0, discharge_budget - discharge_to_critical))
            soc -= discharge_to_non_critical / effective_discharge_eff
            battery_to_non_critical = discharge_to_non_critical
            battery_discharge += discharge_to_non_critical
            effective_discharge_efficiency_weighted += battery_discharge * effective_discharge_eff
            effective_discharge_output_kwh += battery_discharge

        battery_to_load += battery_discharge
        pv_battery_served += direct_self + battery_discharge
        pv_battery_critical_served += direct_to_critical + battery_to_critical

        remaining_critical = max(0.0, critical - direct_to_critical - battery_to_critical)
        remaining_total = max(0.0, load - direct_self - battery_discharge)
        gen_output = gen_served_load = gen_to_critical = gen_to_battery = 0.0
        generator_within_cap = generator_run_hours_today + 1e-9 < generator_max_hours_per_day
        generator_soc_gate = usable_cap <= 0 or soc <= generator_start_soc + 1e-9
        critical_only = generator_strategy in {"critical-backup", "critical-only"}
        load_support_needed = remaining_critical > 1e-6 if critical_only else remaining_total > 1e-6
        charge_target_soc = min(usable_cap, generator_stop_soc) if generator_charge_battery_enabled else soc
        generator_charge_room = max(0.0, (charge_target_soc - soc) / charge_eff) if generator_charge_battery_enabled and usable_cap > 0 and soc < charge_target_soc - 1e-9 else 0.0
        start_for_battery_recovery = generator_charge_battery_enabled and usable_cap > 0 and generator_soc_gate and generator_charge_room > 1e-6
        keep_running_for_battery_recovery = generator_running and generator_charge_battery_enabled and usable_cap > 0 and soc < generator_stop_soc - 1e-9
        generator_should_run = generator_enabled and generator_within_cap and ((load_support_needed and (generator_soc_gate or generator_running)) or (start_for_battery_recovery or keep_running_for_battery_recovery))
        if generator_should_run:
            gen_min_output = generator_capacity * generator_min_load_rate
            gen_to_critical = min(remaining_critical, generator_capacity)
            gen_to_non_critical = min(max(0.0, remaining_total - gen_to_critical), max(0.0, generator_capacity - gen_to_critical)) if not critical_only else 0.0
            gen_served_load = gen_to_critical + gen_to_non_critical
            desired_output = min(generator_capacity, gen_served_load + min(generator_charge_room, max_charge_kw)) if generator_charge_battery_enabled else gen_served_load
            gen_output = min(generator_capacity, max(gen_served_load, desired_output, gen_min_output if (gen_served_load > 1e-9 or generator_charge_room > 1e-9) else 0.0))
            gen_remaining = max(0.0, gen_output - gen_served_load)
            if generator_charge_battery_enabled and gen_remaining > 1e-9 and generator_charge_room > 1e-9:
                gen_to_battery = min(gen_remaining, generator_charge_room, max_charge_kw)
                effective_generator_charge_eff = resolve_dynamic_battery_efficiency(
                    mode="charge",
                    base_efficiency=charge_eff,
                    soc_kwh=soc,
                    usable_capacity_kwh=usable_cap,
                    soc_reserve_kwh=soc_reserve,
                    power_kw=gen_to_battery,
                    max_power_kw=None if max_charge_kw == float("inf") else max_charge_kw,
                    chemistry=battery_chemistry,
                    enabled=dynamic_battery_efficiency_enabled,
                )
                soc += gen_to_battery * effective_generator_charge_eff
                total_charged += gen_to_battery * effective_generator_charge_eff
                effective_charge_efficiency_weighted += gen_to_battery * effective_generator_charge_eff
                effective_charge_input_kwh += gen_to_battery
                gen_remaining -= gen_to_battery
            generator_to_load += gen_served_load
            generator_to_critical += gen_to_critical
            generator_to_battery += gen_to_battery
            generator_output += gen_output
            generator_wasted += max(0.0, gen_remaining)
            generator_run_hours += 1
            generator_run_hours_today += 1
            generator_fuel_cost_annual += gen_output * generator_fuel_cost
            generator_running = True
        else:
            generator_running = False

        final_unmet = max(0.0, remaining_total - gen_served_load)
        final_unmet_critical = max(0.0, remaining_critical - gen_to_critical)
        unmet_load += final_unmet
        unmet_critical += final_unmet_critical
        daily_unmet += remaining_total
        daily_unmet_with_generator += final_unmet
        daily_load += load
        if idx % 24 == 23:
            autonomy_threshold = max(0.001, daily_load * (autonomy_threshold_pct / 100))
            if daily_unmet < autonomy_threshold:
                autonomous_days += 1
            if daily_unmet_with_generator < autonomy_threshold:
                autonomous_days_with_generator += 1
            daily_unmet = daily_unmet_with_generator = daily_load = 0.0
        min_soc = min(min_soc, soc)
        soc_sum += soc
        hourly_trace.append(
            {
                "pvKwh": pv,
                "loadKwh": load,
                "criticalKwh": critical,
                "directSelf": direct_self,
                "batteryDischarge": battery_discharge,
                "generatorKwh": gen_served_load,
                "generatorOutputKwh": gen_output,
                "generatorToBattery": gen_to_battery,
                "curtailed": max(0.0, pv_surplus),
                "unmet": final_unmet,
                "unmetCritical": final_unmet_critical,
                "inverterLimitedLoadKwh": inverter_limited_this_hour,
                "soc": soc,
            }
        )

    annual_total_load = sum_positive(load_hourly)
    annual_critical_load = sum_positive(critical_hourly)
    total_served = direct_pv + battery_to_load + generator_to_load
    critical_served = annual_critical_load - unmet_critical
    effective_charge_efficiency_avg = (effective_charge_efficiency_weighted / effective_charge_input_kwh) if effective_charge_input_kwh > 0 else charge_eff
    effective_discharge_efficiency_avg = (effective_discharge_efficiency_weighted / effective_discharge_output_kwh) if effective_discharge_output_kwh > 0 else discharge_eff
    return {
        "directPvToLoadKwh": direct_pv,
        "batteryToLoadKwh": battery_to_load,
        "generatorToLoadKwh": generator_to_load,
        "generatorToCriticalKwh": generator_to_critical,
        "generatorToBatteryKwh": generator_to_battery,
        "generatorOutputKwh": generator_output,
        "generatorWastedKwh": generator_wasted,
        "curtailedPvKwh": curtailed_pv,
        "unmetLoadKwh": unmet_load,
        "unmetCriticalLoadKwh": unmet_critical,
        "totalPvGeneratedKwh": total_pv,
        "chargedFromPvKwh": charged_from_pv,
        "totalLoadCoverage": min(1.0, total_served / annual_total_load) if annual_total_load > 0 else 1.0,
        "criticalLoadCoverage": min(1.0, critical_served / annual_critical_load) if annual_critical_load > 0 else 1.0,
        "solarBatteryLoadCoverage": min(1.0, pv_battery_served / annual_total_load) if annual_total_load > 0 else 1.0,
        "solarBatteryCriticalCoverage": min(1.0, pv_battery_critical_served / annual_critical_load) if annual_critical_load > 0 else 1.0,
        "batteryChargeLimitedKwh": battery_charge_limited,
        "batteryDischargeLimitedKwh": battery_discharge_limited,
        "inverterPowerLimitedLoadKwh": inverter_limited,
        "inverterPowerLimitHours": inverter_power_limit_hours,
        "maxChargePowerKw": None if max_charge_kw == float("inf") else max_charge_kw,
        "maxDischargePowerKw": None if max_discharge_kw == float("inf") else max_discharge_kw,
        "chargeEfficiency": charge_eff,
        "dischargeEfficiency": discharge_eff,
        "effectiveChargeEfficiencyAvg": effective_charge_efficiency_avg,
        "effectiveDischargeEfficiencyAvg": effective_discharge_efficiency_avg,
        "roundTripEfficiency": round_trip_eff,
        "dynamicBatteryEfficiencyModel": "c-rate-soc-v1" if dynamic_battery_efficiency_enabled else "flat-efficiency",
        "socReservePct": (soc_reserve / usable_cap) if usable_cap > 0 else 0.0,
        "inverterAcLimitKw": None if inverter_ac_limit == float("inf") else inverter_ac_limit,
        "inverterSurgeMultiplier": inverter_surge_multiplier,
        "inverterSurgeLimitKw": None if inverter_surge_limit == float("inf") else inverter_surge_limit,
        "autonomousDays": autonomous_days,
        "autonomousDaysPct": autonomous_days / 365 * 100,
        "autonomousDaysWithGenerator": autonomous_days_with_generator,
        "autonomousDaysWithGeneratorPct": autonomous_days_with_generator / 365 * 100,
        "autonomyThresholdPct": autonomy_threshold_pct,
        "generatorRunHours": generator_run_hours,
        "generatorFuelCostAnnual": generator_fuel_cost_annual,
        "generatorStrategy": generator_strategy,
        "generatorMinLoadRatePct": generator_min_load_rate * 100,
        "generatorChargeBatteryEnabled": generator_charge_battery_enabled,
        "generatorStartSocPct": generator_start_soc_pct,
        "generatorStopSocPct": generator_stop_soc_pct,
        "cyclesPerYear": (total_charged / usable_cap) if usable_cap > 0 else 0.0,
        "minimumSocKwh": min_soc,
        "averageSocKwh": soc_sum / HOURS_PER_YEAR if HOURS_PER_YEAR > 0 else 0.0,
        "minimumSocPct": (min_soc / usable_cap) if usable_cap > 0 else 0.0,
        "averageSocPct": ((soc_sum / HOURS_PER_YEAR) / usable_cap) if usable_cap > 0 else 0.0,
        "hourly8760": hourly_trace,
    }


def find_worst_pv_window(pv_hourly: list[float], days: int) -> int:
    n_hours = days * 24
    if n_hours >= len(pv_hourly):
        return 0
    window_total = sum_positive(pv_hourly[:n_hours])
    min_total = window_total
    worst_start = 0
    for start in range(1, len(pv_hourly) - n_hours + 1):
        window_total += max(0.0, pv_hourly[start + n_hours - 1]) - max(0.0, pv_hourly[start - 1])
        if window_total < min_total:
            min_total = window_total
            worst_start = start
    return worst_start


def run_bad_weather_scenario(normal_dispatch: dict[str, Any], pv_hourly: list[float], load_hourly: list[float], critical_hourly: list[float], battery: dict[str, Any], generator: dict[str, Any], options: dict[str, Any], weather_level: str) -> dict[str, Any] | None:
    config = BAD_WEATHER_CONFIG.get(weather_level)
    if not config:
        return None
    worst_start = find_worst_pv_window(pv_hourly, config["days"])
    scaled_pv = [
        value * config["pvFactor"] if worst_start <= idx < worst_start + (config["days"] * 24) else value
        for idx, value in enumerate(pv_hourly)
    ]
    bad_dispatch = run_offgrid_dispatch(scaled_pv, load_hourly, critical_hourly, battery, generator, options)
    return {
        "weatherLevel": weather_level,
        "pvScaleFactor": config["pvFactor"],
        "consecutiveDays": config["days"],
        "worstWindowStartHour": worst_start,
        "worstWindowDayOfYear": int(worst_start / 24) + 1,
        "dispatch": bad_dispatch,
        "criticalCoverageDropPct": max(0.0, (normal_dispatch["criticalLoadCoverage"] - bad_dispatch["criticalLoadCoverage"]) * 100),
        "totalCoverageDropPct": max(0.0, (normal_dispatch["totalLoadCoverage"] - bad_dispatch["totalLoadCoverage"]) * 100),
        "pvBatteryCoverageDropPct": max(0.0, (normal_dispatch["solarBatteryLoadCoverage"] - bad_dispatch["solarBatteryLoadCoverage"]) * 100),
        "additionalGeneratorKwh": max(0.0, bad_dispatch["generatorToLoadKwh"] - normal_dispatch["generatorToLoadKwh"]),
        "additionalGeneratorCost": max(0.0, bad_dispatch["generatorFuelCostAnnual"] - normal_dispatch["generatorFuelCostAnnual"]),
    }


def run_stress_scenarios(pv_hourly: list[float], load_profile: dict[str, Any], battery: dict[str, Any], generator: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    scenarios = []
    load_base = load_profile["totalHourly8760"]
    critical_base = load_profile["criticalHourly8760"]
    load_peak_base = options.get("loadPeakKw8760", load_base)
    critical_peak_base = options.get("criticalPeakKw8760", critical_base)
    for scenario in OFFGRID_STRESS_SCENARIOS:
        pv = [value * scenario["pvFactor"] for value in pv_hourly]
        load = [value * scenario["loadFactor"] for value in load_base]
        critical = [min(load[idx], critical_base[idx] * scenario["criticalLoadFactor"]) for idx in range(HOURS_PER_YEAR)]
        scenario_battery = eol_battery_config(battery) if scenario["batteryEol"] else dict(battery)
        scenario_options = dict(options)
        scenario_options["loadPeakKw8760"] = [value * scenario["loadFactor"] for value in load_peak_base]
        scenario_options["criticalPeakKw8760"] = [value * scenario["criticalLoadFactor"] for value in critical_peak_base]
        dispatch = run_offgrid_dispatch(pv, load, critical, scenario_battery, generator, scenario_options)
        scenarios.append(
            {
                "key": scenario["key"],
                "label": scenario["label"],
                "totalLoadCoverage": dispatch["totalLoadCoverage"],
                "criticalLoadCoverage": dispatch["criticalLoadCoverage"],
                "pvBatteryLoadCoverage": dispatch["solarBatteryLoadCoverage"],
                "pvBatteryCriticalCoverage": dispatch["solarBatteryCriticalCoverage"],
                "unmetLoadKwh": dispatch["unmetLoadKwh"],
                "unmetCriticalKwh": dispatch["unmetCriticalLoadKwh"],
                "generatorKwh": dispatch["generatorToLoadKwh"],
                "generatorRunHours": dispatch["generatorRunHours"],
                "batteryChargeLimitedKwh": dispatch["batteryChargeLimitedKwh"],
                "batteryDischargeLimitedKwh": dispatch["batteryDischargeLimitedKwh"],
                "inverterPowerLimitedKwh": dispatch["inverterPowerLimitedLoadKwh"],
                "peakCriticalKw": max(scenario_options["criticalPeakKw8760"]) if scenario_options["criticalPeakKw8760"] else 0.0,
            }
        )
    worst_critical = min(scenarios, key=lambda item: item["criticalLoadCoverage"]) if scenarios else None
    worst_total = min(scenarios, key=lambda item: item["totalLoadCoverage"]) if scenarios else None
    max_unmet_critical = max(scenarios, key=lambda item: item["unmetCriticalKwh"]) if scenarios else None
    max_critical_peak = max((item["peakCriticalKw"] for item in scenarios), default=0.0)
    generator_capacity = max(0.0, finite(generator.get("capacityKw"), 0.0))
    reserve = (generator_capacity / max_critical_peak) - 1 if generator_capacity > 0 and max_critical_peak > 0 else None
    return {
        "version": "OGD-FIELD-MODEL-2026.04-v3",
        "scenarios": scenarios,
        "worstCriticalScenario": worst_critical,
        "worstTotalScenario": worst_total,
        "maxUnmetCriticalScenario": max_unmet_critical,
        "generatorCapacityKw": generator_capacity,
        "maxCriticalPeakKw": max_critical_peak,
        "generatorCriticalPeakReservePct": reserve,
    }


def evaluate_field_readiness(production_profile: dict[str, Any], load_profile: dict[str, Any], battery: dict[str, Any], dispatch_options: dict[str, Any]) -> dict[str, Any]:
    blockers = []
    if not production_profile["hasRealHourlyProduction"]:
        blockers.append("Gercek 8760 saatlik PV uretim serisi yok; dispatch sentetik profile dayaniyor.")
    if not load_profile["hasRealHourlyLoad"]:
        blockers.append("Gercek 8760 saatlik saha yuk profili yok; yuk sentetik uretiliyor.")
    if load_profile["criticalLoadBasis"] != "real-hourly-critical-load":
        blockers.append("Kritik yuk ayri olculmus saatlik profile dayanmiyor.")
    if finite(battery.get("maxChargePowerKw"), 0.0) <= 0:
        blockers.append("Batarya sarj kW limiti tanimli degil.")
    if finite(battery.get("maxDischargePowerKw"), 0.0) <= 0:
        blockers.append("Batarya desarj kW limiti tanimli degil.")
    if finite(dispatch_options.get("inverterAcLimitKw"), 0.0) <= 0:
        blockers.append("Inverter AC limiti acik tanimli degil.")
    phase1_ready = len(blockers) == 0
    return {
        "version": "OFFGRID-FIELD-GATE-2026.04-v1",
        "status": "phase-1-input-ready" if phase1_ready else "blocked",
        "phase1Ready": phase1_ready,
        "fieldGuaranteeReady": False,
        "guaranteeLevel": "engineering-input-ready-not-field-guarantee" if phase1_ready else "pre-feasibility-only",
        "blockers": blockers,
        "limitations": [
            "Batarya yaslanmasi, sicaklik derating ve saha kabul zinciri bu backend parity adiminda hala ileri model alanidir."
        ],
        "satisfied": [],
    }


def build_backend_offgrid_results(request: EngineRequest, production: dict[str, Any]) -> dict[str, Any] | None:
    if request.scenario.key != "off-grid":
        return None
    load_profile = build_offgrid_load_profile(request)
    pv_profile = build_offgrid_pv_profile(request, production)
    battery_contract = request.system.battery or {}
    capacity_kwh = max(0.0, finite(battery_contract.get("capacity"), 0.0))
    dod = clamp(finite(battery_contract.get("dod"), 0.90), 0.0, 1.0)
    usable_capacity = capacity_kwh * dod
    reserve_pct = clamp(finite(battery_contract.get("socReservePct"), 15.0), 0.0, 50.0)
    max_charge_kw = max(0.1, finite(request.system.batteryMaxChargeKw or battery_contract.get("maxChargePowerKw"), usable_capacity * 0.5 if usable_capacity > 0 else 0.0)) if usable_capacity > 0 else 0.0
    max_discharge_kw = max(0.1, finite(request.system.batteryMaxDischargeKw or battery_contract.get("maxDischargePowerKw"), usable_capacity * 0.5 if usable_capacity > 0 else 0.0)) if usable_capacity > 0 else 0.0
    battery = {
        "usableCapacityKwh": usable_capacity,
        "efficiency": clamp(finite(battery_contract.get("efficiency"), 0.92), 0.5, 1.0),
        "chargeEfficiency": clamp(finite(battery_contract.get("chargeEfficiency"), 0.0), 0.0, 1.0) if finite(battery_contract.get("chargeEfficiency"), 0.0) > 0 else None,
        "dischargeEfficiency": clamp(finite(battery_contract.get("dischargeEfficiency"), 0.0), 0.0, 1.0) if finite(battery_contract.get("dischargeEfficiency"), 0.0) > 0 else None,
        "chemistry": battery_contract.get("chemistry"),
        "dynamicEfficiencyModelEnabled": True,
        "socReserveKwh": usable_capacity * (reserve_pct / 100),
        "initialSocKwh": usable_capacity * (reserve_pct / 100),
        "maxChargePowerKw": max_charge_kw,
        "maxDischargePowerKw": max_discharge_kw,
        "eolCapacityPct": finite(battery_contract.get("eolCapacityPct"), 80),
        "eolEfficiencyLossPct": finite(battery_contract.get("eolEfficiencyLossPct"), 3),
    }
    offgrid = request.offgrid
    generator = {
        "enabled": bool(offgrid and offgrid.generatorEnabled and offgrid.generatorKw > 0),
        "capacityKw": max(0.0, finite(offgrid.generatorKw if offgrid else 0.0, 0.0)),
        "fuelCostPerKwh": max(0.0, finite(offgrid.generatorFuelCostPerKwh if offgrid else 0.0, 0.0)),
        "chargeBatteryEnabled": bool(offgrid.generatorChargeBatteryEnabled) if offgrid and offgrid.generatorChargeBatteryEnabled is not None else False,
    }
    inverter_ac_kw = max(0.5, finite(request.system.offgridInverterAcKw, max(float(production.get("systemPowerKwp") or 0), max_discharge_kw, 1.0)))
    dispatch_options = {
        "loadPeakKw8760": load_profile["hourlyPeakKw8760"],
        "criticalPeakKw8760": load_profile["criticalPeakKw8760"],
        "inverterAcLimitKw": inverter_ac_kw,
        "inverterSurgeMultiplier": clamp(finite(request.system.offgridInverterSurgeMultiplier, 1.25), 1.0, 3.0),
        "autonomyThresholdPct": clamp(finite(getattr(offgrid, "autonomyThresholdPct", None), 1.0), 0.0, 25.0),
        "generatorStartSocPct": clamp(finite(offgrid.generatorStartSocPct if offgrid else 0.0, 0.0), 0.0, 100.0),
        "generatorStopSocPct": clamp(finite(offgrid.generatorStopSocPct if offgrid and offgrid.generatorStopSocPct is not None else 0.0, 0.0), 0.0, 100.0),
        "generatorMaxHoursPerDay": finite(offgrid.generatorMaxHoursPerDay if offgrid and offgrid.generatorMaxHoursPerDay is not None else 24.0, 24.0),
        "generatorMinLoadRatePct": clamp(finite(offgrid.generatorMinLoadRatePct if offgrid and offgrid.generatorMinLoadRatePct is not None else 30.0, 30.0), 0.0, 100.0),
        "generatorChargeBatteryEnabled": bool(offgrid.generatorChargeBatteryEnabled) if offgrid and offgrid.generatorChargeBatteryEnabled is not None else False,
        "generatorStrategy": offgrid.generatorStrategy if offgrid else "critical-backup",
    }
    warmup = run_offgrid_dispatch(pv_profile["pvHourly8760"], load_profile["totalHourly8760"], load_profile["criticalHourly8760"], battery, generator, dispatch_options)
    battery_steady = dict(battery)
    battery_steady["initialSocKwh"] = clamp(finite(warmup["hourly8760"][-1]["soc"], battery["socReserveKwh"]), battery["socReserveKwh"], battery["usableCapacityKwh"])
    normal = run_offgrid_dispatch(pv_profile["pvHourly8760"], load_profile["totalHourly8760"], load_profile["criticalHourly8760"], battery_steady, generator, dispatch_options)
    without_generator = None
    if generator["enabled"]:
        no_gen = dict(generator)
        no_gen["enabled"] = False
        without_generator = run_offgrid_dispatch(pv_profile["pvHourly8760"], load_profile["totalHourly8760"], load_profile["criticalHourly8760"], battery_steady, no_gen, dispatch_options)
    bad_weather = run_bad_weather_scenario(normal, pv_profile["pvHourly8760"], load_profile["totalHourly8760"], load_profile["criticalHourly8760"], battery_steady, generator, dispatch_options, offgrid.badWeatherLevel if offgrid else "")
    stress = run_stress_scenarios(pv_profile["pvHourly8760"], load_profile, battery_steady, generator, dispatch_options)
    readiness = evaluate_field_readiness(pv_profile, load_profile, battery, dispatch_options)
    calculation_mode = offgrid.calculationMode if offgrid else "basic"
    governance_extra = getattr(request.governance, "model_extra", {}) or {}
    field_import_summary = governance_extra.get("fieldImports") or {
        "highResolutionLoad": None,
        "criticalHighResolutionLoad": None,
        "inverterEventLog": None,
    }
    design_corrections = build_offgrid_design_corrections(
        normal,
        load_profile,
        field_import_summary,
    )
    accuracy_assessment = build_accuracy_assessment(
        pv_profile,
        load_profile,
        battery,
        generator,
        dispatch_options,
        calculation_mode=calculation_mode,
        bad_weather_enabled=bad_weather is not None,
    )
    field_model_maturity_gate = build_field_model_maturity_gate(
        stress,
        phase1_ready=bool(readiness.get("phase1Ready")),
        phase2_ready=False,
        generator=generator,
    )
    has_real_pv_hourly = bool(pv_profile["hasRealHourlyProduction"])
    has_real_load_hourly = bool(load_profile["hasRealHourlyLoad"])
    has_real_critical_hourly = load_profile["criticalLoadBasis"] == "real-hourly-critical-load"
    has_high_res_import = bool((field_import_summary.get("highResolutionLoad") or {}).get("sampleCount"))
    field_data_state = "field-input-ready" if readiness.get("phase1Ready") else "hybrid-hourly" if (has_real_pv_hourly or has_real_load_hourly or has_real_critical_hourly) else "synthetic"
    if field_data_state == "synthetic" and has_high_res_import:
        field_data_state = "hybrid-hourly"
    result = {
        "productionSource": pv_profile["productionSeriesSource"],
        "productionSourceLabel": pv_profile["productionSourceLabel"],
        "productionFallback": pv_profile["productionFallback"],
        "productionDispatchProfile": pv_profile["productionDispatchProfile"],
        "productionDispatchMetadata": {
            "productionSeriesSource": pv_profile["productionSeriesSource"],
            "annualKwh": round(pv_profile["annualKwh"]),
            "hasRealHourlyProduction": pv_profile["hasRealHourlyProduction"],
            "dispatchBus": pv_profile["dispatchBus"],
            "resolution": pv_profile["resolution"],
            "missingHours": pv_profile["missingHours"],
            "synthetic": pv_profile["synthetic"],
            "syntheticWeatherModel": pv_profile.get("syntheticWeatherModel"),
            "syntheticWeatherMetadata": pv_profile.get("syntheticWeatherMetadata"),
        },
        "loadMode": load_profile["mode"],
        "loadSource": load_profile["loadSource"],
        "hasRealHourlyLoad": load_profile["hasRealHourlyLoad"],
        "criticalLoadBasis": load_profile["criticalLoadBasis"],
        "fieldImportSummary": field_import_summary,
        "annualTotalLoadKwh": load_profile["annualTotalKwh"],
        "annualCriticalLoadKwh": load_profile["annualCriticalKwh"],
        "deviceSummary": load_profile["deviceSummary"],
        "syntheticPeakModel": load_profile["syntheticPeakModel"],
        "designCorrections": design_corrections,
        "deviceCount": load_profile["deviceCount"],
        "criticalDeviceCount": load_profile["criticalDeviceCount"],
        "calculationMode": calculation_mode,
        "accuracyAssessment": accuracy_assessment,
        "accuracyScore": accuracy_assessment["accuracyScore"],
        "accuracyTier": accuracy_assessment["tier"],
        "expectedUncertaintyPct": accuracy_assessment["expectedUncertaintyPct"],
        "dispatchType": "hourly-8760-dispatch" if load_profile["hasRealHourlyLoad"] else "synthetic-8760-dispatch",
        "methodologyNote": "real-pv-and-real-load-hourly-dispatch-pre-feasibility" if pv_profile["hasRealHourlyProduction"] and load_profile["hasRealHourlyLoad"] else "synthetic-dispatch-pre-feasibility",
        "provisional": True,
        "synthetic": not load_profile["hasRealHourlyLoad"] or not pv_profile["hasRealHourlyProduction"],
        "feasibilityNotGuaranteed": True,
        "dispatchVersion": "OGD-PY-2026.04-v1",
        "fieldGuaranteeReadiness": readiness,
        "fieldStressAnalysis": stress,
        "fieldModelMaturityGate": field_model_maturity_gate,
        "fieldGuaranteeCandidate": bool(readiness.get("phase1Ready")),
        "fieldGuaranteeReady": False,
        "fieldDataState": field_data_state,
        "dataLineage": {
            "version": "GH-OFFGRID-LINEAGE-2026.04-v1",
            "fieldDataState": field_data_state,
            "production": {
                "source": pv_profile["productionSeriesSource"],
                "sourceLabel": pv_profile["productionSourceLabel"],
                "dispatchProfile": pv_profile["productionDispatchProfile"],
                "realHourly": has_real_pv_hourly,
                "fallback": bool(pv_profile["productionFallback"]),
            },
            "load": {
                "source": load_profile["loadSource"],
                "mode": load_profile["mode"],
                "realHourly": has_real_load_hourly,
            },
            "criticalLoad": {
                "realHourly": has_real_critical_hourly,
            },
            "economics": {
                "financialSavingsBasis": "off-grid-user-alternative-energy-cost" if finite(getattr(request.tariff, "offGridCostPerKwhTry", 0.0), 0.0) > 0 else "off-grid-grid-tariff-times-2_5-proxy",
                "authoritativeFinancialBasis": "backend-offgrid-l2-dispatch",
            },
            "gates": {
                "phase1Ready": bool(readiness.get("phase1Ready")),
                "phase2Ready": False,
                "phase3Ready": bool(field_model_maturity_gate.get("phase3Ready")),
                "phase4Ready": False,
                "phase5Ready": False,
                "phase6Ready": False,
            },
        },
        "parityAvailable": True,
    }
    result.update(
        {
            "directPvKwh": normal["directPvToLoadKwh"],
            "batteryKwh": normal["batteryToLoadKwh"],
            "generatorKwh": normal["generatorToLoadKwh"],
            "generatorEnergyKwh": normal["generatorToLoadKwh"],
            "generatorOutputKwh": normal["generatorOutputKwh"],
            "generatorToBatteryKwh": normal["generatorToBatteryKwh"],
            "generatorWastedKwh": normal["generatorWastedKwh"],
            "curtailedPvKwh": normal["curtailedPvKwh"],
            "unmetLoadKwh": normal["unmetLoadKwh"],
            "unmetCriticalKwh": normal["unmetCriticalLoadKwh"],
            "totalLoadCoverage": normal["totalLoadCoverage"],
            "criticalLoadCoverage": normal["criticalLoadCoverage"],
            "criticalCoverageWithGenerator": normal["criticalLoadCoverage"],
            "totalLoadCoverageWithGenerator": normal["totalLoadCoverage"],
            "criticalLoadCoverageWithGenerator": normal["criticalLoadCoverage"],
            "totalLoadCoverageWithoutGenerator": without_generator["totalLoadCoverage"] if without_generator else (None if generator["enabled"] else normal["totalLoadCoverage"]),
            "criticalLoadCoverageWithoutGenerator": without_generator["criticalLoadCoverage"] if without_generator else (None if generator["enabled"] else normal["criticalLoadCoverage"]),
            "criticalCoverageWithoutGenerator": without_generator["criticalLoadCoverage"] if without_generator else (None if generator["enabled"] else normal["criticalLoadCoverage"]),
            "pvBatteryLoadCoverage": normal["solarBatteryLoadCoverage"],
            "pvBatteryCriticalCoverage": normal["solarBatteryCriticalCoverage"],
            "autonomousDays": normal["autonomousDays"],
            "autonomousDaysPct": normal["autonomousDaysPct"],
            "autonomousDaysWithGenerator": normal["autonomousDaysWithGenerator"],
            "autonomousDaysWithGeneratorPct": normal["autonomousDaysWithGeneratorPct"],
            "cyclesPerYear": normal["cyclesPerYear"],
            "minimumSoc": normal["minimumSocPct"],
            "averageSoc": normal["averageSocPct"],
            "minimumSocKwh": normal["minimumSocKwh"],
            "averageSocKwh": normal["averageSocKwh"],
            "batteryReservePct": normal["socReservePct"] * 100,
            "batteryChargeEfficiencyPct": normal["chargeEfficiency"] * 100,
            "batteryDischargeEfficiencyPct": normal["dischargeEfficiency"] * 100,
            "batteryRoundTripEfficiencyPct": normal["roundTripEfficiency"] * 100,
            "batteryEffectiveChargeEfficiencyPct": normal["effectiveChargeEfficiencyAvg"] * 100,
            "batteryEffectiveDischargeEfficiencyPct": normal["effectiveDischargeEfficiencyAvg"] * 100,
            "dynamicBatteryEfficiencyModel": normal["dynamicBatteryEfficiencyModel"],
            "batteryMaxChargeKw": normal["maxChargePowerKw"],
            "batteryMaxDischargeKw": normal["maxDischargePowerKw"],
            "batteryChargeLimitedKwh": normal["batteryChargeLimitedKwh"],
            "batteryDischargeLimitedKwh": normal["batteryDischargeLimitedKwh"],
            "inverterAcLimitKw": normal["inverterAcLimitKw"],
            "inverterSurgeMultiplier": normal["inverterSurgeMultiplier"],
            "inverterSurgeLimitKw": normal["inverterSurgeLimitKw"],
            "inverterPowerLimitedKwh": normal["inverterPowerLimitedLoadKwh"],
            "inverterPowerLimitHours": normal["inverterPowerLimitHours"],
            "generatorEnabled": generator["enabled"],
            "generatorCapacityKw": generator["capacityKw"],
            "generatorRunHoursPerYear": normal["generatorRunHours"],
            "generatorFuelCostAnnual": normal["generatorFuelCostAnnual"],
            "generatorFuelCostPerKwh": generator["fuelCostPerKwh"],
            "generatorMaintenanceCostAnnual": max(0.0, finite(offgrid.generatorMaintenanceCostTry if offgrid else 0.0, 0.0)),
            "generatorStrategy": normal["generatorStrategy"],
            "generatorFuelType": offgrid.generatorFuelType if offgrid else "diesel",
            "generatorSizePreset": offgrid.generatorSizePreset if offgrid else "auto",
            "generatorReservePct": finite(offgrid.generatorReservePct if offgrid else 0.0, 0.0),
            "generatorStartSocPct": normal["generatorStartSocPct"],
            "generatorStopSocPct": normal["generatorStopSocPct"],
            "generatorMaxHoursPerDay": finite(offgrid.generatorMaxHoursPerDay if offgrid else 0.0, 0.0),
            "generatorMinLoadRatePct": normal["generatorMinLoadRatePct"],
            "generatorChargeBatteryEnabled": normal["generatorChargeBatteryEnabled"],
            "generatorCapex": max(0.0, finite(offgrid.generatorCapexTry if offgrid else 0.0, 0.0)),
            "generatorCapexTry": max(0.0, finite(offgrid.generatorCapexTry if offgrid else 0.0, 0.0)),
            "generatorCapexMissing": generator["enabled"] and finite(offgrid.generatorCapexTry if offgrid else 0.0, 0.0) <= 0,
            "badWeatherScenario": bad_weather,
            "weatherScenario": offgrid.badWeatherLevel if offgrid else "",
            "autonomyThresholdPct": normal["autonomyThresholdPct"],
            "hourly8760": normal["hourly8760"],
        }
    )
    return result
