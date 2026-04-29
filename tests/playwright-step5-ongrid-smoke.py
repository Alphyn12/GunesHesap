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
            page = browser.new_page(viewport={"width": 1440, "height": 1200})
            enter_calculator(page, base_url)

            page.evaluate(
                """() => {
                    window.state.scenarioKey = 'on-grid';
                    window.state.lat = 41.6771;
                    window.state.lon = 26.5557;
                    window.state.cityName = 'Edirne';
                    window.state.ghi = 1490;
                    window.state.roofArea = 120;
                    window.state.multiRoof = false;
                    window.state.roofSections = [];
                    window.state.results = null;
                    window.goToStep(5);
                }"""
            )

            page.wait_for_function("window.state.step === 5")
            assert page.locator("#on-grid-flow-panel").is_visible()
            assert page.locator(".on-grid-choice-card").count() == 2
            assert page.locator("#on-grid-monthly-bill-estimate").is_visible()
            assert page.locator("#step5-advanced-card").evaluate("el => !el.open")

            page.select_option("#on-grid-subscriber-type", "commercial")
            page.fill("#on-grid-monthly-bill-estimate", "12500")
            page.click('[data-design-target-card="fill-roof"]')
            page.wait_for_function(
                "() => window.state.subscriberType === 'commercial' && window.state.designTarget === 'fill-roof' && Number(window.state.annualConsumptionKwh) > 0"
            )

            summary_text = page.locator("#on-grid-flow-summary").inner_text()
            assert "Maksimum teknik performans" in summary_text
            assert "₺/" in summary_text

            page.click('[data-on-grid-mode-btn="advanced"]')
            page.wait_for_function("window.state.onGridInputMode === 'advanced'")
            assert page.locator("#on-grid-advanced-fields").is_visible()
            assert page.locator("#step5-advanced-card").evaluate("el => el.open")
            assert page.locator("#tariff-source-type").is_visible()
            page.select_option("#on-grid-usage-profile", "business-hours")
            page.fill("#distribution-fee-input", "0.50")

            page.click('[data-testid="calculate-results"]')
            page.wait_for_function("window.state.step === 6")

            browser.close()
    finally:
        server.shutdown()

    print("step5 on-grid smoke passed")


if __name__ == "__main__":
    main()
