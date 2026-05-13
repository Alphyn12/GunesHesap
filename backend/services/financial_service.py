from __future__ import annotations

import logging

from backend.engines.production_router import calculate_backend_production

logger = logging.getLogger(__name__)
from backend.engines.offgrid_engine import build_backend_offgrid_results
from backend.engines.simple_engine import annual_load_kwh
from backend.models.engine_contracts import EngineRequest, EngineResponse
from backend.services.assumptions import load_cost_assumptions, load_financial_assumptions


def _npv(cashflows: list[float], discount_rate: float) -> float:
    return sum(cf / ((1 + discount_rate) ** idx) for idx, cf in enumerate(cashflows))


def _irr(cashflows: list[float], guess_lo: float = -0.95, guess_hi: float = 10.0,
         tol: float = 1e-7, max_iter: int = 200) -> float | None:
    """Internal Rate of Return via bisection on NPV(rate)=0.

    Faz-2 D5: replaces the previous "ROI = total return %" misnomer. The browser
    financial model and the backend now both surface IRR explicitly so quotes
    can present an apples-to-apples annualised return instead of a 25-year
    cumulative profit ratio. Returns None when no sign change exists in the
    bracketed interval (e.g. project never recovers capex).
    """
    if not cashflows or cashflows[0] >= 0:
        return None
    f_lo = _npv(cashflows, guess_lo)
    f_hi = _npv(cashflows, guess_hi)
    if f_lo == 0:
        return guess_lo
    if f_hi == 0:
        return guess_hi
    if f_lo * f_hi > 0:
        return None
    for _ in range(max_iter):
        mid = (guess_lo + guess_hi) / 2
        f_mid = _npv(cashflows, mid)
        if abs(f_mid) < tol or (guess_hi - guess_lo) < tol:
            return mid
        if f_lo * f_mid < 0:
            guess_hi = mid
            f_hi = f_mid
        else:
            guess_lo = mid
            f_lo = f_mid
    return (guess_lo + guess_hi) / 2


def _curve_rate(curve: list[dict], year: int) -> float:
    for seg in curve or []:
        if int(seg.get("fromYear", 1)) <= year <= int(seg.get("toYear", 25)):
            return max(-0.5, min(2.0, float(seg.get("rate", 0) or 0)))
    return 0.0


def _tariff_factor(curve: list[dict], year: int) -> float:
    factor = 1.0
    for y in range(1, year):
        factor *= 1 + _curve_rate(curve, y)
    return factor


def _financial_defaults(request: EngineRequest) -> dict:
    assumptions = load_financial_assumptions()
    profile_key = getattr(request.tariff, "financialProfile", None) or getattr(request.assumptions, "financialProfile", "base")
    profile = assumptions.get("financialProfiles", {}).get(profile_key) or assumptions.get("financialProfiles", {}).get("base", {})
    curve = list(getattr(request.tariff, "tariffIncreaseCurve", None) or profile.get("tariffIncreaseCurve") or [])
    discount = float(getattr(request.tariff, "discountRate", 0) or profile.get("discountRate", 0) or 0)
    return {
        "version": assumptions.get("version"),
        "profile": profile_key if profile else "base",
        "modelLabel": assumptions.get("modelLabel", "Nominal TL model"),
        "tariffIncreaseCurve": curve,
        "discountRate": max(0.0, discount),
    }


def build_financial_payload(request: EngineRequest, production: dict, offgrid_results: dict | None = None) -> dict:
    annual_energy = float(production.get("annualEnergyKwh") or 0)
    annual_load = annual_load_kwh(request)
    import_rate = max(0, request.tariff.importRateTryKwh or 0)
    distribution_fee = (
        0
        if getattr(request.tariff, "tariffInputMode", "net-plus-fee") == "gross"
        else max(0, float(getattr(request.tariff, "distributionFeeTryKwh", 0) or 0))
    )
    effective_import_rate = import_rate + distribution_fee
    export_rate = max(0, request.tariff.exportRateTryKwh or 0)

    scenario_key = request.scenario.key
    is_off_grid = scenario_key == "off-grid"
    net_metering = False if scenario_key == "off-grid" else bool(request.system.netMeteringEnabled)
    off_grid_cost = max(0, float(getattr(request.tariff, "offGridCostPerKwhTry", 0) or 0))
    financial_import_rate = (
        off_grid_cost
        if scenario_key == "off-grid" and off_grid_cost > 0
        else effective_import_rate * 2.5
        if scenario_key == "off-grid"
        else effective_import_rate
    )
    financial_basis = (
        "off-grid-user-alternative-energy-cost"
        if scenario_key == "off-grid" and off_grid_cost > 0
        else "off-grid-grid-tariff-times-2_5-proxy"
        if scenario_key == "off-grid"
        else "grid-import-tariff-plus-distribution-fee" if distribution_fee > 0 else "grid-import-tariff"
    )
    self_consumption_target = {
        "off-grid": 0.90,
        "flexible-mobile": 0.88,
        "agricultural-irrigation": 0.72,
        "ev-charging": 0.68,
        "heat-pump": 0.62,
    }.get(scenario_key, 0.58)
    # FIX-3: Apply scenario-appropriate self-consumption target.
    # The old code always used min(annual_energy, annual_load) — 100% of what the
    # panel produces up to load — which is physically impossible without hourly
    # simulation (load doesn't perfectly follow generation).
    # We now cap self-consumed energy by the scenario-specific target fraction.
    # This is still an approximation (JS side has a real 8760-hour simulation),
    # but it avoids systematic over-estimation in the backend proposal estimate.
    self_consumed = min(annual_energy * self_consumption_target, annual_load)
    if is_off_grid and offgrid_results:
        # ALG-04: Gerçek dispatch sonuçlarını kullan; heuristik yerine L2 dispatch çıktısı.
        direct_pv = float(offgrid_results.get("directPvKwh") or 0)
        battery_kwh = float(offgrid_results.get("batteryKwh") or 0)
        dispatch_self_consumed = max(0.0, direct_pv + battery_kwh)
        # Guard: fiziksel olarak yıllık yükü aşamaz
        dispatch_self_consumed = min(dispatch_self_consumed, annual_load)
        if dispatch_self_consumed < 1.0:
            logger.warning(
                "[financial] Off-grid dispatch returned near-zero self-consumption "
                "(directPv=%.1f, battery=%.1f) — falling back to heuristic",
                direct_pv, battery_kwh,
            )
        else:
            self_consumed = dispatch_self_consumed
    export_kwh = max(0, annual_energy - self_consumed)
    paid_export = export_kwh if net_metering else 0
    annual_savings = self_consumed * financial_import_rate + paid_export * export_rate

    system_power_kwp = max(0, float(production.get("systemPowerKwp") or 0))
    capex_breakdown = _frontend_default_capex_breakdown(request, system_power_kwp)
    rough_capex = capex_breakdown["total"]
    if request.system.batteryEnabled and request.system.battery:
        rough_capex += max(0, float(request.system.battery.get("capacity", 0) or 0)) * 8000

    simple_payback = rough_capex / annual_savings if annual_savings > 0 else None
    financial_defaults = _financial_defaults(request)
    discount_rate = financial_defaults["discountRate"]
    tariff_curve = financial_defaults["tariffIncreaseCurve"]
    # O&M + sigorta ~%1.7/yıl base (JS engine ile tutarlı: omRate=1.2 + insuranceRate=0.5).
    # FIX-3 (O&M escalation): O&M costs escalate with general cost inflation, not
    # the tariff escalation rate. JS uses state.expenseEscalationRate (default 10%).
    base_annual_om_cost = rough_capex * 0.017
    expense_escalation = 0.10  # matches JS default state.expenseEscalationRate
    cashflows = [-rough_capex]
    for year in range(1, 26):
        gross = annual_savings * _tariff_factor(tariff_curve, year)
        om_this_year = base_annual_om_cost * ((1 + expense_escalation) ** (year - 1))
        cashflows.append(gross - round(om_this_year))
    project_npv = _npv(cashflows, discount_rate)
    # Faz-2 D5: `roi` historically held (sum of yr1..25 net cashflows − capex) / capex,
    # i.e. a 25-year cumulative profitability index minus 1 — NOT an annualised
    # return. We surface both: `totalReturnPct` for the legacy figure under a
    # name that matches what it computes, and `irrPct` for the true IRR. The
    # `roiPct` key is kept for backwards compatibility with existing API
    # consumers but mirrors `totalReturnPct`; UIs should migrate to `irrPct`.
    #
    # Parity is intentional: js/calc-core.js:827 uses the identical formula
    #   roi = (totalNetCashFlow - totalCost) / totalCost * 100
    # so backend and frontend produce the same legacy number. Do NOT "fix"
    # this to (sum(cashflows[1:]) / rough_capex) * 100 without also
    # migrating the JS calculator and the dashboard/scenarios consumers
    # (js/dashboard.js, js/scenarios.js, js/proposal-governance.js).
    total_return_pct = ((sum(cashflows[1:]) - rough_capex) / rough_capex) * 100
    irr_value = _irr(cashflows)
    irr_pct = round(irr_value * 100, 2) if irr_value is not None else None

    blockers = []
    if not request.governance.quoteInputsVerified:
        blockers.append("Teklif varsayımları doğrulanmadı.")
    if not request.governance.hasSignedCustomerBillData and not request.load.monthlyConsumptionKwh and not request.load.hourlyConsumption8760:
        blockers.append("Tüketim/fatura kanıtı eksik.")
    if not request.tariff.sourceCheckedAt:
        blockers.append("Tarife kaynak kontrol tarihi eksik.")
    if is_off_grid and not offgrid_results:
        blockers.append("Backend off-grid dispatch hesaplamaz; müşteri çıktısı için frontend L2 dispatch sonucu gerekir.")

    offgrid_dispatch_available = bool(is_off_grid and offgrid_results)
    offgrid_authority = "backend-offgrid-l2-dispatch" if offgrid_dispatch_available else "frontend-offgrid-l2-dispatch"
    offgrid_self_consumption_model = (
        "dispatch-hourly-offgrid-l2"
        if offgrid_dispatch_available
        else "heuristic-target-not-dispatch"
    )
    offgrid_curtailment = (
        round(float(offgrid_results.get("curtailedPvKwh") or 0))
        if offgrid_dispatch_available
        else round(export_kwh)
    )
    offgrid_warning_detail = (
        "Backend financial payload now uses backend Off-Grid L2 dispatch outputs for PV direct use, "
        "battery discharge, curtailment, unmet load, and generator operating cost metadata. "
        "CapEx, proposal governance, and field-guarantee gates are still estimate-only; use BOM, "
        "evidence governance, and field acceptance for customer-facing commitments."
        if offgrid_dispatch_available
        else "Backend financial payload uses heuristic scenario self-consumption targets "
        "and default capex. It does not run the off-grid L2 dispatch, battery SOC, "
        "critical-load priority, generator dispatch, or bad-weather model. It is not "
        "the commercial quote source; use the frontend 8760 financial model, governance, "
        "and BOM basis for customer-facing totals."
    )
    offgrid_proposal_warning = (
        "Off-grid backend financials use backend L2 dispatch served-energy outputs, but they remain "
        "estimate-only until proposal governance, evidence gates, BOM pricing, and field acceptance "
        "are complete."
        if offgrid_dispatch_available
        else "Off-grid backend financials are heuristic only. The backend does not run "
        "off-grid dispatch, battery SOC tracking, critical-load priority, generator dispatch, "
        "or bad-weather stress tests. Use the frontend Off-Grid L2 dispatch result for any "
        "customer-facing off-grid sufficiency or financial output."
    )

    financial = {
        "annualLoadKwh": round(annual_load),
        "selfConsumedEnergyKwh": round(self_consumed),
        "gridExportKwh": 0 if is_off_grid else round(export_kwh),
        "paidGridExportKwh": round(paid_export),
        "curtailedSurplusEstimateKwh": offgrid_curtailment if is_off_grid else None,
        "annualSavingsTry": round(annual_savings),
        "financialSavingsRateTryKwh": round(financial_import_rate, 4),
        "financialBasis": financial_basis,
        "roughCapexTry": round(rough_capex),
        "costBreakdown": capex_breakdown,
        "capexModel": "frontend-default-cost-basis",
        "costAssumptionVersion": capex_breakdown.get("costAssumptionVersion"),
        "financialAssumptionVersion": financial_defaults["version"],
        "financialProfile": financial_defaults["profile"],
        "financialModelLabel": financial_defaults["modelLabel"],
        "tariffIncreaseCurve": tariff_curve,
        "simplePaybackYears": round(simple_payback, 2) if simple_payback else None,
        "npv25Try": round(project_npv),
        "totalReturnPct": round(total_return_pct, 1),
        "irrPct": irr_pct,
        # Faz-2 D5: kept for backwards compatibility — same value as totalReturnPct.
        # New consumers should read `irrPct` for annualised return and
        # `totalReturnPct` for the 25-year cumulative figure.
        "roiPct": round(total_return_pct, 1),
        "roiMetricBasis": "25y-cumulative-net-return-pct (alias of totalReturnPct; not IRR)",
        "estimateOnly": True,
        "dispatchAvailable": offgrid_dispatch_available if is_off_grid else None,
        "authoritativeForOffgrid": offgrid_dispatch_available if is_off_grid else None,
        "offgridDispatchAuthority": offgrid_authority if is_off_grid else None,
        "selfConsumptionModel": (
            offgrid_self_consumption_model
            if is_off_grid
            else "heuristic-scenario-target"
        ),
        "warning": "estimate_only_not_for_commercial_quotes",
        "warningDetail": (
            offgrid_warning_detail
            if is_off_grid
            else "Backend financial payload uses heuristic scenario self-consumption targets "
            "and default capex. It is not the commercial quote source; use the frontend "
            "8760 financial model, governance, and BOM basis for customer-facing totals."
        ),
    }
    proposal = {
        "scenarioKey": scenario_key,
        "scenarioLabel": request.scenario.label,
        "quoteReadiness": "not-quote-ready" if blockers else "backend-engineering-estimate",
        "blockers": blockers,
        "nextAction": "Attach evidence and run full proposal governance before approval." if blockers else "Review proposal governance and customer-facing output.",
        # Faz-2 Fix-9: Explicit disclaimer so any downstream consumer (API client,
        # white-label integration, PDF export) knows this is an estimate, not a
        # full 8760-hour simulation. The browser JS engine uses actual hourly
        # simulation; this backend path uses heuristic self-consumption targets.
        "warning": "estimate_only_not_for_commercial_quotes",
        "warningDetail": (
            offgrid_proposal_warning
            if is_off_grid
            else "Self-consumption calculated via scenario-heuristic target ratios "
            f"({self_consumption_target:.0%}), not 8760-hour hourly dispatch. "
            "NPV may differ from browser calculation by up to 40%. "
            "Use browser output for commercial proposals."
        ),
    }
    return {"financial": financial, "proposal": proposal}


def _frontend_default_capex_breakdown(request: EngineRequest, system_power_kwp: float) -> dict:
    """Mirror the browser's default solar CapEx basis when no BOM is supplied.

    The frontend may still override this with itemized BOM/commercial inputs.
    Backend proposal financials are therefore labelled as a default-cost-basis
    estimate, not a replacement for browser governance/BOM totals.
    """
    assumptions = load_cost_assumptions()
    cost_profile = getattr(request.assumptions, "costProfile", "standard") or "standard"
    if cost_profile not in ("economy", "standard", "premium"):
        cost_profile = "standard"
    panel_key = {
        "mono": "mono_perc",
        "poly": "n_type_topcon",
        "bifacial": "bifacial_topcon",
    }.get(request.system.panelType, request.system.panelType)
    panel_band = assumptions.get("panelPrices", {}).get(panel_key) or assumptions.get("panelPrices", {}).get("mono_perc", {})
    panel_price_per_watt = float(
        panel_band.get("low" if cost_profile == "economy" else "high" if cost_profile == "premium" else "base", 12.0)
    )
    inverter_key = request.system.inverterType or "string"
    inverter_assumption = assumptions.get("inverterAssumptions", {}).get(inverter_key) or assumptions.get("inverterAssumptions", {}).get("string", {})
    inverter_profile = (inverter_assumption.get("profiles", {}).get(cost_profile)
                        or inverter_assumption.get("profiles", {}).get("standard", {}))
    panel_count = int(getattr(request.system, "authoritativePanelCount", 0) or 0)
    if panel_count <= 0:
        watt_peak = float(getattr(request.system, "panelWattPeak", 0) or 0) or 455
        panel_count = max(1, round(system_power_kwp * 1000 / watt_peak))
    if inverter_assumption.get("pricingModel") == "perPanelPlusFixed":
        inverter_per_kwp = 0
        inverter_cost = (
            panel_count * float(inverter_profile.get("perPanel", 0) or 0)
            + float(inverter_profile.get("fixedGateway", 0) or 0)
            + float(inverter_profile.get("monitoring", 0) or 0)
        )
    else:
        inverter_per_kwp = float(inverter_profile.get("base", 6800) or 6800)
        inverter_cost = system_power_kwp * inverter_per_kwp
    bos = assumptions.get("bosAssumptions", {}).get(cost_profile) or assumptions.get("bosAssumptions", {}).get("standard", {})
    permit_cost = 8000 if system_power_kwp < 5 else 6000 if system_power_kwp < 10 else 5000 if system_power_kwp < 20 else 4000
    panel_cost = system_power_kwp * 1000 * panel_price_per_watt
    mounting_cost = system_power_kwp * float(bos.get("mountingPerKwp", 0) or 0)
    dc_cable_cost = system_power_kwp * float(bos.get("dcCablePerKwp", 0) or 0)
    ac_elec_cost = system_power_kwp * float(bos.get("acElectricalPerKwp", 0) or 0)
    labor_cost = system_power_kwp * float(bos.get("laborPerKwp", 0) or 0)
    engineering_cost = system_power_kwp * float(bos.get("engineeringPerKwp", 0) or 0)
    logistics_cost = system_power_kwp * float(bos.get("logisticsPerKwp", 0) or 0)
    subtotal = (
        panel_cost + inverter_cost + mounting_cost + dc_cable_cost + ac_elec_cost
        + labor_cost + engineering_cost + logistics_cost + permit_cost
    )
    manual_mode = getattr(request.assumptions, "manualCostMode", "none") or "none"
    manual = getattr(request.assumptions, "manualCostOverrides", None) or {}

    def _manual_value(*keys: str) -> float | None:
        for key in keys:
            if key in manual:
                value = float(manual.get(key) or 0)
                if value >= 0:
                    return value
        return None

    full_manual_aliases = {
        "panelCost": ("panelCost", "panel"),
        "inverterCost": ("inverterCost", "inverter"),
        "mountingCost": ("mountingCost", "mounting"),
        "dcCableCost": ("dcCableCost", "dcCable"),
        "acElecCost": ("acElecCost", "acElec"),
        "laborCost": ("laborCost", "labor"),
        "engineeringCost": ("engineeringCost", "engineering"),
        "logisticsCost": ("logisticsCost", "logistics"),
        "permitCost": ("permitCost", "permits"),
    }
    manual_bom_missing_fields: list[str] = []

    if manual_mode == "partialManualOverride":
        panel_cost = _manual_value("panelCost", "panel") if _manual_value("panelCost", "panel") is not None else panel_cost
        inverter_cost = _manual_value("inverterCost", "inverter") if _manual_value("inverterCost", "inverter") is not None else inverter_cost
        mounting_cost = _manual_value("mountingCost", "mounting") if _manual_value("mountingCost", "mounting") is not None else mounting_cost
        dc_cable_cost = _manual_value("dcCableCost", "dcCable") if _manual_value("dcCableCost", "dcCable") is not None else dc_cable_cost
        ac_elec_cost = _manual_value("acElecCost", "acElec") if _manual_value("acElecCost", "acElec") is not None else ac_elec_cost
        labor_cost = _manual_value("laborCost", "labor") if _manual_value("laborCost", "labor") is not None else labor_cost
        engineering_cost = _manual_value("engineeringCost", "engineering") if _manual_value("engineeringCost", "engineering") is not None else engineering_cost
        logistics_cost = _manual_value("logisticsCost", "logistics") if _manual_value("logisticsCost", "logistics") is not None else logistics_cost
        permit_cost = _manual_value("permitCost", "permits") if _manual_value("permitCost", "permits") is not None else permit_cost
        subtotal = (
            panel_cost + inverter_cost + mounting_cost + dc_cable_cost + ac_elec_cost
            + labor_cost + engineering_cost + logistics_cost + permit_cost
        )
    elif manual_mode == "fullManualBom":
        manual_total = _manual_value("totalCost", "total", "subtotal")
        if manual_total is not None:
            panel_cost = _manual_value("panelCost", "panel") or 0
            inverter_cost = _manual_value("inverterCost", "inverter") or 0
            mounting_cost = _manual_value("mountingCost", "mounting") or 0
            dc_cable_cost = _manual_value("dcCableCost", "dcCable") or 0
            ac_elec_cost = _manual_value("acElecCost", "acElec") or 0
            labor_cost = _manual_value("laborCost", "labor") or 0
            engineering_cost = _manual_value("engineeringCost", "engineering") or 0
            logistics_cost = _manual_value("logisticsCost", "logistics") or 0
            permit_cost = _manual_value("permitCost", "permits") or 0
            subtotal = manual_total
        else:
            manual_bom_missing_fields = [
                key for key, aliases in full_manual_aliases.items()
                if _manual_value(*aliases) is None
            ]
            panel_cost = _manual_value("panelCost", "panel") or 0
            inverter_cost = _manual_value("inverterCost", "inverter") or 0
            mounting_cost = _manual_value("mountingCost", "mounting") or 0
            dc_cable_cost = _manual_value("dcCableCost", "dcCable") or 0
            ac_elec_cost = _manual_value("acElecCost", "acElec") or 0
            labor_cost = _manual_value("laborCost", "labor") or 0
            engineering_cost = _manual_value("engineeringCost", "engineering") or 0
            logistics_cost = _manual_value("logisticsCost", "logistics") or 0
            permit_cost = _manual_value("permitCost", "permits") or 0
            subtotal = (
                panel_cost + inverter_cost + mounting_cost + dc_cable_cost + ac_elec_cost
                + labor_cost + engineering_cost + logistics_cost + permit_cost
            )
    vat_key = getattr(request.assumptions, "vatProfile", "standard") or "standard"
    vat_profiles = assumptions.get("vatProfiles", {})
    vat = vat_profiles.get(vat_key) or vat_profiles.get("standard", {})
    vat_fallback_applied = False
    if vat_key == "manual":
        manual_rates = getattr(request.assumptions, "manualVatRates", None) or {}
        if "panelVatRate" in manual_rates and "nonPanelVatRate" in manual_rates:
            panel_vat_rate = max(0.0, min(1.0, float(manual_rates.get("panelVatRate") or 0)))
            non_panel_vat_rate = max(0.0, min(1.0, float(manual_rates.get("nonPanelVatRate") or 0)))
        else:
            vat = vat_profiles.get("standard", {})
            vat_fallback_applied = True
            panel_vat_rate = float(vat.get("panelVatRate", 0) or 0)
            non_panel_vat_rate = float(vat.get("nonPanelVatRate", 0.20) or 0.20)
    else:
        panel_vat_rate = float(vat.get("panelVatRate", 0) or 0)
        non_panel_vat_rate = float(vat.get("nonPanelVatRate", 0.20) or 0.20)
    non_panel_subtotal = subtotal - panel_cost
    kdv = panel_cost * panel_vat_rate + non_panel_subtotal * non_panel_vat_rate
    manual_kdv = _manual_value("kdv", "vat") if manual_mode == "fullManualBom" else None
    if manual_kdv is not None:
        kdv = manual_kdv
    total = max(1, subtotal + kdv)
    return {
        "panel": round(panel_cost),
        "inverter": round(inverter_cost),
        "mounting": round(mounting_cost),
        "dcCable": round(dc_cable_cost),
        "acElec": round(ac_elec_cost),
        "labor": round(labor_cost),
        "engineering": round(engineering_cost),
        "logistics": round(logistics_cost),
        "permits": round(permit_cost),
        "subtotal": round(subtotal),
        "kdv": round(kdv),
        "total": round(total),
        "invUnit": round(inverter_per_kwp),
        "costProfile": cost_profile,
        "manualCostMode": manual_mode,
        "vatProfile": "standard" if vat_fallback_applied else vat_key,
        "requestedVatProfile": vat_key,
        "vatFallbackApplied": vat_fallback_applied,
        "panelKdvRate": panel_vat_rate,
        "nonPanelKdvRate": non_panel_vat_rate,
        "costAssumptionVersion": assumptions.get("version"),
        "manualBomCompleteness": "incomplete" if manual_mode == "fullManualBom" and manual_bom_missing_fields else "complete",
        "manualBomMissingFields": manual_bom_missing_fields,
    }


def _frontend_default_capex(request: EngineRequest, system_power_kwp: float) -> float:
    """Backward-compatible helper for tests and older internal callers."""
    return float(_frontend_default_capex_breakdown(request, system_power_kwp)["total"])


def calculate_financial_proposal(request: EngineRequest) -> EngineResponse:
    production_payload = calculate_backend_production(request)
    offgrid_results = build_backend_offgrid_results(request, production_payload["production"])
    financial_payload = build_financial_payload(request, production_payload["production"], offgrid_results)
    return EngineResponse(
        engineSource=production_payload["engineSource"],
        production=production_payload["production"],
        losses=production_payload["losses"],
        financial=financial_payload["financial"],
        proposal=financial_payload["proposal"],
        offgridL2Results=offgrid_results,
        raw={**production_payload.get("raw", {}), "mode": "financial-proposal", "offgridDispatchAvailable": bool(offgrid_results)},
    )
