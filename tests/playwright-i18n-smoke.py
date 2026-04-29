from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
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
            ctx = browser.new_context(service_workers="block")
            page = ctx.new_page()
            enter_calculator(page, base_url)
            assert page.locator(".header-lang-btn").count() == 0
            assert page.locator("#exchange-rate-status-header").count() == 0
            page.click('[data-testid="open-settings"]')
            page.click('[data-lang="en"]')
            page.wait_for_function("document.querySelector('.hero-title')?.textContent.includes('Design your solar energy system')")
            page.wait_for_function("document.querySelector('.scenario-select-headline')?.textContent === 'Choose your solar system type'")
            assert page.evaluate("localStorage.getItem('guneshesap_lang')") == "en"
            assert page.locator('.step-dot[data-step="1"] .step-dot-label').inner_text() == "Scenario"
            assert page.locator('.step-dot[data-step="1"]').get_attribute("aria-label") == "1. step: Scenario"
            assert page.locator('.step-dot[data-step="7"] .step-dot-label').inner_text() == "Results"
            assert page.locator('.step-dots').get_attribute("aria-label") == "Form steps"
            assert page.locator('#settings-panel .lang-btn[data-lang="en"]').get_attribute("aria-pressed") == "true"
            page.click("#settings-close-btn")
            assert page.locator('.scenario-choice-card[data-scenario-key="on-grid"] strong').inner_text() == "On-Grid"
            assert "Bill savings" in page.locator('.scenario-choice-card[data-scenario-key="on-grid"] .scenario-card-desc').inner_text()
            assert page.locator("#geolocation-btn svg").count() == 1
            assert page.locator("#geolocation-btn .step2-geo-label").inner_text() == "Use My Location"
            page.click('.scenario-choice-card[data-scenario-key="off-grid"]')
            assert "Output you will get" in page.locator("#scenario-selected-summary").inner_text()
            assert "Continue with Off-Grid" in page.locator("#step1-continue-btn").inner_text()
            assert page.locator('.scenario-choice-card[data-scenario-key="off-grid"]').get_attribute("aria-pressed") == "true"
            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_function("document.querySelector('.hero-title')?.textContent.includes('Design your solar energy system')")
            page.click('[data-testid="open-settings"]')
            page.click('[data-lang="de"]')
            page.wait_for_function("document.querySelector('.hero-title')?.textContent.includes('Planen Sie Ihr Solarsystem')")
            assert page.evaluate("localStorage.getItem('guneshesap_lang')") == "de"
            assert page.locator('.step-dot[data-step="1"] .step-dot-label').inner_text() == "Szenario"
            assert page.locator('.step-dot[data-step="1"]').get_attribute("aria-label") == "1. Schritt: Szenario"
            assert page.locator('.step-dot[data-step="7"] .step-dot-label').inner_text() == "Ergebnisse"
            assert page.locator('.step-dots').get_attribute("aria-label") == "Formularschritte"
            assert page.locator("#geolocation-btn svg").count() == 1
            assert page.locator("#geolocation-btn .step2-geo-label").inner_text() == "Meinen Standort verwenden"
            assert page.locator('.scenario-choice-card[data-scenario-key="off-grid"] strong').inner_text() == "Off-Grid"
            print("i18n browser smoke passed")
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
