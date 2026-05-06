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


def assert_no_page_overflow(page, label):
    overflow = page.evaluate(
        """() => ({
            width: window.innerWidth,
            doc: document.documentElement.scrollWidth,
            body: document.body.scrollWidth
        })"""
    )
    assert overflow["doc"] <= overflow["width"] + 2, (label, overflow)
    assert overflow["body"] <= overflow["width"] + 2, (label, overflow)


def assert_app_route_visible(page):
    route_state = page.evaluate(
        """() => ({
            route: document.body.dataset.route,
            hash: location.hash,
            landingActive: document.body.classList.contains('landing-active'),
            step: document.body.dataset.step,
            headerVisible: getComputedStyle(document.getElementById('app-header')).display !== 'none',
            mainVisible: getComputedStyle(document.getElementById('main-content')).display !== 'none'
        })"""
    )
    assert route_state == {
        "route": "app",
        "hash": "#/app",
        "landingActive": False,
        "step": "1",
        "headerVisible": True,
        "mainVisible": True,
    }, route_state


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
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True,
                has_touch=True,
                service_workers="block",
            )
            ctx.add_init_script(
                """Object.defineProperty(navigator, 'geolocation', {
                    value: { getCurrentPosition: (ok, err) => err({ code: 1, message: 'denied' }) },
                    configurable: true
                });"""
            )
            page = ctx.new_page()
            enter_calculator(page, base_url)

            assert "Solar Rota" in page.title()
            assert_app_route_visible(page)
            assert page.locator(".logo-text").inner_text() == "Solar Rota"
            body_text = page.locator("body").inner_text()
            assert "GüneşHesap" not in body_text
            assert "GunesHesap" not in body_text
            assert_no_page_overflow(page, "initial mobile app")

            scenario_cards = page.locator("#step-1.active .scenario-choice-card")
            assert scenario_cards.count() >= 2
            first_card = scenario_cards.first
            assert first_card.is_visible()
            card_box = first_card.bounding_box()
            viewport_width = page.evaluate("window.innerWidth")
            assert card_box and card_box["width"] <= viewport_width, card_box
            assert card_box["height"] >= 64, card_box

            assert page.locator(".header-lang-btn").count() == 0
            assert page.locator("#exchange-rate-status-header").count() == 0
            page.click('[data-testid="open-settings"]')
            page.click('[data-lang="en"]')
            page.wait_for_function("document.querySelector('.hero-title')?.textContent.includes('Design your solar energy system')")
            page.click("#settings-close-btn")
            page.click('.scenario-choice-card[data-scenario-key="on-grid"]')
            page.click("#step1-continue-btn")
            page.wait_for_function("document.getElementById('step-2')?.classList.contains('active')")
            assert_no_page_overflow(page, "mobile map step")
            map_box = page.locator("#step2-map-slot").bounding_box()
            assert map_box and map_box["height"] >= 320, map_box
            assert page.locator(".step2-search-wrap").bounding_box()["width"] <= 390
            page.click("#geolocation-btn")
            page.wait_for_timeout(500)
            assert page.locator("#geolocation-btn svg").count() == 1
            assert page.locator("#geolocation-btn .step2-geo-label").inner_text() == "Use My Location"
            assert page.locator(".logo-text").inner_text() == "Solar Rota"
            assert_no_page_overflow(page, "mobile after language switch")

            print("mobile brand smoke passed")
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
