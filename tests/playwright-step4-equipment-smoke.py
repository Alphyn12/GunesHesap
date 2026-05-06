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
            page = browser.new_page(viewport={"width": 1440, "height": 1400})
            enter_calculator(page, base_url)
            page.evaluate(
                """() => {
                    window.state.lat = 41.0;
                    window.state.lon = 28.9;
                    window.state.cityName = 'Istanbul';
                    window.state.ghi = 1550;
                    window.goToStep(2);
                }"""
            )
            page.wait_for_function("window.state.step === 2")
            assert page.locator("#roof-draw-start-hint").is_visible()

            page.evaluate("validateStep2()")
            page.wait_for_function("window.state.step === 3")
            page.fill("#roof-area", "120")
            page.click(".step3-nav-sticky .btn-primary")
            page.wait_for_function("window.state.step === 4")

            page.evaluate(
                """() => {
                    const data = window._appData;
                    window.state.annualConsumptionKwh = 9600;
                    window.state.usableRoofRatio = 0.72;
                    window.state.panelSelectionMode = 'basic';
                    window.state.panelType = 'n_type_topcon';
                    window.state.panelCatalogId = null;
                    window.state.inverterType = 'optimizer';
                    window.state.batteryEnabled = true;
                    window.state.battery = { ...data.BATTERY_MODELS.tesla_pw3, model: 'tesla_pw3' };
                    window.buildPanelCards();
                    window.buildInverterCards();
                    window.updatePanelPreview();
                    window.onBatteryToggle(true);
                }"""
            )
            page.wait_for_function("window.state.step === 4")
            page.wait_for_selector(".panel-card")
            page.wait_for_selector(".inverter-card")
            page.wait_for_selector(".bat-model-btn")

            assert page.locator('[data-panel-mode-btn="basic"]').get_attribute("class") and "active" in page.locator('[data-panel-mode-btn="basic"]').get_attribute("class")
            assert page.locator(".panel-card").count() == 4
            assert page.locator(".inverter-card").count() == 3
            assert page.locator(".bat-model-btn").count() == 6

            assert "Ortalama profil" in page.locator("#panel-cards-wrap").inner_text()
            page.wait_for_function("document.querySelector('#datasheet-sizing-cold-voc')?.innerText.includes('V')")
            assert page.locator("#datasheet-sizing-scenario-tbody tr").count() == 3
            assert "Tarayıcı ön kontrolü" in page.locator("#datasheet-sizing-note").inner_text()
            page.click("#datasheet-sizing-edit-toggle")
            assert page.locator(".datasheet-sizing-form-intro").is_visible()
            pmax_coeff_value = page.locator('[name="pmaxCoeffPctPerC"]').input_value()
            assert pmax_coeff_value.startswith("-0.29")
            assert len(pmax_coeff_value) <= 6
            page.click("#datasheet-sizing-edit-toggle")
            assert "SolarEdge Home Hub + S440" in page.locator(".inverter-card.selected").inner_text()
            assert page.locator("#battery-summary").is_visible()
            assert "Tesla Powerwall 3" in page.locator("#battery-summary").inner_text()
            assert "SolarEdge Home Battery 400V" in page.locator("#bat-models-wrap").inner_text()
            assert "panel + inverter + batarya" in page.locator("#equip-summary-cost-note").inner_text().lower()
            assert page.locator("#equip-summary-inverter-cost").inner_text() != "—"
            assert page.locator("#equip-summary-battery-cost").inner_text() != "Kapalı"

            page.click('[data-battery-model="custom"]')
            page.wait_for_selector("#bat-custom-inputs", state="visible")
            page.fill("#bat-capacity", "8.5")
            page.fill("#bat-dod", "90")
            page.fill("#bat-eff-input", "92")
            page.wait_for_timeout(150)
            assert "Özel 8.5 kWh" in page.locator("#equip-summary-battery").inner_text()

            page.click('[data-panel-tech="bifacial_topcon"]')
            page.wait_for_timeout(100)
            assert "Bifacial" in page.locator("#equip-summary-panel-type").inner_text()
            assert page.evaluate("window.state.panelCatalogId") is None

            page.click('[data-panel-mode-btn="advanced"]')
            page.wait_for_timeout(100)
            assert page.locator(".panel-card").count() == 6
            assert page.locator(".panel-card .panel-catalog-link").nth(0).is_visible()

            page.click('#inv-card-micro')
            page.wait_for_timeout(100)
            assert "Mikro İnverter" in page.locator("#equip-summary-inverter").inner_text()
            assert page.locator("#equip-summary-power").inner_text().endswith("kWp")
            assert "m²" in page.locator("#equip-summary-area").inner_text()
            assert "Kullanılabilir enerji" in page.locator("#battery-summary").inner_text()

            page.click('#step-4 .btn-primary.btn-full')
            page.wait_for_function("window.state.step === 5")
            assert page.locator("#step-5").get_attribute("class") and "active" in page.locator("#step-5").get_attribute("class")
            assert page.locator("#on-grid-flow-panel").is_visible()

            page.screenshot(path="tests/artifacts-step4-equipment.png", full_page=True)
            browser.close()
    finally:
        server.shutdown()

    print("step4 equipment smoke passed")


if __name__ == "__main__":
    main()
