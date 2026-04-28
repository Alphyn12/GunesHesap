from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from backend.engines.offgrid_engine import build_backend_offgrid_results
from backend.models.engine_contracts import EngineRequest


ROOT = Path(__file__).resolve().parents[2]
JS_FIXTURE = ROOT / "tests" / "offgrid-parity-fixture.mjs"
HOURS_PER_YEAR = 8760
MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
KWH_TOL = 0.25
RATIO_TOL = 1e-6
KW_TOL = 0.05
# Coverage drop fields are reported in percentage points (0-100 scale), not kW.
# Synthetic-dispatch micro-divergences between JS and Python rounding can shift
# the drop figure by a few hundredths of a percentage point even when annual
# generator kWh stays within KWH_TOL — guard with a wider point-scale tolerance.
PCT_TOL = 0.20


def make_flat_hourly(kwh_per_hour: float) -> list[float]:
    return [kwh_per_hour] * HOURS_PER_YEAR


def make_daytime_hourly(daily_kwh: float, start_hour: int = 8, end_hour: int = 17) -> list[float]:
    hours = max(1, end_hour - start_hour)
    hourly = []
    for _ in range(365):
        for hour in range(24):
            hourly.append((daily_kwh / hours) if start_hour <= hour < end_hour else 0.0)
    return hourly


def make_monthly_production(monthly_totals: list[float]) -> list[float]:
    assert len(monthly_totals) == 12
    return monthly_totals


def base_request() -> dict:
    return {
        "schema": "GH-PV-ENGINE-CONTRACT-2026.04-v1",
        "requestedEngine": "python-backend",
        "scenario": {"key": "off-grid", "label": "Off-Grid", "proposalTone": "autonomy"},
        "system": {
            "batteryEnabled": True,
            "battery": {
                "capacity": 14.4,
                "dod": 0.9,
                "efficiency": 0.94,
                "socReservePct": 15,
                "eolCapacityPct": 80,
                "eolEfficiencyLossPct": 3,
            },
            "batteryMaxChargeKw": 5,
            "batteryMaxDischargeKw": 5,
            "offgridInverterAcKw": 6,
            "offgridInverterSurgeMultiplier": 1.5,
            "netMeteringEnabled": False,
        },
        "load": {
            "dailyConsumptionKwh": 18,
            "hourlyConsumption8760": None,
            "hourlyProduction8760": None,
            "offgridCriticalLoad8760": None,
            "offgridDevices": [],
            "offgridCriticalFraction": 0.35,
        },
        "offgrid": {
            "calculationMode": "advanced",
            "generatorEnabled": True,
            "generatorKw": 4.5,
            "generatorFuelCostPerKwh": 6.5,
            "generatorCapexTry": 120000,
            "generatorStrategy": "critical-backup",
            "generatorFuelType": "diesel",
            "generatorSizePreset": "manual",
            "generatorReservePct": 20,
            "generatorStartSocPct": 25,
            "generatorStopSocPct": 70,
            "generatorMaxHoursPerDay": 8,
            "generatorMinLoadRatePct": 30,
            "generatorChargeBatteryEnabled": False,
            "generatorMaintenanceCostTry": 8000,
            "generatorOverhaulHours": 2000,
            "generatorOverhaulCostTry": 45000,
            "badWeatherLevel": "moderate",
            "fieldGuaranteeMode": False,
        },
        "tariff": {
            "tariffType": "residential",
            "offGridCostPerKwhTry": 19.5,
        },
    }


def scenario_real_hourly_user_pv() -> tuple[dict, dict]:
    request = base_request()
    request["load"]["hourlyConsumption8760"] = make_flat_hourly(0.75)
    request["load"]["offgridCriticalLoad8760"] = make_flat_hourly(0.30)
    request["load"]["hourlyProduction8760"] = make_daytime_hourly(14.4)
    production = {
        "annualEnergyKwh": round(sum(request["load"]["hourlyProduction8760"]), 6),
        "monthlyEnergyKwh": [0] * 12,
        "systemPowerKwp": 5.2,
    }
    return request, production


def scenario_backend_hourly_production() -> tuple[dict, dict]:
    request = base_request()
    request["load"]["hourlyConsumption8760"] = make_flat_hourly(0.62)
    request["load"]["offgridCriticalLoad8760"] = make_flat_hourly(0.25)
    request["load"]["hourlyProduction8760"] = None
    request["offgrid"]["generatorStrategy"] = "full-backup"
    request["offgrid"]["generatorChargeBatteryEnabled"] = True
    request["offgrid"]["generatorMinLoadRatePct"] = 45
    production_hourly = make_daytime_hourly(17.5, start_hour=7, end_hour=18)
    production = {
        "annualEnergyKwh": round(sum(production_hourly), 6),
        "hourlyEnergyKwh": production_hourly,
        "monthlyEnergyKwh": [0] * 12,
        "systemPowerKwp": 6.4,
    }
    return request, production


def scenario_device_monthly_synthetic() -> tuple[dict, dict]:
    request = base_request()
    request["load"]["dailyConsumptionKwh"] = 12
    request["load"]["hourlyConsumption8760"] = None
    request["load"]["offgridCriticalLoad8760"] = None
    request["load"]["offgridDevices"] = [
        {"name": "Buzdolabi", "category": "refrigerator", "powerW": 150, "hoursPerDay": 10, "isCritical": True, "usageType": "continuous"},
        {"name": "Pompa", "category": "pump", "powerW": 900, "hoursPerDay": 2.5, "isCritical": True, "usageType": "scheduled"},
        {"name": "Kettle", "category": "kitchen", "powerW": 2000, "hoursPerDay": 0.3, "isCritical": False, "usageType": "manual"},
        {"name": "Camasir", "category": "laundry", "powerW": 1700, "hoursPerDay": 1.2, "isCritical": False, "usageType": "cyclic"},
    ]
    request["load"]["offgridCriticalFraction"] = 0.4
    request["offgrid"]["generatorEnabled"] = False
    request["offgrid"]["generatorKw"] = 0
    request["offgrid"]["generatorFuelCostPerKwh"] = 0
    request["offgrid"]["generatorCapexTry"] = 0
    request["offgrid"]["badWeatherLevel"] = "severe"
    monthly = make_monthly_production([220, 260, 420, 520, 640, 720, 760, 730, 540, 410, 280, 210])
    production = {
        "annualEnergyKwh": sum(monthly),
        "monthlyEnergyKwh": monthly,
        "systemPowerKwp": 4.8,
    }
    return request, production


def summarize_bad_weather(bad_weather: dict | None) -> dict | None:
    if not bad_weather:
        return None
    return {
        "weatherLevel": bad_weather.get("weatherLevel"),
        "pvScaleFactor": bad_weather.get("pvScaleFactor"),
        "consecutiveDays": bad_weather.get("consecutiveDays"),
        "worstWindowDayOfYear": bad_weather.get("worstWindowDayOfYear"),
        "criticalCoverageDropPct": bad_weather.get("criticalCoverageDropPct"),
        "totalCoverageDropPct": bad_weather.get("totalCoverageDropPct"),
        "additionalGeneratorKwh": bad_weather.get("additionalGeneratorKwh"),
    }


def summarize_stress(stress: dict | None) -> dict | None:
    if not stress:
        return None
    scenarios = []
    for row in stress.get("scenarios", []):
        scenarios.append(
            {
                "key": row.get("key"),
                "totalLoadCoverage": row.get("totalLoadCoverage"),
                "criticalLoadCoverage": row.get("criticalLoadCoverage"),
                "unmetCriticalKwh": row.get("unmetCriticalKwh"),
                "generatorKwh": row.get("generatorKwh"),
                "inverterPowerLimitedKwh": row.get("inverterPowerLimitedKwh"),
                "batteryDischargeLimitedKwh": row.get("batteryDischargeLimitedKwh"),
                "peakCriticalKw": row.get("peakCriticalKw"),
            }
        )
    return {
        "worstCriticalScenarioKey": stress.get("worstCriticalScenario", {}).get("key"),
        "worstTotalScenarioKey": stress.get("worstTotalScenario", {}).get("key"),
        "maxUnmetCriticalScenarioKey": stress.get("maxUnmetCriticalScenario", {}).get("key"),
        "generatorCriticalPeakReservePct": stress.get("generatorCriticalPeakReservePct"),
        "scenarios": scenarios,
    }


def summarize_python_result(result: dict) -> dict:
    return {
        "dispatchVersion": result.get("dispatchVersion"),
        "loadMode": result.get("loadMode"),
        "loadSource": result.get("loadSource"),
        "criticalLoadBasis": result.get("criticalLoadBasis"),
        "calculationMode": result.get("calculationMode"),
        "productionSource": result.get("productionSource"),
        "productionDispatchProfile": result.get("productionDispatchProfile"),
        "productionDispatchMetadata": {
            "hasRealHourlyProduction": bool(result.get("productionDispatchMetadata", {}).get("hasRealHourlyProduction")),
            "syntheticWeatherModel": result.get("productionDispatchMetadata", {}).get("syntheticWeatherModel"),
            "syntheticWeatherMetadata": result.get("productionDispatchMetadata", {}).get("syntheticWeatherMetadata"),
        },
        "annualTotalLoadKwh": result.get("annualTotalLoadKwh"),
        "annualCriticalLoadKwh": result.get("annualCriticalLoadKwh"),
        "directPvKwh": result.get("directPvKwh"),
        "batteryKwh": result.get("batteryKwh"),
        "generatorKwh": result.get("generatorKwh"),
        "curtailedPvKwh": result.get("curtailedPvKwh"),
        "unmetLoadKwh": result.get("unmetLoadKwh"),
        "unmetCriticalKwh": result.get("unmetCriticalKwh"),
        "totalLoadCoverage": result.get("totalLoadCoverage"),
        "criticalLoadCoverage": result.get("criticalLoadCoverage"),
        "pvBatteryLoadCoverage": result.get("pvBatteryLoadCoverage"),
        "pvBatteryCriticalCoverage": result.get("pvBatteryCriticalCoverage"),
        "autonomousDays": result.get("autonomousDays"),
        "autonomousDaysWithGenerator": result.get("autonomousDaysWithGenerator"),
        "cyclesPerYear": result.get("cyclesPerYear"),
        "minimumSoc": result.get("minimumSoc"),
        "averageSoc": result.get("averageSoc"),
        "batteryChargeLimitedKwh": result.get("batteryChargeLimitedKwh"),
        "batteryDischargeLimitedKwh": result.get("batteryDischargeLimitedKwh"),
        "inverterPowerLimitedKwh": result.get("inverterPowerLimitedKwh"),
        "generatorRunHoursPerYear": result.get("generatorRunHoursPerYear"),
        "generatorFuelCostAnnual": result.get("generatorFuelCostAnnual"),
        "generatorStartSocPct": result.get("generatorStartSocPct"),
        "generatorStopSocPct": result.get("generatorStopSocPct"),
        "syntheticPeakModel": result.get("syntheticPeakModel"),
        "designCorrections": result.get("designCorrections"),
        "accuracyScore": result.get("accuracyScore"),
        "accuracyTier": result.get("accuracyTier"),
        "expectedUncertaintyPct": result.get("expectedUncertaintyPct"),
        "fieldGuaranteeReadiness": {
            "status": result.get("fieldGuaranteeReadiness", {}).get("status"),
            "phase1Ready": bool(result.get("fieldGuaranteeReadiness", {}).get("phase1Ready")),
        },
        "fieldModelMaturityGate": {
            "status": result.get("fieldModelMaturityGate", {}).get("status"),
            "phase3Ready": bool(result.get("fieldModelMaturityGate", {}).get("phase3Ready")),
        },
        "fieldGuaranteeCandidate": bool(result.get("fieldGuaranteeCandidate")),
        "fieldDataState": result.get("fieldDataState"),
        "dataLineage": {
            "version": result.get("dataLineage", {}).get("version"),
            "economics": result.get("dataLineage", {}).get("economics"),
            "gates": result.get("dataLineage", {}).get("gates"),
        },
        "badWeatherScenario": summarize_bad_weather(result.get("badWeatherScenario")),
        "fieldStressAnalysis": summarize_stress(result.get("fieldStressAnalysis")),
    }


def run_js_fixture(request: dict, production: dict) -> dict:
    payload = json.dumps({"request": request, "production": production})
    completed = subprocess.run(
        ["node", str(JS_FIXTURE)],
        input=payload,
        text=True,
        capture_output=True,
        check=True,
        cwd=ROOT,
    )
    return json.loads(completed.stdout)


def assert_close(actual: float | int | None, expected: float | int | None, tol: float, label: str) -> None:
    assert actual is not None, f"{label}: actual is None"
    assert expected is not None, f"{label}: expected is None"
    diff = abs(float(actual) - float(expected))
    assert diff <= tol, f"{label}: expected {expected} ± {tol}, got {actual} (diff={diff})"


def assert_stress_summary(py_summary: dict | None, js_summary: dict | None) -> None:
    assert py_summary is not None and js_summary is not None
    assert py_summary["worstCriticalScenarioKey"] == js_summary["worstCriticalScenarioKey"]
    assert py_summary["worstTotalScenarioKey"] == js_summary["worstTotalScenarioKey"]
    assert py_summary["maxUnmetCriticalScenarioKey"] == js_summary["maxUnmetCriticalScenarioKey"]
    if py_summary["generatorCriticalPeakReservePct"] is None or js_summary["generatorCriticalPeakReservePct"] is None:
        assert py_summary["generatorCriticalPeakReservePct"] == js_summary["generatorCriticalPeakReservePct"]
    else:
        assert_close(py_summary["generatorCriticalPeakReservePct"], js_summary["generatorCriticalPeakReservePct"], KW_TOL, "stress.generatorCriticalPeakReservePct")
    assert [row["key"] for row in py_summary["scenarios"]] == [row["key"] for row in js_summary["scenarios"]]
    for py_row, js_row in zip(py_summary["scenarios"], js_summary["scenarios"]):
        assert py_row["key"] == js_row["key"]
        assert_close(py_row["totalLoadCoverage"], js_row["totalLoadCoverage"], RATIO_TOL, f"{py_row['key']}.totalLoadCoverage")
        assert_close(py_row["criticalLoadCoverage"], js_row["criticalLoadCoverage"], RATIO_TOL, f"{py_row['key']}.criticalLoadCoverage")
        assert_close(py_row["unmetCriticalKwh"], js_row["unmetCriticalKwh"], KWH_TOL, f"{py_row['key']}.unmetCriticalKwh")
        assert_close(py_row["generatorKwh"], js_row["generatorKwh"], KWH_TOL, f"{py_row['key']}.generatorKwh")
        assert_close(py_row["inverterPowerLimitedKwh"], js_row["inverterPowerLimitedKwh"], KWH_TOL, f"{py_row['key']}.inverterPowerLimitedKwh")
        assert_close(py_row["batteryDischargeLimitedKwh"], js_row["batteryDischargeLimitedKwh"], KWH_TOL, f"{py_row['key']}.batteryDischargeLimitedKwh")
        assert_close(py_row["peakCriticalKw"], js_row["peakCriticalKw"], KW_TOL, f"{py_row['key']}.peakCriticalKw")


def assert_bad_weather(py_summary: dict | None, js_summary: dict | None) -> None:
    if py_summary is None or js_summary is None:
        assert py_summary == js_summary
        return
    assert py_summary["weatherLevel"] == js_summary["weatherLevel"]
    assert py_summary["consecutiveDays"] == js_summary["consecutiveDays"]
    assert_close(py_summary["pvScaleFactor"], js_summary["pvScaleFactor"], RATIO_TOL, "badWeather.pvScaleFactor")
    assert 1 <= int(py_summary["worstWindowDayOfYear"]) <= 365
    assert 1 <= int(js_summary["worstWindowDayOfYear"]) <= 365
    assert_close(py_summary["criticalCoverageDropPct"], js_summary["criticalCoverageDropPct"], PCT_TOL, "badWeather.criticalCoverageDropPct")
    assert_close(py_summary["totalCoverageDropPct"], js_summary["totalCoverageDropPct"], PCT_TOL, "badWeather.totalCoverageDropPct")
    assert_close(py_summary["additionalGeneratorKwh"], js_summary["additionalGeneratorKwh"], KWH_TOL, "badWeather.additionalGeneratorKwh")


@pytest.mark.parametrize(
    "case_name,case_factory",
    [
        ("real-hourly-user-pv", scenario_real_hourly_user_pv),
        ("backend-hourly-production", scenario_backend_hourly_production),
        ("device-monthly-synthetic", scenario_device_monthly_synthetic),
    ],
)
def test_offgrid_backend_js_parity(case_name, case_factory):
    request, production = case_factory()
    python_result = build_backend_offgrid_results(EngineRequest(**request), production)
    assert python_result is not None, f"{case_name}: backend offgrid result is None"

    py_summary = summarize_python_result(python_result)
    js_summary = run_js_fixture(request, production)

    assert py_summary["dispatchVersion"].startswith("OGD-")
    assert js_summary["dispatchVersion"].startswith("OGD-")
    assert py_summary["loadMode"] == js_summary["loadMode"]
    assert py_summary["loadSource"] == js_summary["loadSource"]
    assert py_summary["criticalLoadBasis"] == js_summary["criticalLoadBasis"]
    assert py_summary["calculationMode"] == js_summary["calculationMode"]
    assert py_summary["productionSource"] == js_summary["productionSource"]
    assert py_summary["productionDispatchProfile"] == js_summary["productionDispatchProfile"]
    assert py_summary["productionDispatchMetadata"]["hasRealHourlyProduction"] == js_summary["productionDispatchMetadata"]["hasRealHourlyProduction"]
    assert py_summary["productionDispatchMetadata"]["syntheticWeatherModel"] == js_summary["productionDispatchMetadata"]["syntheticWeatherModel"]

    synthetic_weather_py = py_summary["productionDispatchMetadata"]["syntheticWeatherMetadata"] or {}
    synthetic_weather_js = js_summary["productionDispatchMetadata"]["syntheticWeatherMetadata"] or {}
    if synthetic_weather_py or synthetic_weather_js:
        assert synthetic_weather_py.get("longestLowPvClusterDays") == synthetic_weather_js.get("longestLowPvClusterDays")
        assert synthetic_weather_py.get("uniqueRegimeCount") == synthetic_weather_js.get("uniqueRegimeCount")
        assert_close(synthetic_weather_py.get("minimumDailyFractionOfAverage"), synthetic_weather_js.get("minimumDailyFractionOfAverage"), RATIO_TOL, "syntheticWeather.minimumDailyFractionOfAverage")
        assert_close(synthetic_weather_py.get("maximumDailyFractionOfAverage"), synthetic_weather_js.get("maximumDailyFractionOfAverage"), RATIO_TOL, "syntheticWeather.maximumDailyFractionOfAverage")

    for key in [
        "annualTotalLoadKwh",
        "annualCriticalLoadKwh",
        "directPvKwh",
        "batteryKwh",
        "generatorKwh",
        "curtailedPvKwh",
        "unmetLoadKwh",
        "unmetCriticalKwh",
        "autonomousDays",
        "autonomousDaysWithGenerator",
        "cyclesPerYear",
        "minimumSoc",
        "averageSoc",
        "batteryChargeLimitedKwh",
        "batteryDischargeLimitedKwh",
        "inverterPowerLimitedKwh",
        "generatorRunHoursPerYear",
        "generatorFuelCostAnnual",
        "generatorStartSocPct",
        "generatorStopSocPct",
    ]:
        tol = KWH_TOL
        if key in {"cyclesPerYear", "minimumSoc", "averageSoc"}:
            tol = RATIO_TOL
        assert_close(py_summary[key], js_summary[key], tol, f"{case_name}.{key}")

    for key in [
        "totalLoadCoverage",
        "criticalLoadCoverage",
        "pvBatteryLoadCoverage",
        "pvBatteryCriticalCoverage",
    ]:
        assert_close(py_summary[key], js_summary[key], RATIO_TOL, f"{case_name}.{key}")

    py_peak = py_summary["syntheticPeakModel"] or {}
    js_peak = js_summary["syntheticPeakModel"] or {}
    assert py_peak.get("peakEnvelopeApplied") == js_peak.get("peakEnvelopeApplied")
    assert py_peak.get("severity") == js_peak.get("severity")
    if py_peak or js_peak:
        assert py_peak.get("peakEnvelopeHours") == js_peak.get("peakEnvelopeHours")
        assert_close(py_peak.get("peakEnvelopeMaxFactor"), js_peak.get("peakEnvelopeMaxFactor"), RATIO_TOL, f"{case_name}.peakEnvelopeMaxFactor")
        assert_close(py_peak.get("maxSyntheticPeakKw"), js_peak.get("maxSyntheticPeakKw"), KW_TOL, f"{case_name}.maxSyntheticPeakKw")
        assert_close(py_peak.get("maxCriticalPeakKw"), js_peak.get("maxCriticalPeakKw"), KW_TOL, f"{case_name}.maxCriticalPeakKw")

    py_correction = py_summary["designCorrections"] or {}
    js_correction = js_summary["designCorrections"] or {}
    assert bool(py_correction) == bool(js_correction)
    if py_correction or js_correction:
        assert py_correction.get("severity") == js_correction.get("severity")
        assert py_correction.get("reasons") == js_correction.get("reasons")
        for key in ["inverterAcKw", "inverterSurgeMultiplier", "inverterSurgeLimitKw", "batteryMaxDischargeKw"]:
            assert_close(py_correction.get("current", {}).get(key), js_correction.get("current", {}).get(key), KW_TOL, f"{case_name}.design.current.{key}")
            assert_close(py_correction.get("recommended", {}).get(key), js_correction.get("recommended", {}).get(key), KW_TOL, f"{case_name}.design.recommended.{key}")
        for key in ["modeledPeakKw", "modeledP95Kw", "modeledCriticalPeakKw", "modeledCriticalP95Kw", "observedPeakKw", "observedP95Kw", "calibrationFactor"]:
            assert_close(py_correction.get("triggers", {}).get(key), js_correction.get("triggers", {}).get(key), KW_TOL, f"{case_name}.design.triggers.{key}")
        for key in ["tripCount", "overloadCount", "inverterPowerLimitedKwh", "inverterPowerLimitHours", "batteryDischargeLimitedKwh", "unmetCriticalKwh"]:
            assert_close(py_correction.get("triggers", {}).get(key), js_correction.get("triggers", {}).get(key), KWH_TOL, f"{case_name}.design.triggers.{key}")

    assert py_summary["accuracyScore"] == js_summary["accuracyScore"]
    assert py_summary["accuracyTier"] == js_summary["accuracyTier"]
    assert py_summary["expectedUncertaintyPct"] == js_summary["expectedUncertaintyPct"]
    assert py_summary["fieldGuaranteeReadiness"] == js_summary["fieldGuaranteeReadiness"]
    assert py_summary["fieldModelMaturityGate"] == js_summary["fieldModelMaturityGate"]
    assert py_summary["fieldGuaranteeCandidate"] == js_summary["fieldGuaranteeCandidate"]
    assert py_summary["fieldDataState"] == js_summary["fieldDataState"]
    assert py_summary["dataLineage"]["version"] == js_summary["dataLineage"]["version"]
    assert py_summary["dataLineage"]["economics"] == js_summary["dataLineage"]["economics"]
    assert py_summary["dataLineage"]["gates"] == js_summary["dataLineage"]["gates"]

    assert_bad_weather(py_summary["badWeatherScenario"], js_summary["badWeatherScenario"])
    assert_stress_summary(py_summary["fieldStressAnalysis"], js_summary["fieldStressAnalysis"])
