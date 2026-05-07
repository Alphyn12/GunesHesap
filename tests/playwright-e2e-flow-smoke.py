from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from time import sleep
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

from playwright_helpers import enter_calculator


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


PVGIS_MONTHLY = [850, 950, 1250, 1450, 1700, 1850, 1900, 1800, 1500, 1200, 900, 750]


def pvgis_payload():
    return {
        "outputs": {
            "totals": {"fixed": {"E_y": sum(PVGIS_MONTHLY), "H(i)_y": 1780}},
            "monthly": {"fixed": [{"E_m": value} for value in PVGIS_MONTHLY]},
        }
    }


def pvgis_series_payload():
    return {"outputs": {"hourly": []}}


def backend_payload():
    backend_monthly = [1200, 1300, 1500, 1700, 1900, 2050, 2100, 2000, 1750, 1450, 1250, 1100]
    return {
        "schema": "GH-PV-ENGINE-CONTRACT-2026.04-v1",
        "engineSource": {
            "engine": "python-backend",
            "provider": "python-pvlib",
            "source": "pvlib-backed",
            "confidence": "high",
            "engineQuality": "engineering-mvp",
            "pvlibReady": True,
            "pvlibBacked": True,
            "fallbackUsed": False,
            "notes": ["E2E smoke backend fixture"],
        },
        "production": {
            "engine_used": "pvlib-backed",
            "engine_quality": "engineering-mvp",
            "annualEnergyKwh": sum(backend_monthly),
            "monthlyEnergyKwh": backend_monthly,
            "systemPowerKwp": 12.9,
            "panelCount": 30,
        },
        "losses": {
            "transpositionModel": "fixture",
            "temperatureModel": "fixture",
            "fallbackReason": None,
        },
        "financial": {"annualSavingsTry": 120000},
        "proposal": {"quoteReadiness": "backend-engineering-estimate"},
        "raw": {"engineUsed": "pvlib-backed", "engineQuality": "engineering-mvp", "fallbackUsed": False},
    }


def assert_no_overflow(page, label):
    sizes = page.evaluate(
        """() => ({
            width: window.innerWidth,
            doc: document.documentElement.scrollWidth,
            body: document.body.scrollWidth
        })"""
    )
    assert sizes["doc"] <= sizes["width"] + 2, (label, sizes)


def install_common_routes(page):
    page.route("**/PVcalc**", lambda route: route.fulfill(
        status=200,
        headers={"content-type": "application/json", "access-control-allow-origin": "*"},
        json=pvgis_payload(),
    ))
    page.route("**/seriescalc**", lambda route: route.fulfill(
        status=200,
        headers={"content-type": "application/json", "access-control-allow-origin": "*"},
        json=pvgis_series_payload(),
    ))


def install_backend_routes(page):
    page.route("http://127.0.0.1:8000/health", lambda route: route.fulfill(
        status=200,
        headers={"content-type": "application/json", "access-control-allow-origin": "*"},
        json={"status": "ok", "pvlibAvailable": True, "pvlibBackedEngineAvailable": True, "fallbackEngine": "python-deterministic-fallback"},
    ))
    page.route("http://127.0.0.1:8000/api/pv/calculate", lambda route: route.fulfill(
        status=200,
        headers={"content-type": "application/json", "access-control-allow-origin": "*"},
        json=backend_payload(),
    ))


def select_ankara_with_search(page):
    page.fill("#city-search", "Ankara")
    page.wait_for_selector(".autocomplete-item")
    page.locator(".autocomplete-item").first.click()
    page.wait_for_timeout(250)
    assert page.locator("#loc-bottom-ghi-val").count() == 1
    assert "kWh/m²/yıl" in page.locator("#loc-bottom-ghi-val").inner_text()


def run_click_flow_to_results(
    page,
    *,
    roof_area="80",
    design_target="bill-offset",
    usable_roof_ratio="70",
    settlement_date=None,
    tariff_source_type="manual",
    export_tariff="0",
):
    page.click('.scenario-choice-card[data-scenario-key="on-grid"]')
    page.click("#step1-continue-btn")
    page.wait_for_function("window.state.step === 2")
    select_ankara_with_search(page)
    page.click("#step2-continue-btn")
    page.wait_for_function("window.state.step === 3")
    page.fill("#roof-area", roof_area)
    page.click(".step3-nav-sticky .btn-primary")
    page.wait_for_function("window.state.step === 4")
    assert page.locator(".panel-card").count() >= 3
    assert page.locator(".inverter-card").count() >= 3
    page.click(".equipment-summary-card .btn-primary")
    page.wait_for_function("window.state.step === 5")
    assert page.locator("#on-grid-flow-panel").is_visible()
    assert page.locator("#on-grid-subscriber-type").is_visible()
    assert page.locator("#on-grid-monthly-bill-estimate").is_visible()
    assert page.locator('[data-design-target-card="bill-offset"]').is_visible()
    page.select_option("#on-grid-subscriber-type", "commercial")
    page.fill("#on-grid-annual-consumption", "18000")
    if design_target == "fill-roof":
        page.click('[data-design-target-card="fill-roof"]')
    else:
        page.click('[data-design-target-card="bill-offset"]')
    page.click('[data-on-grid-mode-btn="advanced"]')
    assert page.locator("#on-grid-advanced-fields").is_visible()
    assert page.locator("#on-grid-usage-profile").is_visible()
    page.select_option("#on-grid-usage-profile", "business-hours")
    # Verify new Turn-1 form fields exist
    assert page.locator("#tariff-input-mode").count() == 1
    assert page.locator("#hourly-csv-upload").count() == 1
    assert page.locator("#tariff-source-type").count() == 1
    assert page.locator("#cost-source-type").count() == 1
    # Tariff mode must default to net-plus-fee so distribution fee is added (not gross/double-count)
    assert page.evaluate("window.state.tariffInputMode") == "net-plus-fee"
    page.fill("#on-grid-usable-roof-ratio", usable_roof_ratio)
    page.fill("#distribution-fee-input", "0.50")
    page.select_option("#tariff-source-type", tariff_source_type)
    page.fill("#export-tariff-input", export_tariff)
    if settlement_date is not None:
        page.fill("#settlement-date", settlement_date)
    page.wait_for_function(
        """([target, usablePct]) =>
            window.state.subscriberType === 'commercial'
            && window.state.usageProfile === 'business-hours'
            && window.state.designTarget === target
            && Math.round(window.state.usableRoofRatio * 100) === usablePct""",
        arg=[design_target, int(float(usable_roof_ratio))]
    )
    page.fill("#tariff-input", "8.44")
    page.wait_for_function(
        "() => Math.abs(window.state.importTariffBase - 8.44) < 0.001 && Math.abs(window.state.distributionFee - 0.50) < 0.001"
    )
    page.click('[data-testid="calculate-results"]')
    try:
        page.wait_for_function(
            "document.getElementById('step-7')?.classList.contains('active') && window.state.results",
            timeout=30000,
        )
        page.wait_for_function("!window.isCalculationInProgress?.()")
    except Exception as exc:
        debug_state = page.evaluate(
            """() => ({
                step: window.state?.step,
                hasResults: Boolean(window.state?.results),
                scenarioKey: window.state?.scenarioKey,
                subscriberType: window.state?.subscriberType,
                usageProfile: window.state?.usageProfile,
                annualConsumptionKwh: window.state?.annualConsumptionKwh,
                usableRoofRatio: window.state?.usableRoofRatio,
                calculationInProgress: window.isCalculationInProgress?.(),
                calculationError: window.state?.calculationError || null,
                pvgisLastError: window._pvgisLastError || null,
                loadingText: document.getElementById('loading-msg')?.innerText || null,
                loadingPct: document.getElementById('ring-pct-text')?.innerText || null,
                bodyToast: document.body?.innerText?.match(/Hesaplama hatası[^\\n]*/)?.[0] || null
            })"""
        )
        raise AssertionError(f"calculation did not reach results: {debug_state}") from exc
    page.wait_for_timeout(800)


def assert_on_grid_economics(page, *, expected_design_target, settlement_expected):
    summary = page.evaluate(
        """() => {
            const r = window.state?.results || {};
            const tm = r.tariffModel || {};
            const readiness = r.quoteReadiness || {};
            const blockers = readiness.blockers || [];
            const comp = r.compensationSummary || {};
            const layout = r.authoritativeProduction?.layoutSnapshot || r.engineParity?.layoutSnapshot || null;
            return {
                step: window.state?.step,
                settlementProvisional: Boolean(r.settlementProvisional),
                settlementAssumptionBasis: r.settlementAssumptionBasis || null,
                readinessStatus: readiness.status || null,
                settlementMissingBlocker: blockers.some(b => String(b).includes('SETTLEMENT_DATE_MISSING')),
                compensationSummary: comp,
                annualSavings: r.annualSavings,
                firstYearGrossSavings: r.firstYearGrossSavings,
                firstYearNetCashFlow: r.firstYearNetCashFlow,
                nmMetrics: r.nmMetrics || {},
                settlementInterval: tm.exportCompensationPolicy?.interval || null,
                designTarget: window.state?.designTarget,
                layoutSnapshot: layout
            };
        }"""
    )
    assert summary["step"] == 7, summary
    assert summary["designTarget"] == expected_design_target, summary
    assert summary["settlementProvisional"] is settlement_expected["provisional"], summary
    assert summary["settlementMissingBlocker"] is settlement_expected["missing_blocker"], summary
    if settlement_expected["provisional"]:
        assert summary["settlementAssumptionBasis"], summary
    else:
        assert summary["settlementAssumptionBasis"] != "auto-settlement-date-missing-assumed-monthly-for-preliminary-economics", summary
    assert summary["annualSavings"] == summary["firstYearGrossSavings"], summary
    assert summary["firstYearNetCashFlow"] is not None, summary
    assert summary["nmMetrics"].get("importOffsetEnergy", 0) >= 0, summary
    assert summary["nmMetrics"].get("paidGridExport", 0) >= 0, summary
    assert summary["compensationSummary"].get("compensatedConsumptionEnergy", 0) >= 0, summary
    assert page.locator("#on-grid-result-layers .on-grid-result-card").count() == 2
    result_text = page.locator("#on-grid-result-layers").inner_text()
    assert "Mahsuplaşma" in result_text or "Settlement" in result_text, result_text


def desktop_backend_flow(browser, base_url):
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, service_workers="block", accept_downloads=True)
    page = ctx.new_page()
    page_errors = []
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    install_common_routes(page)
    install_backend_routes(page)
    enter_calculator(page, base_url)
    page.evaluate("window.state.enginePreference = 'python-backend'")

    run_click_flow_to_results(
        page,
        roof_area="80",
        design_target="bill-offset",
        usable_roof_ratio="70",
        settlement_date="2026-04-01",
        tariff_source_type="official",
        export_tariff="0",
    )
    assert page.evaluate("window.state.step") == 7
    assert_on_grid_economics(
        page,
        expected_design_target="bill-offset",
        settlement_expected={"provisional": False, "missing_blocker": False},
    )
    assert int(page.locator("#kpi-energy").inner_text().replace(".", "").replace(",", "")) > 0
    assert page.locator("#result-engine-source").count() == 0
    assert page.locator("#result-alert-stack").count() == 0
    assert page.locator("#audit-panel-card").count() == 0
    assert page.locator("#on-grid-result-layers .on-grid-result-card").count() == 2
    assert_no_overflow(page, "desktop results")

    page.evaluate(
        """() => {
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: async value => { window.__sharedUrl = value; } },
                configurable: true
            });
            window.jspdf = { jsPDF: function() {
                return {
                    setFillColor(){}, rect(){}, setTextColor(){}, setFontSize(){}, setFont(){},
                    setDrawColor(){}, setLineWidth(){}, line(){}, addPage(){},
                    text(value){ (window.__pdfText ||= []).push(String(value)); },
                    splitTextToSize(value){ return String(value).split("\\n"); },
                    save(name){ window.__pdfSaved = name; }
                };
            }};
        }"""
    )
    page.click('[data-testid="download-proposal-pdf"]')
    assert page.evaluate("window.__pdfSaved").startswith("solar-rota-")
    page.click('[data-testid="share-results"]')
    page.wait_for_function("window.__sharedUrl?.includes('#')")
    # "Teklif Al" artık JSON indir yerine iletişim formu modal'ını açıyor
    page.click('[data-testid="get-quote"]')
    assert page.locator("#quote-modal").evaluate("el => getComputedStyle(el).display") == "flex"
    page.click('#quote-modal button[aria-label="Kapat"]')

    page.click('[data-testid="save-calculation"]')
    page.click('[data-testid="open-settings"]')
    page.click("#dashboard-btn")
    assert page.locator("#dashboard-modal").evaluate("el => getComputedStyle(el).display") == "flex"
    assert "Ankara" in page.locator("#dashboard-body").inner_text()
    page.click('#dashboard-modal button[aria-label="Kapat"]')
    page.click('[data-testid="open-comparison"]')
    assert page.locator("#comparison-modal").evaluate("el => getComputedStyle(el).display") == "flex"
    assert page.locator("#comparison-result-table").inner_text().count("Senaryo") >= 3
    assert not page_errors, page_errors
    ctx.close()


def backend_unavailable_fallback_flow(browser, base_url):
    ctx = browser.new_context(viewport={"width": 430, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    page = ctx.new_page()
    page_errors = []
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    install_common_routes(page)
    page.route("http://127.0.0.1:8000/**", lambda route: route.abort())
    enter_calculator(page, base_url)
    run_click_flow_to_results(
        page,
        roof_area="45",
        design_target="fill-roof",
        usable_roof_ratio="60",
        settlement_date=None,
        tariff_source_type="manual",
        export_tariff="0",
    )
    assert page.evaluate("window.state.backendEngineAvailable") is not True
    assert_on_grid_economics(
        page,
        expected_design_target="fill-roof",
        settlement_expected={"provisional": False, "missing_blocker": False},
    )
    assert page.locator("#result-engine-source").count() == 0
    assert page.locator("#result-alert-stack").count() == 0
    assert page.locator("#on-grid-result-layers .on-grid-result-card").count() == 2
    assert_no_overflow(page, "mobile fallback results")
    assert not page_errors, page_errors
    ctx.close()


def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), lambda *args, **kwargs: QuietHandler(*args, directory=str(root), **kwargs))
    base_url = f"http://127.0.0.1:{server.server_port}"
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    for _ in range(20):
        try:
            with urlopen(f"{base_url}/index.html", timeout=1) as response:
                if response.status == 200:
                    break
        except Exception:
            sleep(0.1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            desktop_backend_flow(browser, base_url)
            backend_unavailable_fallback_flow(browser, base_url)
            browser.close()
            print("end-to-end flow smoke passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
