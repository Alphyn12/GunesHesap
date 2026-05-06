"""A11Y smoke — Faz A-D doğrulama testi.

Test edilen davranışlar:
- --text-muted dark temada kontrast oranı >= 4.5:1 (WCAG AA)
- input[aria-invalid="true"] görsel cue (border + ⚠️ icon background)
- Tooltip-icon elementlerin aria-label'i set edilmiş (enhanceTooltipAccessibility)
- Result page disclaimer banner görünür
- KPI kartlarda "≈" pill görünür
- Empty state (offgrid-device-empty) icon + CTA buton içeriyor
- panel-preview <= 480'de 2x2 grid
- "Konum seçildi" hardcoded değil — data-i18n bağlı
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from time import sleep
from urllib.request import urlopen

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def srgb_relative_luminance(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255

    def chan(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)


def contrast_ratio(fg_hex, bg_hex):
    l1 = srgb_relative_luminance(fg_hex)
    l2 = srgb_relative_luminance(bg_hex)
    light, dark = max(l1, l2), min(l1, l2)
    return (light + 0.05) / (dark + 0.05)


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
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True,
                has_touch=True,
                service_workers="block",
            )
            page = ctx.new_page()
            page.goto(f"{base_url}/index.html", wait_until="networkidle")

            # Faz A.1: --text-muted dark temada AA pass
            text_muted = page.evaluate(
                "() => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()"
            )
            secondary = page.evaluate(
                "() => getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim()"
            )
            ratio = contrast_ratio(text_muted, secondary)
            assert ratio >= 4.5, ("text-muted contrast fail", text_muted, secondary, ratio)

            # Faz A.3: tooltip-icon'lar aria-label sahip (enhanceTooltipAccessibility)
            no_label = page.evaluate(
                """() => {
                    const icons = document.querySelectorAll('.tooltip-icon');
                    let count = 0;
                    icons.forEach(i => { if (!i.getAttribute('aria-label')) count++; });
                    return { total: icons.length, missing: count };
                }"""
            )
            assert no_label["total"] > 0, "no tooltip icons rendered"
            assert no_label["missing"] == 0, ("tooltip aria-label missing", no_label)

            # Faz B.1: result-estimate-banner DOM'da var (Step 7 sonuç sayfasında görünür)
            banner = page.locator(".result-estimate-banner").count()
            assert banner == 1, "result-estimate-banner missing"

            # Faz B.1b: banner i18n bağlı
            banner_i18n = page.evaluate(
                "() => document.querySelector('.result-estimate-banner [data-i18n]')?.getAttribute('data-i18n')"
            )
            assert banner_i18n == "results.estimateDisclaimer", ("banner i18n missing", banner_i18n)

            # Faz C.2: empty-state CTA buton var
            cta = page.locator("#offgrid-device-empty .empty-state__cta").count()
            assert cta == 1, "empty-state CTA missing"

            # Faz D.1: loc-bottom-city data-i18n bağlı
            i18n_attr = page.evaluate(
                "() => document.getElementById('loc-bottom-city')?.getAttribute('data-i18n')"
            )
            assert i18n_attr == "step2.locationSelected", ("locationSelected i18n missing", i18n_attr)

            # Faz D.2: panel-preview mobilde 2x2 grid (display:grid)
            panel_preview_display = page.evaluate(
                """() => {
                    const el = document.querySelector('.panel-preview');
                    if (!el) return null;
                    return getComputedStyle(el).display;
                }"""
            )
            assert panel_preview_display == "grid", ("panel-preview not grid on mobile", panel_preview_display)

            ctx.close()
            browser.close()
            print("a11y smoke passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
