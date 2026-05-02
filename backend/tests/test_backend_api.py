from fastapi.testclient import TestClient
import pytest

from backend.engines.pvlib_engine import PVLIB_AVAILABLE
from backend.engines.offgrid_engine import build_backend_offgrid_results
from backend.main import app
from backend.models.engine_contracts import EngineRequest


client = TestClient(app)


def sample_request():
    return {
        "schema": "GH-PV-ENGINE-CONTRACT-2026.04-v1",
        "requestedEngine": "python-backend",
        "scenario": {"key": "on-grid", "label": "On-Grid", "proposalTone": "commercial-grid"},
        "site": {"lat": 39.9334, "lon": 32.8597, "cityName": "Ankara", "ghi": 1620, "timezone": "Europe/Istanbul"},
        "roof": {"areaM2": 80, "tiltDeg": 33, "azimuthDeg": 180, "azimuthName": "Güney", "shadingPct": 10, "soilingPct": 3},
        "system": {
            "panelType": "mono",
            "panelWattPeak": 430,
            "panelAreaM2": 1.134 * 1.762,
            "panelTempCoeffPerC": -0.0034,
            "panelDegradationRate": 0.0045,
            "panelFirstYearDegradationRate": 0.02,
            "bifacialGain": 0,
            "inverterType": "string",
            "inverterEfficiency": 0.97,
            "cableLossPct": 0,
            "wiringMismatchPct": 0,
            "batteryEnabled": False,
            "netMeteringEnabled": True,
        },
        "load": {"dailyConsumptionKwh": 30, "monthlyConsumptionKwh": None, "hourlyConsumption8760": None},
        "tariff": {"tariffType": "commercial", "tariffRegime": "auto", "importRateTryKwh": 8.44, "exportRateTryKwh": 2.0, "annualPriceIncrease": 0.12, "discountRate": 0.18, "sourceCheckedAt": "2026-04-14"},
        "governance": {"quoteInputsVerified": True, "hasSignedCustomerBillData": True, "evidence": {}},
    }


def offgrid_sample_request():
    request = sample_request()
    request["scenario"] = {"key": "off-grid", "label": "Off-Grid", "proposalTone": "autonomy"}
    request["system"]["batteryEnabled"] = True
    request["system"]["battery"] = {
        "capacity": 14.4,
        "dod": 0.9,
        "efficiency": 0.94,
        "socReservePct": 15,
    }
    request["system"]["batteryMaxChargeKw"] = 5
    request["system"]["batteryMaxDischargeKw"] = 5
    request["system"]["offgridInverterAcKw"] = 6
    request["system"]["offgridInverterSurgeMultiplier"] = 1.5
    request["system"]["netMeteringEnabled"] = False
    request["load"]["dailyConsumptionKwh"] = 18
    request["load"]["hourlyConsumption8760"] = [0.75] * 8760
    request["load"]["offgridCriticalLoad8760"] = [0.30] * 8760
    request["load"]["hourlyProduction8760"] = [0.0] * 8760
    for day in range(365):
        base = day * 24
        for hour in range(8, 17):
            request["load"]["hourlyProduction8760"][base + hour] = 1.6
    request["offgrid"] = {
        "calculationMode": "advanced",
        "generatorEnabled": True,
        "generatorKw": 4.5,
        "generatorFuelCostPerKwh": 6.5,
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
        "generatorCapexTry": 120000,
        "badWeatherLevel": "moderate",
        "fieldGuaranteeMode": False,
    }
    request["tariff"]["offGridCostPerKwhTry"] = 19.5
    return request


def test_health_contract():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "pvlibAvailable" in data
    assert "pvlibBackedEngineAvailable" in data
    assert data["fallbackEngine"] == "python-deterministic-fallback"


def test_pv_calculation_contract():
    response = client.post("/api/pv/calculate", json=sample_request())
    assert response.status_code == 200
    data = response.json()
    assert data["schema"] == "GH-PV-ENGINE-CONTRACT-2026.04-v1"
    assert data["engineSource"]["engine"] == "python-backend"
    assert data["engineSource"]["pvlibReady"] is True
    assert data["production"]["engine_used"] in {"pvlib-backed", "python-deterministic-fallback"}
    assert data["production"]["engine_quality"] in {"engineering-mvp", "fallback-estimate"}
    assert data["production"]["annualEnergyKwh"] > 0
    assert len(data["production"]["monthlyEnergyKwh"]) == 12
    assert data["production"]["panelCount"] == 30
    assert data["production"]["systemPowerKwp"] == 12.9
    assert data["financial"]["annualSavingsTry"] > 0
    if not PVLIB_AVAILABLE:
        assert data["engineSource"]["pvlibBacked"] is False
        assert data["engineSource"]["fallbackUsed"] is True
        assert data["raw"]["fallbackUsed"] is True


def test_invalid_coordinates_are_rejected():
    request = sample_request()
    request["site"]["lat"] = 120
    response = client.post("/api/pv/calculate", json=request)
    assert response.status_code == 422


def test_missing_coordinates_are_explicit_fallback_not_pvlib():
    request = sample_request()
    request["site"]["lat"] = None
    request["site"]["lon"] = None
    response = client.post("/api/pv/calculate", json=request)
    assert response.status_code == 200
    data = response.json()
    assert data["engineSource"]["pvlibBacked"] is False
    assert data["engineSource"]["fallbackUsed"] is True
    assert "site coordinates missing" in data["losses"]["fallbackReason"]


def test_pvlib_missing_fallback_metadata_is_explicit():
    request = sample_request()
    request["requestedEngine"] = "pvlib-service"
    response = client.post("/api/pvlib/calculate", json=request)
    assert response.status_code == 200
    data = response.json()
    if not PVLIB_AVAILABLE:
        assert data["raw"]["engineUsed"] == "python-deterministic-fallback"
        assert data["raw"]["fallback_flags"]
        assert data["losses"]["fallbackReason"]


def test_pvlib_engine_contract_when_available():
    if not PVLIB_AVAILABLE:
        return
    response = client.post("/api/pv/calculate", json=sample_request())
    assert response.status_code == 200
    data = response.json()
    assert data["engineSource"]["source"] == "pvlib-backed"
    assert data["engineSource"]["pvlibBacked"] is True
    assert data["production"]["engine_used"] == "pvlib-backed"
    assert len(data["production"]["hourlyEnergyKwh"]) == 8760
    assert data["losses"]["transpositionModel"] == "pvlib.irradiance.haydavies"
    assert data["losses"]["temperatureModel"].startswith("pvlib.sapm_cell")
    assert data["production"]["confidence_level"] == "medium"
    assert data["raw"]["confidenceLevel"] == "medium"
    assert data["losses"]["ghiScaleFactor"] <= 1.0
    assert data["losses"]["temperatureProfileModel"] == "city-adjusted-seasonal-sine"
    assert data["losses"]["temperatureProfileCity"] == "Ankara"


def test_financial_proposal_contract():
    payload = sample_request()
    response = client.post("/api/financial/proposal", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["proposal"]["scenarioKey"] == "on-grid"
    assert data["proposal"]["quoteReadiness"] == "backend-engineering-estimate"
    assert data["financial"]["simplePaybackYears"] is not None
    assert data["financial"]["capexModel"] == "frontend-default-cost-basis"
    assert data["financial"]["estimateOnly"] is True
    assert data["financial"]["warning"] == "estimate_only_not_for_commercial_quotes"
    assert data["proposal"]["warning"] == "estimate_only_not_for_commercial_quotes"
    # FIX-6 (backend KDV parity): recompute expected capex from the same constants
    # the engine uses, so this assertion stays correct when panel/inverter prices
    # or KDV rates evolve. Sanity-floor below catches outright regressions.
    from backend.services.financial_service import _frontend_default_capex
    request_obj = EngineRequest.model_validate(payload)
    system_power_kwp = float(data["production"]["systemPowerKwp"])
    expected_capex = round(_frontend_default_capex(request_obj, system_power_kwp))
    assert data["financial"]["roughCapexTry"] == expected_capex
    assert data["financial"]["roughCapexTry"] > 100_000  # sanity floor for ~13 kWp mono


def test_backend_offgrid_financial_uses_alternative_cost_and_blocks_export_revenue():
    request = offgrid_sample_request()
    request["tariff"]["importRateTryKwh"] = 7.16
    request["tariff"]["exportRateTryKwh"] = 3.0

    response = client.post("/api/financial/proposal", json=request)
    assert response.status_code == 200
    data = response.json()
    assert data["financial"]["financialBasis"] == "off-grid-user-alternative-energy-cost"
    assert data["financial"]["financialSavingsRateTryKwh"] == 19.5
    assert data["financial"]["gridExportKwh"] == 0
    assert data["financial"]["paidGridExportKwh"] == 0
    assert data["financial"]["curtailedSurplusEstimateKwh"] >= 0
    assert abs(data["financial"]["annualSavingsTry"] - round(data["financial"]["selfConsumedEnergyKwh"] * 19.5)) <= 20
    assert data["financial"]["dispatchAvailable"] is True
    assert data["financial"]["authoritativeForOffgrid"] is True
    assert data["financial"]["offgridDispatchAuthority"] == "backend-offgrid-l2-dispatch"
    assert data["financial"]["selfConsumptionModel"] == "dispatch-hourly-offgrid-l2"
    assert "backend l2 dispatch" in data["proposal"]["warningDetail"].lower()
    assert data["offgridL2Results"]["generatorEnabled"] is True
    assert data["offgridL2Results"]["criticalLoadCoverage"] >= data["offgridL2Results"]["totalLoadCoverage"]


def test_backend_offgrid_calculate_returns_dispatch_results():
    response = client.post("/api/pv/calculate", json=offgrid_sample_request())
    assert response.status_code == 200
    data = response.json()
    assert data["offgridL2Results"] is not None
    assert data["raw"]["offgridDispatchAvailable"] is True
    assert data["offgridL2Results"]["dispatchVersion"] == "OGD-PY-2026.04-v1"
    assert data["offgridL2Results"]["loadMode"] == "hourly-8760"
    assert data["offgridL2Results"]["productionDispatchMetadata"]["hasRealHourlyProduction"] is True
    assert data["offgridL2Results"]["calculationMode"] == "advanced"
    assert data["offgridL2Results"]["accuracyScore"] >= 0
    assert data["offgridL2Results"]["accuracyAssessment"]["calculationMode"] == "advanced"
    assert data["offgridL2Results"]["dataLineage"]["economics"]["authoritativeFinancialBasis"] == "backend-offgrid-l2-dispatch"
    assert len(data["offgridL2Results"]["hourly8760"]) == 8760
    assert data["offgridL2Results"]["criticalLoadCoverage"] >= 0
    assert data["offgridL2Results"]["fieldGuaranteeReadiness"]["status"] in {"blocked", "phase-1-input-ready"}


def test_backend_offgrid_zero_hourly_profiles_are_not_phase1_ready():
    request = offgrid_sample_request()
    zeros = [0.0] * 8760
    request["load"]["hourlyConsumption8760"] = zeros
    request["load"]["offgridCriticalLoad8760"] = zeros
    request["load"]["hourlyProduction8760"] = zeros
    production = {
        "hourlyEnergyKwh": zeros,
        "monthlyEnergyKwh": [0.0] * 12,
        "systemPowerKwp": 0.0,
    }
    result = build_backend_offgrid_results(EngineRequest(**request), production)

    assert result is not None
    assert result["productionDispatchMetadata"]["hasRealHourlyProduction"] is False
    assert result["hasRealHourlyLoad"] is False
    assert result["fieldGuaranteeReadiness"]["phase1Ready"] is False


def test_backend_offgrid_returns_field_design_corrections():
    request = offgrid_sample_request()
    request["load"]["hourlyConsumption8760"] = None
    request["load"]["offgridCriticalLoad8760"] = None
    request["load"]["offgridDevices"] = [
        {"name": "Pump", "category": "pump", "powerW": 1200, "hoursPerDay": 2.5, "isCritical": True, "usageType": "scheduled"},
        {"name": "Kettle", "category": "kitchen", "powerW": 2200, "hoursPerDay": 0.4, "isCritical": False, "usageType": "manual"},
        {"name": "Washer", "category": "laundry", "powerW": 1800, "hoursPerDay": 1.0, "isCritical": False, "usageType": "cyclic"},
    ]
    request["governance"]["fieldImports"] = {
        "highResolutionLoad": {
            "sampleCount": 1440,
            "observedPeakKw": 7.8,
            "p95Kw": 4.6,
            "intervalMinutes": 1,
            "durationDays": 1.0,
        },
        "inverterEventLog": {
            "eventCount": 3,
            "tripCount": 1,
            "overloadCount": 2,
        },
    }

    response = client.post("/api/pv/calculate", json=request)
    assert response.status_code == 200
    design = response.json()["offgridL2Results"]["designCorrections"]
    assert design is not None
    assert design["severity"] == "high"
    assert "inverter-trip-events" in design["reasons"]
    assert design["recommended"]["inverterAcKw"] > design["current"]["inverterAcKw"]
    assert design["recommended"]["batteryMaxDischargeKw"] >= design["current"]["batteryMaxDischargeKw"]


def test_offgrid_field_import_endpoint_parses_csv_payload():
    content = "\n".join([
        "timestamp,power_kw",
        "2026-01-01 00:00,0.8",
        "2026-01-01 00:01,1.2",
        "2026-01-01 00:02,4.7",
        "2026-01-01 00:03,1.1",
    ])
    response = client.post(
        "/api/offgrid/field-import?kind=load",
        files={"file": ("field-load.csv", content, "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["summary"]["intervalMinutes"] == 1
    assert data["summary"]["observedPeakKw"] == 4.7


def test_offgrid_field_import_endpoint_parses_inverter_log_csv():
    content = "\n".join([
        "timestamp,severity,code,message",
        "2026-01-01 12:00,alarm,OVR-1,Overload trip detected",
        "2026-01-01 12:05,error,FLT-9,Generic inverter fault",
    ])
    response = client.post(
        "/api/offgrid/field-import?kind=inverter-log",
        files={"file": ("inv-log.csv", content, "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["eventCount"] == 2
    assert data["summary"]["tripCount"] == 1
    assert data["summary"]["overloadCount"] == 1


@pytest.mark.parametrize(
    "scenario_key,proposal_tone,tariff_type",
    [
        ("on-grid", "commercial-grid", "commercial"),
        ("off-grid", "autonomy", "residential"),
        ("agricultural-irrigation", "seasonal-pump", "agriculture"),
        ("heat-pump", "electrification", "residential"),
        ("ev-charging", "charging", "commercial"),
    ],
)
def test_representative_scenarios_preserve_frontend_system_sizing_contract(scenario_key, proposal_tone, tariff_type):
    request = sample_request()
    request["scenario"] = {"key": scenario_key, "label": scenario_key, "proposalTone": proposal_tone}
    request["tariff"]["tariffType"] = tariff_type
    request["system"]["netMeteringEnabled"] = scenario_key == "on-grid"
    response = client.post("/api/pv/calculate", json=request)
    assert response.status_code == 200
    data = response.json()
    assert data["production"]["panelCount"] == 30
    assert data["production"]["systemPowerKwp"] == 12.9
    assert data["engineSource"]["notes"]
    if data["engineSource"]["pvlibBacked"]:
        assert data["losses"]["contractPanelWattPeak"] == 430
        assert round(data["losses"]["contractPanelAreaM2"], 4) == round(1.134 * 1.762, 4)


def test_backend_uses_frontend_layout_snapshot_for_authoritative_sizing():
    request = sample_request()
    request["system"]["layoutSnapshot"] = {
        "authoritativeSizing": True,
        "panelCount": 6,
        "chosenSystemPowerKwp": 2.58,
        "usableRoofRatio": 0.75,
        "designTargetMode": "bill-offset",
        "designTargetApplied": "bill-offset",
        "limitedBy": "bill-target",
        "sections": [{"areaM2": 80, "panelCount": 6, "systemPowerKwp": 2.58}],
        "shadow": {"userShadingPct": 10, "osmShadowEnabled": False, "osmShadowFactorPct": 0},
    }

    response = client.post("/api/pv/calculate", json=request)
    assert response.status_code == 200
    data = response.json()
    assert data["production"]["panelCount"] == 6
    assert data["production"]["systemPowerKwp"] == 2.58
    assert data["losses"]["layoutSnapshotUsed"] is True


def test_backend_simple_engine_uses_layout_section_geometry():
    from backend.engines.simple_engine import calculate_production
    from backend.models.engine_contracts import EngineRequest

    sectioned = sample_request()
    sectioned["roof"]["shadingPct"] = 0
    sectioned["system"]["layoutSnapshot"] = {
        "authoritativeSizing": True,
        "panelCount": 20,
        "chosenSystemPowerKwp": 8.6,
        "sections": [
            {"areaM2": 40, "panelCount": 10, "systemPowerKwp": 4.3, "tiltDeg": 33, "azimuthDeg": 180, "shadingPct": 0},
            {"areaM2": 40, "panelCount": 10, "systemPowerKwp": 4.3, "tiltDeg": 33, "azimuthDeg": 0, "shadingPct": 50},
        ],
    }
    single_geometry = sample_request()
    single_geometry["roof"]["shadingPct"] = 0
    single_geometry["system"]["layoutSnapshot"] = {
        "authoritativeSizing": True,
        "panelCount": 20,
        "chosenSystemPowerKwp": 8.6,
        "sections": [],
    }

    sectioned_result = calculate_production(EngineRequest(**sectioned))
    single_result = calculate_production(EngineRequest(**single_geometry))

    assert sectioned_result["losses"]["layoutSectionGeometryUsed"] is True
    assert sectioned_result["production"]["annualEnergyKwh"] < single_result["production"]["annualEnergyKwh"]


def test_fix3_self_consumption_target_caps_self_consumed_energy():
    """FIX-3: Backend self-consumption must be <= annual_energy * scenario_target.
    Before the fix, self_consumed = min(annual_energy, annual_load) which could
    be unrealistically high (implies 100% instantaneous match between generation
    and load)."""
    request = sample_request()
    # on-grid target = 0.58 — with a large roof and small load the old code
    # would claim 100% self-consumption but new code caps at 58%
    request["load"]["dailyConsumptionKwh"] = 5  # small load vs large system
    response = client.post("/api/financial/proposal", json=request)
    assert response.status_code == 200
    data = response.json()
    annual_energy = data["financial"]["selfConsumedEnergyKwh"] + data["financial"]["gridExportKwh"]
    self_consumed = data["financial"]["selfConsumedEnergyKwh"]
    annual_load = data["financial"]["annualLoadKwh"]
    # self_consumed must be <= energy * 0.58 (on-grid target) and <= load
    assert self_consumed <= annual_energy * 0.60, (
        f"FIX-3: self_consumed {self_consumed} > energy {annual_energy} * 0.58 "
        f"(pre-fix behaviour — 100% self-consumption was being claimed)"
    )
    assert self_consumed <= annual_load, "FIX-3: self_consumed cannot exceed annual load"


def test_fix3_om_cost_escalates_year_over_year():
    """FIX-3: O&M costs must escalate over the 25-year horizon; before the fix
    they were flat (annual_om_cost applied identically to every year)."""
    from backend.services.financial_service import build_financial_payload
    from backend.models.engine_contracts import EngineRequest

    request_data = sample_request()
    request_data["load"]["dailyConsumptionKwh"] = 30
    req = EngineRequest(**request_data)
    production = {"annualEnergyKwh": 14000, "systemPowerKwp": 12.9}
    payload = build_financial_payload(req, production)
    # NPV should be finite and realistic
    assert payload["financial"]["npv25Try"] is not None
    # Simple payback should be positive
    assert payload["financial"]["simplePaybackYears"] > 0


def test_backend_on_grid_financial_uses_distribution_fee_once():
    from backend.services.financial_service import build_financial_payload
    from backend.models.engine_contracts import EngineRequest

    request_data = sample_request()
    request_data["tariff"]["importRateTryKwh"] = 5
    request_data["tariff"]["exportRateTryKwh"] = 0
    request_data["tariff"]["tariffInputMode"] = "net-plus-fee"
    request_data["tariff"]["distributionFeeTryKwh"] = 1
    req = EngineRequest(**request_data)
    payload = build_financial_payload(req, {"annualEnergyKwh": 10000, "systemPowerKwp": 8.6})

    assert payload["financial"]["financialSavingsRateTryKwh"] == 6
    assert payload["financial"]["annualSavingsTry"] == 34800
    assert payload["financial"]["financialBasis"] == "grid-import-tariff-plus-distribution-fee"


def test_fix6_kdv_split_panel_zero_nonpanel_twenty():
    """FIX-6: Solar panels carry 0% KDV (Law 7456/2023), other components 20%."""
    from backend.services.financial_service import _frontend_default_capex
    from backend.models.engine_contracts import EngineRequest

    request_data = sample_request()
    req = EngineRequest(**request_data)
    capex = _frontend_default_capex(req, 12.9)

    panel_cost = 12.9 * 1000 * 18.5  # mono
    non_panel = 12.9 * 6500 + 12.9 * 2200 + 12.9 * 600 + 12.9 * 900 + 12.9 * 1800 + 5000
    expected = panel_cost * 1.00 + non_panel * 1.20
    assert abs(capex - expected) < 1, (
        f"FIX-6: capex {capex:.0f} != expected {expected:.0f} "
        f"(panel 0% KDV + non-panel 20% KDV)"
    )
    # Must be less than old 20%-flat capex
    old_capex_flat = (panel_cost + non_panel) * 1.20
    assert capex < old_capex_flat, "FIX-6: New capex (panel 0%) must be lower than flat-20% capex"


def test_contract_cable_loss_is_not_hidden_backend_default():
    base = sample_request()
    with_loss = sample_request()
    with_loss["system"]["cableLossPct"] = 3
    with_loss["system"]["wiringMismatchPct"] = 3
    base_response = client.post("/api/pv/calculate", json=base).json()
    loss_response = client.post("/api/pv/calculate", json=with_loss).json()
    assert loss_response["production"]["annualEnergyKwh"] < base_response["production"]["annualEnergyKwh"]
    assert loss_response["losses"].get("wiringLossPct") == 3


# ── PVGIS Proxy endpoint tests ────────────────────────────────────────────────

from unittest.mock import AsyncMock, MagicMock, patch


VALID_PVGIS_UPSTREAM = {
    "outputs": {
        "totals": {
            "fixed": {"E_y": 1250.0, "H(i)_y": 1680.0}
        },
        "monthly": {
            "fixed": [{"E_m": 100 + i} for i in range(12)]
        },
    }
}

VALID_PVGIS_SERIES_UPSTREAM = {
    "outputs": {
        "hourly": [
            {
                "time": f"202501{day:02d}:{hour:02d}10",
                "P": 1000 if 8 <= hour <= 16 else 0,
            }
            for day in range(1, 32)
            for hour in range(24)
        ] * 12
    }
}


def _mock_httpx_client(status_code=200, body=None, exc=None):
    """Returns a mock async context manager standing in for httpx.AsyncClient(...)."""
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = body if body is not None else {}

    inner = AsyncMock()
    if exc is not None:
        inner.get = AsyncMock(side_effect=exc)
    else:
        inner.get = AsyncMock(return_value=mock_resp)

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=inner)
    cm.__aexit__ = AsyncMock(return_value=None)
    return cm


def _mock_httpx_client_sequence(bodies):
    responses = []
    for body in bodies:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = body
        responses.append(mock_resp)

    inner = AsyncMock()
    inner.get = AsyncMock(side_effect=responses)

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=inner)
    cm.__aexit__ = AsyncMock(return_value=None)
    return cm


def test_pvgis_proxy_invalid_lat_rejected():
    """FastAPI Query validation rejects lat outside -90..90."""
    resp = client.get("/api/pvgis-proxy?lat=200&lon=32&peakpower=5")
    assert resp.status_code == 422


def test_pvgis_proxy_peakpower_zero_rejected():
    """peakpower=0 is rejected by the gt=0 constraint on the Query param."""
    resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=0")
    assert resp.status_code == 422


def test_pvgis_proxy_missing_required_params():
    """Omitting lat/lon/peakpower entirely returns 422."""
    resp = client.get("/api/pvgis-proxy?lat=39")
    assert resp.status_code == 422


def test_pvgis_proxy_success():
    """Successful PVGIS upstream → ok=True, proxy-success, energy/poa/monthly populated."""
    cm = _mock_httpx_client(status_code=200, body=VALID_PVGIS_UPSTREAM)
    with patch("httpx.AsyncClient", return_value=cm):
        resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=5&loss=14&angle=30&aspect=0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["fetchStatus"] == "proxy-success"
    assert data["rawEnergy"] == 1250.0
    assert data["rawPoa"] == 1680.0
    assert isinstance(data["rawMonthly"], list) and len(data["rawMonthly"]) == 12
    assert data["rawHourly"] is None
    assert data["error_type"] is None


def test_pvgis_proxy_include_hourly_success():
    """includeHourly=True fetches seriescalc server-side and returns a typical 8760 profile."""
    cm = _mock_httpx_client_sequence([VALID_PVGIS_UPSTREAM, VALID_PVGIS_SERIES_UPSTREAM])
    with patch("httpx.AsyncClient", return_value=cm):
        resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=5&loss=14&angle=30&aspect=0&includeHourly=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["fetchStatus"] == "proxy-success"
    assert isinstance(data["rawHourly"], list)
    assert len(data["rawHourly"]) == 8760
    assert any(value > 0 for value in data["rawHourly"])


def test_pvgis_proxy_timeout():
    """PVGIS upstream timeout → ok=False, error_type=timeout, rawEnergy=None."""
    import httpx as httpx_lib
    cm = _mock_httpx_client(exc=httpx_lib.TimeoutException("upstream timed out"))
    with patch("httpx.AsyncClient", return_value=cm):
        resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["error_type"] == "timeout"
    assert data["rawEnergy"] is None
    assert data["rawMonthly"] is None


def test_pvgis_proxy_http_error():
    """PVGIS upstream HTTP 503 → ok=False, error_type=http-error."""
    cm = _mock_httpx_client(status_code=503, body={})
    with patch("httpx.AsyncClient", return_value=cm):
        resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["error_type"] == "http-error"
    assert data["rawEnergy"] is None


def test_pvgis_proxy_empty_ey_response():
    """PVGIS returning E_y=0 → ok=False, error_type=empty-response."""
    empty = {"outputs": {"totals": {"fixed": {"E_y": 0}}, "monthly": {"fixed": []}}}
    cm = _mock_httpx_client(status_code=200, body=empty)
    with patch("httpx.AsyncClient", return_value=cm):
        resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["error_type"] == "empty-response"


def test_pvgis_proxy_network_error():
    """Network-level exception → ok=False, error_type not http-error."""
    import httpx as httpx_lib
    cm = _mock_httpx_client(exc=httpx_lib.ConnectError("connection refused"))
    with patch("httpx.AsyncClient", return_value=cm):
        resp = client.get("/api/pvgis-proxy?lat=39&lon=32&peakpower=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["rawEnergy"] is None
    assert data["error_type"] in {"network", "unknown"}


# ── Bug-fix tests ─────────────────────────────────────────────────────────────

def test_pvlib_gamma_pdc_varies_by_panel_type():
    """Bug 3 fix: gamma_pdc must differ per panel type (mono_perc/-0.0034, n_type_topcon/-0.0029, bifacial_topcon/-0.0028)."""
    from backend.engines.pvlib_engine import PANEL_GAMMA_PDC
    assert PANEL_GAMMA_PDC["mono_perc"] == -0.0034
    assert PANEL_GAMMA_PDC["n_type_topcon"] == -0.0029
    assert PANEL_GAMMA_PDC["bifacial_topcon"] == -0.0028
    # All values are physically valid (between -1% and 0%)
    for panel_type, coeff in PANEL_GAMMA_PDC.items():
        assert -0.01 <= coeff <= 0, f"{panel_type}: gamma_pdc {coeff} out of physical range"


@pytest.mark.skipif(not PVLIB_AVAILABLE, reason="pvlib not installed")
def test_pvlib_gamma_pdc_reported_in_loss_flags():
    """Bug 3 fix: loss_flags must report gammaPdc and gammaPdcSource when pvlib is used."""
    response = client.post("/api/pv/calculate", json=sample_request())
    assert response.status_code == 200
    data = response.json()
    if data["engineSource"]["pvlibBacked"]:
        assert "gammaPdc" in data["losses"], "gammaPdc must be reported in loss_flags"
        assert data["losses"]["gammaPdc"] == -0.0034, "mono panel should use -0.0034"
        assert data["losses"]["gammaPdcSource"] in {"contract", "panel-type-map"}


@pytest.mark.skipif(not PVLIB_AVAILABLE, reason="pvlib not installed")
def test_pvlib_gamma_pdc_contract_override():
    """Bug 3 fix: panelTempCoeffPerC in contract overrides the panel-type default."""
    request = sample_request()
    request["system"]["panelTempCoeffPerC"] = -0.0036  # custom coefficient
    response = client.post("/api/pv/calculate", json=request)
    assert response.status_code == 200
    data = response.json()
    if data["engineSource"]["pvlibBacked"]:
        assert data["losses"]["gammaPdc"] == -0.0036
        assert data["losses"]["gammaPdcSource"] == "contract"


def test_psh_fallback_covers_all_81_provinces():
    """Bug 4 fix: _annual_ghi_to_psh fallback must cover all 81 Turkish provinces, not just 5."""
    from backend.engines.simple_engine import _annual_ghi_to_psh
    all_provinces = [
        "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara",
        "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman",
        "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa",
        "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce",
        "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep",
        "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta",
        "İstanbul", "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars",
        "Kastamonu", "Kayseri", "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli",
        "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla",
        "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya",
        "Samsun", "Siirt", "Sinop", "Şırnak", "Sivas", "Şanlıurfa", "Tekirdağ",
        "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yozgat", "Zonguldak",
    ]
    default_psh = _annual_ghi_to_psh(None, "UnknownCity")
    assert default_psh == 4.50, "default PSH for unknown city must remain 4.50"
    missing = [p for p in all_provinces if _annual_ghi_to_psh(None, p) == default_psh]
    assert not missing, (
        f"Bug 4: {len(missing)} province(s) still using default PSH 4.50 (not in fallback dict): {missing}"
    )


def test_psh_fallback_coastal_vs_inner_provinces():
    """Bug 4 fix: PSH values for coastal high-irradiance vs. Black Sea provinces are calibrated correctly."""
    from backend.engines.simple_engine import _annual_ghi_to_psh
    antalya = _annual_ghi_to_psh(None, "Antalya")
    rize = _annual_ghi_to_psh(None, "Rize")
    sanliurfa = _annual_ghi_to_psh(None, "Şanlıurfa")
    ankara = _annual_ghi_to_psh(None, "Ankara")
    assert antalya > ankara, "Antalya (Mediterranean) must have higher PSH than Ankara"
    assert rize < ankara, "Rize (Black Sea) must have lower PSH than Ankara"
    assert sanliurfa > antalya, "Şanlıurfa (SE Anatolia) must have the highest PSH"


def test_simple_engine_tilt_factor_matches_frontend_curve():
    """Fallback tilt factor must match the shared frontend breakpoint curve."""
    from backend.engines.simple_engine import _tilt_factor

    expected = {
        0: 0.78,
        15: 0.94,
        30: 1.00,
        45: 0.97,
        60: 0.87,
        90: 0.62,
    }
    for tilt_deg, coeff in expected.items():
        assert abs(_tilt_factor(tilt_deg) - coeff) < 1e-9


def panel_thermal_sample_request():
    # Reference Longi Hi-MO 6 -ish numbers, simplified.
    return {
        "vocStcV": 49.5,
        "vocCoeffPctPerC": -0.27,
        "vmpStcV": 41.8,
        "vmpCoeffPctPerC": -0.30,
        "pmaxStcW": 550,
        "pmaxCoeffPctPerC": -0.34,
        "inverterMaxInputV": 1000,
        "inverterMpptOptimalV": 600,
    }


def test_panel_thermal_check_returns_three_default_scenarios():
    response = client.post("/api/panel/thermal-check", json=panel_thermal_sample_request())
    assert response.status_code == 200
    data = response.json()
    temps = sorted(s["ambientTempC"] for s in data["scenarios"])
    assert temps == [-10.0, 25.0, 60.0]
    coldest = data["coldestScenario"]
    hottest = data["hottestScenario"]
    assert coldest["ambientTempC"] == -10.0
    assert hottest["ambientTempC"] == 60.0


def test_panel_thermal_check_voc_at_minus_ten_matches_formula():
    """Voc(-10) = 49.5 * (1 + (-0.27/100) * (-10 - 25)) = 49.5 * 1.0945 ≈ 54.18 V"""
    response = client.post("/api/panel/thermal-check", json=panel_thermal_sample_request())
    data = response.json()
    coldest = data["coldestScenario"]
    expected = 49.5 * (1 + (-0.27 / 100.0) * (-10.0 - 25.0))
    assert abs(coldest["vocV"] - round(expected, 3)) < 1e-3


def test_panel_thermal_check_uses_floor_for_safe_string_count():
    """1000 V / 54.18 V ≈ 18.45 → must floor to 18 (never round up)."""
    response = client.post("/api/panel/thermal-check", json=panel_thermal_sample_request())
    data = response.json()
    sizing = data["stringSizing"]
    assert sizing["safeMaxSeriesPanels"] == 18
    assert sizing["rawMaxSeriesPanels"] > sizing["safeMaxSeriesPanels"]
    assert sizing["limitingScenario"]["ambientTempC"] == -10.0


def test_panel_thermal_check_realistic_power_uses_hottest_pmax():
    """Realistic peak power = floor(strings) * Pmax(+60°C). Must NOT use the raw float."""
    response = client.post("/api/panel/thermal-check", json=panel_thermal_sample_request())
    data = response.json()
    safe_count = data["stringSizing"]["safeMaxSeriesPanels"]
    hottest_pmax = data["hottestScenario"]["pmaxW"]
    expected_total_w = safe_count * hottest_pmax
    assert abs(data["realisticPeakPower"]["totalWatt"] - round(expected_total_w, 2)) < 1e-2
    assert data["realisticPeakPower"]["panelCount"] == safe_count
    # Hot Pmax must be lower than STC (negative coefficient applied to ΔT=+35).
    assert hottest_pmax < 550


def test_panel_thermal_check_falls_back_to_voc_coeff_when_vmp_omitted():
    payload = panel_thermal_sample_request()
    payload.pop("vmpCoeffPctPerC")
    response = client.post("/api/panel/thermal-check", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["inputs"]["vmpCoeffSource"] == "fallback-voc-coeff"
    assert data["inputs"]["vmpCoeffPctPerC"] == payload["vocCoeffPctPerC"]


def test_panel_thermal_check_rejects_non_positive_voltage():
    payload = panel_thermal_sample_request()
    payload["vocStcV"] = 0
    response = client.post("/api/panel/thermal-check", json=payload)
    assert response.status_code == 422


def test_panel_thermal_check_rejects_mppt_above_inverter_max():
    payload = panel_thermal_sample_request()
    payload["inverterMpptOptimalV"] = 1200  # > inverterMaxInputV=1000
    response = client.post("/api/panel/thermal-check", json=payload)
    assert response.status_code == 422


def test_panel_thermal_check_custom_temperatures_still_force_safety_pair():
    payload = panel_thermal_sample_request()
    payload["temperaturesC"] = [0, 40]  # caller forgot -10/+60
    response = client.post("/api/panel/thermal-check", json=payload)
    assert response.status_code == 200
    data = response.json()
    temps = sorted(s["ambientTempC"] for s in data["scenarios"])
    # Module must still inject -10 and +60 so safety/realism stay anchored.
    assert -10.0 in temps and 60.0 in temps and 0.0 in temps and 40.0 in temps
