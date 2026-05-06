from playwright.sync_api import sync_playwright

from playwright_helpers import install_local_analytics_stub


def main():
    console_errors = []
    page_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 900})
        install_local_analytics_stub(page)
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))
        page.goto("http://127.0.0.1:3020/index.html", wait_until="networkidle")
        page.evaluate(
            """
            () => {
              window.state = {
                ...window.state,
                scenarioKey: 'off-grid',
                roofArea: 80,
                usableRoofRatio: 0.75,
                panelType: 'mono_perc',
                panelCatalogId: null,
                annualConsumptionKwh: 7200,
                dailyConsumption: 19.7,
                ghi: 1600,
                azimuthCoeff: 0.98,
                shadingFactor: 5,
                batteryEnabled: true,
                battery: { capacity: 15, dod: 0.9, efficiency: 0.95 },
                offgridCriticalFraction: 0.45,
                tariff: 7.16
              };
              window.goToStep(6);
            }
            """
        )
        page.wait_for_selector("#step-6.active .calc-stage-shell")
        headline = page.locator("#step-6 .loading-headline").inner_text()
        side_title = page.locator("#step-6 .calc-stage-side h2").inner_text()
        metric_text = page.locator("#step-6 .calc-side-metrics").inner_text()
        loading_steps = page.locator("#step-6 .loading-step").count()
        progress_track = page.locator("#step-6 #loading-progress-fill").count()
        browser.close()

    assert "Hesap modeli" in headline
    assert "Sonuçlar hazırlanıyor" in side_title
    assert loading_steps == 4, f"expected 4 loading steps, found {loading_steps}"
    assert progress_track == 1, f"expected progress fill, found {progress_track}"
    assert "PVGIS + yerel model" in metric_text
    assert not page_errors, page_errors
    assert not console_errors, console_errors


if __name__ == "__main__":
    main()
