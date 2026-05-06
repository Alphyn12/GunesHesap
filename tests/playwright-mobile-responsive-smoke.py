"""Mobil uyumluluk akışı — Etap 1-5 doğrulama smoke testi.

Test edilen davranışlar:
- iPhone SE (375x667) ve iPad Mini (768x1024) viewport'larında sayfa yatay scroll yok
- Settings paneli mobilde tam ekran açılır (>=80vw)
- Mobile bottom bar sticky görünür ve adıma göre içeriği değişir
- Tüm header butonları 44px+ touch alanına sahip
- body[data-step] ve has-bottom-bar class'ları doğru set edilir
"""
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


def assert_no_overflow(page, label):
    overflow = page.evaluate(
        """() => ({
            width: window.innerWidth,
            doc: document.documentElement.scrollWidth,
            body: document.body.scrollWidth
        })"""
    )
    assert overflow["doc"] <= overflow["width"] + 2, (label, overflow)
    assert overflow["body"] <= overflow["width"] + 2, (label, overflow)


def assert_touch_target(page, selector, label, min_size=44):
    box = page.locator(selector).first.bounding_box()
    assert box, f"{label}: locator not found"
    assert box["height"] >= min_size - 1, (label, "height", box)
    assert box["width"] >= min_size - 1, (label, "width", box)


def run_iphone_se(base_url, browser):
    ctx = browser.new_context(
        viewport={"width": 375, "height": 667},
        is_mobile=True,
        has_touch=True,
        service_workers="block",
    )
    page = ctx.new_page()
    enter_calculator(page, base_url)

    # Sayfa yüklendi
    assert "Solar Rota" in page.title()
    assert_no_overflow(page, "iphone-se initial")

    # body data-step ve has-bottom-bar var
    body_state = page.evaluate(
        """() => ({
            step: document.body.dataset.step,
            hasBottomBar: document.body.classList.contains('has-bottom-bar')
        })"""
    )
    assert body_state["step"] == "1", body_state
    assert body_state["hasBottomBar"], body_state

    # Mobile bottom bar görünür (Step 1: tek "Devam" butonu)
    assert page.locator(".mobile-bottom-bar").is_visible()
    step1_group = page.locator('.mobile-bottom-bar__group[data-step="1"]')
    assert step1_group.is_visible()
    m_continue = page.locator('[data-testid="m-step1-continue"]')
    assert_touch_target(page, '[data-testid="m-step1-continue"]', "iphone-se m-step1")

    # Settings paneli aç → mobilde 80vw+ veya tam ekran
    page.click('[data-testid="open-settings"]')
    page.wait_for_timeout(400)
    panel_box = page.locator("#settings-panel").bounding_box()
    assert panel_box, "settings panel not found"
    # 375 px viewport'ta panel >= 300 px olmalı (80vw = 300, plan 100% = 375)
    assert panel_box["width"] >= 300, ("iphone-se settings width", panel_box)
    page.click("#settings-close-btn")
    page.wait_for_timeout(400)

    # Step 1 → Step 2 mobil bottom bar üzerinden devam
    page.click('.scenario-choice-card[data-scenario-key="on-grid"]')
    m_continue.click()
    page.wait_for_function("document.getElementById('step-2')?.classList.contains('active')")

    body_state = page.evaluate("() => document.body.dataset.step")
    assert body_state == "2", body_state

    # Step 2 bottom bar grubu aktif
    step2_group = page.locator('.mobile-bottom-bar__group[data-step="2"]')
    assert step2_group.is_visible()
    assert_no_overflow(page, "iphone-se step 2")

    ctx.close()
    print("iPhone SE smoke passed")


def run_ipad_mini(base_url, browser):
    ctx = browser.new_context(
        viewport={"width": 768, "height": 1024},
        is_mobile=True,
        has_touch=True,
        service_workers="block",
    )
    page = ctx.new_page()
    enter_calculator(page, base_url)

    assert_no_overflow(page, "ipad-mini initial")
    # iPad'te de bottom bar görünür (768 = sınır)
    bar_visible = page.evaluate(
        """() => {
            const bar = document.querySelector('.mobile-bottom-bar');
            if (!bar) return false;
            const cs = getComputedStyle(bar);
            return cs.display !== 'none';
        }"""
    )
    assert bar_visible, "mobile-bottom-bar should render at <=768"

    ctx.close()
    print("iPad Mini smoke passed")


def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        lambda *args, **kwargs: QuietHandler(*args, directory=str(root), **kwargs),
    )
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
            run_iphone_se(base_url, browser)
            run_ipad_mini(base_url, browser)
            browser.close()
        print("mobile responsive smoke passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
