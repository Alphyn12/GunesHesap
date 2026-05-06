from __future__ import annotations

from datetime import datetime, timezone
from importlib.util import find_spec
from typing import Any

from backend.engines.simple_engine import (
    _annual_ghi_to_psh,
    bifacial_gain,
    cable_loss_factor,
    inverter_efficiency,
    layout_sections_from_snapshot,
    layout_snapshot,
    panel_area_m2,
    panel_watt_peak,
    system_power_from_layout_snapshot,
)
from backend.models.engine_contracts import EngineRequest, EngineSource


PVLIB_AVAILABLE = find_spec("pvlib") is not None

# Temperature coefficients (P_max / °C) per panel technology — used for pvwatts_dc gamma_pdc
PANEL_GAMMA_PDC: dict[str, float] = {
    "mono_perc": -0.0034,
    "n_type_topcon": -0.0029,
    "bifacial_topcon": -0.0028,
    "hjt": -0.0024,
    "mono": -0.0034,
    "bifacial": -0.0028,
    "poly": -0.0029,
}

PVLIB_CONFIDENCE_LEVEL = "medium"

CITY_SUMMER_TEMPS: dict[str, float] = {
    "Rize": 23, "Trabzon": 24, "Giresun": 24, "Artvin": 25, "Ordu": 25,
    "Sinop": 24, "Samsun": 26, "Zonguldak": 25, "Bartın": 25,
    "Erzurum": 21, "Kars": 20, "Ardahan": 19, "Ağrı": 22, "Iğdır": 28,
    "Hakkari": 28, "Bitlis": 25, "Muş": 27, "Bingöl": 28, "Tunceli": 27,
    "Van": 26, "Bayburt": 22, "Gümüşhane": 24, "Erzincan": 27,
    "İstanbul": 28, "Istanbul": 28, "Edirne": 29, "Kırklareli": 28, "Tekirdağ": 27,
    "Bursa": 29, "Balıkesir": 30, "Çanakkale": 28, "Bilecik": 28,
    "Eskişehir": 28, "Kütahya": 27, "Afyonkarahisar": 28,
    "İzmir": 32, "Izmir": 32, "Aydın": 33, "Muğla": 32, "Denizli": 31, "Uşak": 30,
    "Antalya": 35, "Mersin": 34, "Adana": 36, "Hatay": 34, "Osmaniye": 35,
    "Şanlıurfa": 38, "Sanliurfa": 38, "Gaziantep": 36, "Mardin": 37, "Diyarbakır": 38,
    "Batman": 37, "Şırnak": 37, "Sirnak": 37, "Siirt": 36, "Adıyaman": 36, "Adiyaman": 36,
    "Kahramanmaraş": 35, "Kahramanmaras": 35, "Elazığ": 33, "Elazig": 33, "Malatya": 33,
    "Konya": 31, "Kayseri": 28, "Sivas": 27, "Yozgat": 26,
    "Ankara": 29, "Kırıkkale": 28, "Kirikkale": 28, "Kırşehir": 28, "Kirsehir": 28,
    "Nevşehir": 28, "Nevsehir": 28, "Aksaray": 29, "Niğde": 27, "Nigde": 27, "Karaman": 30,
    "Isparta": 30, "Burdur": 30,
    "default": 32,
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _city_summer_peak(city_name: str | None) -> float:
    if city_name and city_name in CITY_SUMMER_TEMPS:
        return CITY_SUMMER_TEMPS[city_name]
    return CITY_SUMMER_TEMPS["default"]


def _ambient_temperature_profile(day_of_year, city_name: str | None):
    import numpy as np

    summer_peak = _clamp(_city_summer_peak(city_name), 20, 42)
    winter_trough = _clamp(summer_peak - 22, 4, 18)
    seasonal_mean = (summer_peak + winter_trough) / 2
    seasonal_amplitude = (summer_peak - winter_trough) / 2
    return seasonal_mean + seasonal_amplitude * np.sin(2 * np.pi * (day_of_year - 172) / 365)


def _system_power_kwp(request: EngineRequest) -> tuple[float, int]:
    snapshot_power = system_power_from_layout_snapshot(request)
    if snapshot_power:
        return snapshot_power
    explicit_kwp = getattr(request.system, "targetPowerKwp", None)
    if explicit_kwp:
        kwp = max(0, float(explicit_kwp))
        panel_watt = panel_watt_peak(request)
        return kwp, max(1, round((kwp * 1000) / panel_watt))

    panel_watt = panel_watt_peak(request)
    panel_area = panel_area_m2(request)
    usable_area = max(0, request.roof.areaM2) * max(0.1, min(1.0, request.roof.usableRoofRatio))
    panel_count = int(usable_area // panel_area)
    return panel_count * panel_watt / 1000, panel_count


def _has_valid_site_coordinates(request: EngineRequest) -> bool:
    lat = request.site.lat
    lon = request.site.lon
    return (
        lat is not None
        and lon is not None
        and -90 <= float(lat) <= 90
        and -180 <= float(lon) <= 180
    )


def _representative_year() -> int:
    year = datetime.now(timezone.utc).year
    is_leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    return year - 1 if is_leap else year


def engine_source(mode: str = "auto", fallback_reason: str | None = None) -> EngineSource:
    if mode == "pvlib" and PVLIB_AVAILABLE and not fallback_reason:
        return EngineSource(
            engine="python-backend",
            provider="python-pvlib",
            source="pvlib-backed",
            confidence="medium",
            engineQuality="engineering-mvp",
            pvlibReady=True,
            pvlibBacked=True,
            fallbackUsed=False,
            # Faz-1 D1: Frontend authoritative gating reads weatherSource to refuse
            # overriding real PVGIS production with a synthetic clear-sky model.
            # This stays "clearsky-scaled-synthetic" until pvlib is wired to TMY/ERA5.
            weatherSource="clearsky-scaled-synthetic",
            notes=[
                "pvlib solar position, clear-sky irradiance, POA transposition, cell temperature, and PVWatts DC model are active.",
                "Panel wattage, panel area, inverter efficiency, bifacial gain, and cable loss are read from the shared frontend/backend request contract when present.",
                "Weather uses city-adjusted seasonal temperature and constant 1.5 m/s wind — measured data not yet integrated.",
                "Inverter clipping, AOI losses, and dispatch remain simplified in this MVP pass.",
            ],
        )

    if fallback_reason:
        return EngineSource(
            engine="python-backend",
            provider="python-deterministic-fallback",
            source="Python backend deterministic fallback",
            confidence="medium-low",
            engineQuality="fallback-estimate",
            pvlibReady=True,
            pvlibBacked=False,
            fallbackUsed=True,
            weatherSource="none",
            notes=[
                fallback_reason,
                "Deterministic backend model preserved the normalized response contract.",
                "Install pvlib and provide richer irradiance/weather inputs for the pvlib-backed path.",
            ],
        )

    return EngineSource(
        engine="python-backend",
        provider="python-pvlib-ready",
        source="Python backend pvlib-ready",
        confidence="medium",
        engineQuality="adapter-ready",
        pvlibReady=True,
        pvlibBacked=False,
        fallbackUsed=False,
        weatherSource="none",
        notes=[
            "pvlib is not installed in this environment; deterministic backend engine is active.",
            "TODO(pvlib): add measured/PVGIS hourly weather, AOI losses, clipping, inverter curves, and dispatch.",
        ],
    )


def pvlib_status() -> dict[str, Any]:
    return {
        "pvlibAvailable": PVLIB_AVAILABLE,
        "pvlibBackedEngineAvailable": PVLIB_AVAILABLE,
        "activeWhenAvailable": "pvlib-backed",
        "fallbackEngine": "python-deterministic-fallback",
        "completedWork": [
            "pvlib solar position (hourly, location-aware)",
            "Haydavies POA transposition",
            "ASHRAE AOI/IAM beam component correction (b=0.05)",
            "mounting-type SAPM cell temperature model (rooftop / ground-mount / bipv)",
            "PVWatts DC model with gamma_pdc from panel contract",
            "PVWatts part-load inverter efficiency curves (eta_ref=0.9637)",
            "multi-section layout geometry from frontend snapshot",
            "bifacial gain (contract-driven)",
            "parametric P50/P90 uncertainty bands (RSS, clearsky-synthetic)",
            "battery dispatch (via offgrid_engine chain)",
        ],
        "futureWork": [
            "measured/PVGIS hourly weather (TMY or ERA5) — replaces clearsky-synthetic",
            "off-grid irrigation pump curves",
        ],
    }


def can_use_pvlib(request: EngineRequest) -> bool:
    return (
        PVLIB_AVAILABLE
        and _has_valid_site_coordinates(request)
        and _system_power_kwp(request)[0] > 0
    )


# UNC-1: Parametrik belirsizlik bileşenleri — clearsky-synthetic hava modeli için.
# Her bileşen 1-sigma oransal standart sapması (birimsiz kesir).
# Kaynak: NREL PVWatts, IEC 61215, PVGIS validation çalışmaları.
_UNCERTAINTY_COMPONENTS_CLEARSKY: dict[str, float] = {
    "clearsky_synthetic_ghi":      0.060,  # clearsky vs. gerçek TMY farkı
    "panel_performance_tolerance": 0.015,  # IEC 61215 ±3% fabrika toleransı
    "temperature_model":           0.010,  # SAPM validation belirsizliği
    "shading_base":                0.020,  # kullanıcı tahmini gölge
    "soiling_fixed_assumption":    0.015,  # sabit % yerine dinamik model eksikliği
}


def _compute_uncertainty_bands(
    annual_kwh: float,
    weather_source: str,
    shading_pct: float,
) -> dict[str, Any]:
    """Parametrik P50/P90 belirsizlik bandı hesabı.

    Bileşik belirsizlik (σ): RSS (Root Sum of Squares) yöntemi.
    P90 = P50 × (1 − z_0.90 × σ_combined), z_0.90 = 1.282.

    Clearsky-synthetic hava modeli için σ_GHI = %6;
    gerçek TMY/ERA5 için %2.5'e düşürülür (henüz entegre değil).
    """
    components = dict(_UNCERTAINTY_COMPONENTS_CLEARSKY)

    # Hava kaynağına göre GHI belirsizliğini ayarla
    if weather_source in {"pvgis-tmy", "era5", "measured"}:
        components["clearsky_synthetic_ghi"] = 0.025
    elif weather_source == "psh-deterministic-synthetic":
        components["clearsky_synthetic_ghi"] = 0.080

    # Yüksek gölge → artan belirsizlik
    if shading_pct > 20:
        components["shading_base"] = 0.035
    elif shading_pct > 10:
        components["shading_base"] = 0.025

    sigma = (sum(v ** 2 for v in components.values())) ** 0.5
    z_p90 = 1.282   # standart normal: P(X < μ − 1.282σ) = 0.10
    z_p75 = 0.674

    p50 = annual_kwh
    return {
        "p50Kwh": round(p50),
        "p75Kwh": round(p50 * (1.0 - z_p75 * sigma)),
        "p90Kwh": round(p50 * (1.0 - z_p90 * sigma)),
        "uncertaintyPct": round(sigma * 100, 2),
        "uncertaintyComponents": {k: round(v * 100, 2) for k, v in components.items()},
        "weatherSourceForUncertainty": weather_source,
        "methodology": "parametric-rss",
        "note": (
            "P90 = P50 × (1 − 1.282 × σ). clearsky-synthetic hava modeliyle "
            "bankable P90 için ölçülmüş TMY kaynağı gerekir; bu değer ön fizibilite içindir."
            if weather_source == "clearsky-scaled-synthetic"
            else "Parametrik RSS belirsizlik hesabı."
        ),
    }


def calculate_pvlib_production(request: EngineRequest) -> dict[str, Any]:
    if not PVLIB_AVAILABLE:
        raise RuntimeError("pvlib is not installed")
    if request.site.lat is None or request.site.lon is None:
        raise ValueError("pvlib engine requires latitude and longitude")

    import pandas as pd
    import pvlib

    system_power_kwp, panel_count = _system_power_kwp(request)
    if system_power_kwp <= 0:
        raise ValueError("pvlib engine requires positive installed capacity")

    tz = request.site.timezone or "Europe/Istanbul"
    year = _representative_year()
    times = pd.date_range(f"{year}-01-01 00:00", periods=8760, freq="h", tz=tz)

    location = pvlib.location.Location(
        latitude=float(request.site.lat),
        longitude=float(request.site.lon),
        tz=tz,
        name=request.site.cityName or "Solar Rota site",
    )
    solar_position = location.get_solarposition(times)
    clearsky = location.get_clearsky(times, model="ineichen")
    dni_extra = pvlib.irradiance.get_extra_radiation(times)

    target_annual_ghi = _annual_ghi_to_psh(request.site.ghi, request.site.cityName) * 365
    # Defensive floor against division-by-zero only — must be tiny so a degenerate
    # clearsky sum does not silently distort ghi_scale (clamped downstream regardless).
    clear_annual_ghi = max(float(clearsky["ghi"].sum()) / 1000, 1e-6)
    ghi_scale = _clamp(target_annual_ghi / clear_annual_ghi, 0.45, 1.00)

    scaled_ghi = clearsky["ghi"] * ghi_scale
    scaled_dni = clearsky["dni"] * ghi_scale
    scaled_dhi = clearsky["dhi"] * ghi_scale

    soiling_factor = 1 - _clamp(float(request.roof.soilingPct or 0), 0, 50) / 100
    wiring_mismatch_factor = cable_loss_factor(request)
    bifacial_factor = 1 + bifacial_gain(request)
    _contract_coeff = getattr(request.system, "panelTempCoeffPerC", None)
    if _contract_coeff is not None:
        try:
            _contract_coeff = float(_contract_coeff)
            gamma_pdc = _contract_coeff if -0.01 <= _contract_coeff <= 0 else PANEL_GAMMA_PDC.get(request.system.panelType, -0.0037)
        except (TypeError, ValueError):
            gamma_pdc = PANEL_GAMMA_PDC.get(request.system.panelType, -0.0037)
    else:
        gamma_pdc = PANEL_GAMMA_PDC.get(request.system.panelType, -0.0037)

    inverter_eff = inverter_efficiency(request)
    day_of_year = pd.Series(times.dayofyear, index=times)
    summer_peak = _city_summer_peak(request.site.cityName)
    winter_trough = _clamp(summer_peak - 22, 4, 18)
    ambient_temp = _ambient_temperature_profile(day_of_year, request.site.cityName)
    wind_speed = pd.Series(1.5, index=times)

    # TEMP-1: Montaj tipine göre SAPM sıcaklık modeli seçimi.
    # open_rack_glass_glass:        a=-3.47, b=-0.0594, ΔT=3 — zemin kurulumu / açık raf
    # close_mount_glass_glass:      a=-2.98, b=-0.0471, ΔT=1 — çatı montajı (sınırlı hava akışı)
    # insulated_back_glass_polymer: a=-2.81, b=-0.0455, ΔT=0 — BIPV / bina entegreli
    # Türkiye ağırlıklı kullanım çatı (rooftop); close_mount_glass_glass varsayılan.
    _TEMP_MODEL_MAP = {
        "ground-mount": "open_rack_glass_glass",
        "carport":      "open_rack_glass_glass",
        "bipv":         "insulated_back_glass_polymer",
    }
    _mounting_type = getattr(request.roof, "mountingType", None) or "rooftop"
    _temp_model_key = _TEMP_MODEL_MAP.get(_mounting_type, "close_mount_glass_glass")
    temp_params = pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"][_temp_model_key]

    snapshot_sections = layout_sections_from_snapshot(request)
    use_section_geometry = bool(snapshot_sections)
    pv_sections = snapshot_sections or [
        {
            "systemPowerKwp": system_power_kwp,
            "tiltDeg": float(request.roof.tiltDeg),
            "azimuthDeg": float(request.roof.azimuthDeg),
            "shadingPct": float(request.roof.shadingPct or 0),
        }
    ]

    pdc_parts = []
    ac_parts = []
    clipped_parts = []
    weighted_poa_annual = 0.0
    weighted_effective_poa_annual = 0.0
    weighted_shading_pct = 0.0
    for section in pv_sections:
        section_power_kwp = max(0, float(section.get("systemPowerKwp") or 0))
        if section_power_kwp <= 0:
            continue
        _section_tilt = _clamp(float(section.get("tiltDeg", request.roof.tiltDeg)), 0, 90)
        _section_azimuth = float(section.get("azimuthDeg", request.roof.azimuthDeg))
        section_poa = pvlib.irradiance.get_total_irradiance(
            surface_tilt=_section_tilt,
            surface_azimuth=_section_azimuth,
            dni=scaled_dni,
            ghi=scaled_ghi,
            dhi=scaled_dhi,
            solar_zenith=solar_position["apparent_zenith"],
            solar_azimuth=solar_position["azimuth"],
            dni_extra=dni_extra,
            model="haydavies",
        )

        # AOI-1: ASHRAE IAM düzeltmesi — sadece beam (direkt) bileşenine uygulanır.
        # b=0.05: standart cam panel referans değeri (IEC 61215 kalibrasyonu).
        # Diffüz ve zemin yansıma bileşenleri değişmez (izotropik ortalama varsayımı).
        _aoi = pvlib.irradiance.aoi(
            surface_tilt=_section_tilt,
            surface_azimuth=_section_azimuth,
            solar_zenith=solar_position["apparent_zenith"],
            solar_azimuth=solar_position["azimuth"],
        )
        _iam = pvlib.iam.ashrae(_aoi, b=0.05)
        _beam     = section_poa["poa_direct"].clip(lower=0).fillna(0)
        _diffuse  = (
            section_poa["poa_sky_diffuse"].clip(lower=0).fillna(0)
            + section_poa["poa_ground_diffuse"].clip(lower=0).fillna(0)
        )
        section_poa_global = (_beam * _iam + _diffuse).clip(lower=0)

        section_shading_pct = float(section.get("shadingPct", request.roof.shadingPct or 0) or 0)
        section_shading_factor = 1 - _clamp(section_shading_pct, 0, 80) / 100
        section_poa_effective = section_poa_global * section_shading_factor * soiling_factor * wiring_mismatch_factor * bifacial_factor
        section_cell_temp = pvlib.temperature.sapm_cell(section_poa_effective, ambient_temp, wind_speed, **temp_params)

        section_pdc0_w = section_power_kwp * 1000
        section_pdc_w = pvlib.pvsystem.pvwatts_dc(
            effective_irradiance=section_poa_effective,
            temp_cell=section_cell_temp,
            pdc0=section_pdc0_w,
            gamma_pdc=gamma_pdc,
            temp_ref=25,
        ).clip(lower=0)

        # INV-1: PVWatts inverter modeli — part-load verim eğrisi + clipping.
        # eta_inv_ref=0.9637: NREL PVWatts v5 referans değeri.
        # Sabit eta × clamp yerine gerçekçi kısmi yük düzeltmesi sağlar.
        section_ac_w = pvlib.inverter.pvwatts(
            pdc=section_pdc_w,
            pdc0=section_pdc0_w,
            eta_inv_nom=inverter_eff,
            eta_inv_ref=0.9637,
        ).clip(lower=0).fillna(0)
        section_clipped_w = (section_pdc_w - section_ac_w / max(inverter_eff, 1e-6)).clip(lower=0).fillna(0)
        pdc_parts.append(section_pdc_w)
        ac_parts.append(section_ac_w)
        clipped_parts.append(section_clipped_w)
        section_weight = section_power_kwp / max(system_power_kwp, 1e-9)
        weighted_poa_annual += (float(section_poa_global.sum()) / 1000) * section_weight
        weighted_effective_poa_annual += (float(section_poa_effective.sum()) / 1000) * section_weight
        weighted_shading_pct += section_shading_pct * section_weight

    if not ac_parts:
        raise ValueError("pvlib engine requires positive section capacity")

    pdc_w = pdc_parts[0]
    ac_w = ac_parts[0]
    clipped_w = clipped_parts[0]
    for idx in range(1, len(ac_parts)):
        pdc_w = pdc_w.add(pdc_parts[idx], fill_value=0)
        ac_w = ac_w.add(ac_parts[idx], fill_value=0)
        clipped_w = clipped_w.add(clipped_parts[idx], fill_value=0)

    # "ME" pandas 2.2+; eski sürümler "M" kullanır — her iki alias denenebilir
    try:
        monthly_kwh = (ac_w.resample("ME").sum() / 1000).round(2).tolist()
    except Exception:
        monthly_kwh = (ac_w.resample("M").sum() / 1000).round(2).tolist()
    hourly_kwh = (ac_w / 1000).round(5).tolist()
    annual_kwh = float(sum(monthly_kwh))
    poa_annual = weighted_poa_annual
    effective_poa_annual = weighted_effective_poa_annual
    dc_annual_kwh = float(pdc_w.sum()) / 1000
    clipping_kwh = float(clipped_w.sum()) / 1000
    capacity_factor = (annual_kwh / max(system_power_kwp * 8760, 1)) * 100

    # Faz-1 D3: surface bifacial gain in kWh so the frontend authoritative path can
    # reuse the engine-computed value instead of hard-coding 5%.
    bifacial_gain_kwh = annual_kwh * (bifacial_factor - 1) / max(bifacial_factor, 1e-9)
    loss_flags = {
        "shadingPct": round(weighted_shading_pct, 3),
        "soilingPct": float(request.roof.soilingPct or 0),
        "wiringMismatchPct": round((1 - wiring_mismatch_factor) * 100, 2),
        "wiringLossPct": round((1 - wiring_mismatch_factor) * 100, 2),
        "bifacialFactor": round(bifacial_factor, 4),
        "bifacialGainKwh": round(max(0.0, bifacial_gain_kwh), 2),
        "contractPanelWattPeak": round(panel_watt_peak(request), 3),
        "contractPanelAreaM2": round(panel_area_m2(request), 4),
        "contractInverterEfficiency": round(inverter_eff, 4),
        "layoutSnapshotUsed": bool(system_power_from_layout_snapshot(request)),
        "layoutSectionGeometryUsed": use_section_geometry,
        "layoutSnapshot": layout_snapshot(request),
        "gammaPdc": round(gamma_pdc, 4),
        "gammaPdcSource": "contract" if (_contract_coeff is not None and -0.01 <= float(_contract_coeff) <= 0) else "panel-type-map",
        "temperatureModel": f"pvlib.sapm_cell.{_temp_model_key}",
        "temperatureModelMountingType": _mounting_type,
        "temperatureProfileModel": "city-adjusted-seasonal-sine",
        "temperatureProfileSummerPeakC": round(summer_peak, 1),
        "temperatureProfileWinterTroughC": round(winter_trough, 1),
        "temperatureProfileCity": request.site.cityName or "default",
        "dcModel": "pvlib.pvsystem.pvwatts_dc",
        "transpositionModel": "pvlib.irradiance.haydavies",
        "aoiModel": "pvlib.iam.ashrae",
        "aoiB0": 0.05,
        "aoiCorrectionApplied": True,
        "inverterApproximation": "pvlib.inverter.pvwatts (part-load corrected)",
        "inverterEtaRef": 0.9637,
        "clippingKwh": round(clipping_kwh, 2),
        # Faz-1 D1: explicit weather provenance label so the frontend authoritative
        # gate refuses synthetic clear-sky over real PVGIS until TMY/ERA5 is wired.
        "weatherSource": "clearsky-scaled-synthetic",
    }

    # UNC-1: P50/P90 hesabı — tüm loss_flags tamamlandıktan sonra çağrılır
    _uncertainty = _compute_uncertainty_bands(
        annual_kwh=annual_kwh,
        weather_source="clearsky-scaled-synthetic",
        shading_pct=weighted_shading_pct,
    )

    return {
        "engineSource": engine_source("pvlib"),
        "production": {
            "annualEnergyKwh": round(annual_kwh),
            "monthlyEnergyKwh": monthly_kwh,
            "hourlyEnergyKwh": hourly_kwh,
            "systemPowerKwp": round(system_power_kwp, 3),
            "panelCount": panel_count,
            "psh": round(annual_kwh / max(system_power_kwp * 365, 1), 3),
            "capacityFactorPct": round(capacity_factor, 2),
            "annual_kwh": round(annual_kwh, 2),
            "monthly_kwh": monthly_kwh,
            "hourly_kwh": hourly_kwh,
            "engine_used": "pvlib-backed",
            "engine_quality": "engineering-mvp",
            "confidence_level": PVLIB_CONFIDENCE_LEVEL,
            "weatherSource": "clearsky-scaled-synthetic",
            "p50Kwh": _uncertainty["p50Kwh"],
            "p75Kwh": _uncertainty["p75Kwh"],
            "p90Kwh": _uncertainty["p90Kwh"],
            "uncertaintyPct": _uncertainty["uncertaintyPct"],
            "assumption_flags": {
                "usesClearSkyIrradianceScaledToInputGhi": True,
                "usesMeasuredWeather": False,
                "usesHourlySolarPosition": True,
                "usesPvlibTemperatureModel": True,
                "usesSimplifiedInverterModel": False,
                "usesAoiCorrection": True,
                "usesPartLoadInverterCurve": True,
                "weatherSource": "clearsky-scaled-synthetic",
            },
        },
        "losses": {
            "poaAnnualKwhM2": round(poa_annual, 2),
            "effectivePoaAnnualKwhM2": round(effective_poa_annual, 2),
            "dcAnnualKwh": round(dc_annual_kwh, 2),
            "acAnnualKwh": round(annual_kwh, 2),
            "ghiScaleFactor": round(ghi_scale, 4),
            **loss_flags,
            "uncertaintyBands": _uncertainty,
            "modelCompleteness": (
                "pvlib MVP: solar position + Haydavies transposition + ASHRAE AOI/IAM "
                "+ mounting-type SAPM temperature + PVWatts DC + PVWatts part-load AC."
            ),
        },
        "raw": {
            "engineUsed": "pvlib-backed",
            "engine_used": "pvlib-backed",
            "engineQuality": "engineering-mvp",
            "engine_quality": "engineering-mvp",
            "confidenceLevel": PVLIB_CONFIDENCE_LEVEL,
            "confidence_level": PVLIB_CONFIDENCE_LEVEL,
            "sourceNotes": engine_source("pvlib").notes,
            "source_notes": engine_source("pvlib").notes,
            "parityNotes": [
                "System sizing is aligned to the frontend panel catalog through the request contract.",
                "Production may intentionally differ from browser PVGIS/JS because pvlib uses hourly solar position, transposition and temperature modeling.",
            ],
            "fallbackUsed": False,
            "fallback_flags": [],
            "simulationYear": year,
            "hourlySamples": len(times),
        },
    }
