from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from time import sleep
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

from playwright_helpers import install_local_analytics_stub


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


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

    console_errors = []
    page_errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1400})
            install_local_analytics_stub(page)
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.goto(f"{base_url}/index.html", wait_until="networkidle")
            page.evaluate(
                """
                () => {
                  window.state = {
                    ...window.state,
                    step: 6,
                    cityName: 'Antalya',
                    lat: 36.8969,
                    lon: 30.7133,
                    scenarioKey: 'off-grid',
                    scenarioContext: {
                      label: 'Off-Grid',
                      resultFrame: 'Bagimsiz sistem yorumu',
                      resultCaution: 'Bu ekran ilk karar ve on fizibilite icindir.',
                      nextAction: 'Saha olcumu ve net yuk listesi ile teklif asamasina gecilebilir.'
                    },
                    panelType: 'mono_perc',
                    dailyConsumption: 12,
                    roofArea: 90,
                    tilt: 30,
                    azimuthName: 'Güney',
                    shadingFactor: 8,
                    soilingFactor: 3,
                    netMeteringEnabled: false,
                    displayCurrency: 'TRY',
                    usdToTry: 38.5,
                    results: {
                      annualEnergy: 5420,
                      annualSavings: 38700,
                      systemPower: 3.76,
                      co2Savings: '2.38',
                      panelCount: 8,
                      trees: 54,
                      totalCost: 285000,
                      financialCostBasis: 285000,
                      grossSimplePaybackYear: 7.4,
                      discountedPaybackYear: 9,
                      npvTotal: 412000,
                      roi: 168,
                      irr: '18.7',
                      lcoe: 2.14,
                      compensatedLcoe: 2.01,
                      annualOMCost: 3200,
                      annualInsurance: 900,
                      inverterReplaceCost: 28000,
                      monthlyData: [290, 310, 420, 510, 590, 640, 690, 670, 560, 470, 360, 300],
                      pr: 81,
                      psh: 5.2,
                      ysp: 1441,
                      cf: 16.4,
                      nmMetrics: { selfConsumptionPct: 100, selfConsumedEnergy: 5420, annualGridExport: 0 },
                      compensationSummary: { directSelfConsumptionKwh: 5420, importOffsetKwh: 0, paidGridExport: 0, annualExportCapKwh: 0, settlementInterval: 'off-grid' },
                      costBreakdown: { kdv: 0, bom: { rows: [] } },
                      hourlySummary: { annualLoad: 4380, gridExport: 0 },
                      calculationWarnings: [],
                      proposalGovernance: { confidence: { score: 82, level: 'engineering-estimate' }, approval: {}, financing: {}, maintenance: {}, revision: {}, ledger: { entries: [] } },
                      evidenceGovernance: { registry: {} },
                      tariffSourceGovernance: {},
                      quoteReadiness: { status: 'engineering estimate', blockers: [] }
                    }
                  };
                  window.goToStep(7);
                  window.renderResults();
                }
                """
            )
            page.wait_for_selector("#step-7.active")
            heading = page.locator("#step-7 .step-heading-title").inner_text()
            fin_title = page.locator("#step-7 .fin-box .card-title").inner_text()
            helper = page.locator("#step-7 .fin-box .result-helper").inner_text()
            tech_title = page.locator("#step-7 .card-title").filter(has_text="Kolay Okunan Sistem Özeti").first.inner_text()
            expert_details_count = page.locator("#step-7 #eng-report-toggle").count()
            actions_note_count = page.locator("#step-7 .result-actions-note").count()
            browser.close()

        assert "Sonuçlarınız Hazır" in heading
        assert "Yatırım Özeti" in fin_title
        assert "kurulum bütçesini" in helper
        assert "Kolay Okunan Sistem Özeti" in tech_title
        assert expert_details_count == 0
        assert actions_note_count == 0
        assert not page_errors, page_errors
        assert not console_errors, console_errors
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
