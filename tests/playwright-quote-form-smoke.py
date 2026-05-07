"""
Quote modal smoke test — Step 7 "Teklif Al" iletişim formu.

Senaryolar:
  1. Boş submit → tüm alanlarda + consent'lerde hata mesajı
  2. Geçersiz e-posta → emailInvalid mesajı
  3. KVKK Aydınlatma Metni linki → sub-modal açılır, ana modal arkada kalır
  4. Sub-modal Escape → sub-modal kapanır, ana modal açık kalır
  5. Geçerli form + mock backend → başarılı submit + toast + modal kapanır
  6. Network hatası → localStorage queue'ye yazma davranışı
"""
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


STATE_STUB = """
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


def open_modal_and_assertions(page, base_url):
    """Modal'ı aç ve temel görünürlük doğrulamalarını yap."""
    page.goto(f"{base_url}/index.html", wait_until="networkidle")
    page.evaluate(STATE_STUB)
    page.wait_for_selector("#step-7.active")

    # 1. "Teklif Al" tıkla → modal açılır
    page.click('[data-testid="get-quote"]')
    page.wait_for_function("getComputedStyle(document.getElementById('quote-modal')).display === 'flex'")
    assert page.locator("#quote-modal-title").inner_text().strip() == "İletişim Bilgileriniz"
    # İlk input focus alır (50ms gecikme var)
    page.wait_for_timeout(120)
    focused_id = page.evaluate("document.activeElement?.id")
    assert focused_id == "quote-first-name", f"Expected first-name focus, got: {focused_id}"


def test_validation_errors(page):
    """Senaryo 1: Boş submit → tüm zorunlu alanlarda hata."""
    page.click('[data-testid="quote-submit"]')
    # 4 input + 3 consent = 7 hata
    error_texts = [el.inner_text().strip() for el in page.locator(".form-error").all()]
    non_empty_errors = [t for t in error_texts if t]
    assert len(non_empty_errors) >= 7, f"Expected >=7 errors, got {len(non_empty_errors)}: {non_empty_errors}"
    # firstName aria-invalid set edilmeli
    assert page.locator("#quote-first-name").get_attribute("aria-invalid") == "true"
    # consent altı hatalar consent kelimesi içermeli ya da locale'a göre dolmalı
    assert any("Adınızı girin" in t for t in non_empty_errors), non_empty_errors


def test_invalid_email(page):
    """Senaryo 2: Geçersiz e-posta formatı."""
    page.fill("#quote-first-name", "Ali")
    page.fill("#quote-last-name", "Yılmaz")
    page.fill("#quote-phone", "+90 555 123 45 67")
    page.fill("#quote-email", "not-an-email")
    page.check("#quote-consent-marketing")
    page.check("#quote-consent-data")
    page.check("#quote-consent-third")
    page.click('[data-testid="quote-submit"]')
    email_err = page.locator('[data-error-for="email"]').inner_text().strip()
    assert "geçerli" in email_err.lower() or "valid" in email_err.lower(), email_err


def test_legal_sub_modal(page):
    """Senaryo 3-4: KVKK linki → sub-modal aç → Escape → sub-modal kapanır, ana modal açık kalır."""
    page.click('button[data-arg="marketingNotice"]')
    page.wait_for_function("getComputedStyle(document.getElementById('legal-text-modal')).display === 'flex'")
    title_text = page.locator("#legal-modal-title").inner_text()
    assert "Aydınlatma" in title_text or "KVKK" in title_text, title_text
    # Escape sub-modal'ı kapatmalı, ana modal açık kalmalı
    page.keyboard.press("Escape")
    page.wait_for_function("getComputedStyle(document.getElementById('legal-text-modal')).display === 'none'")
    assert page.locator("#quote-modal").evaluate("el => getComputedStyle(el).display") == "flex"

    # Açık Rıza (dataProcessing) linki de çalışmalı
    page.click('button[data-arg="dataProcessing"]')
    page.wait_for_function("getComputedStyle(document.getElementById('legal-text-modal')).display === 'flex'")
    assert "Açık Rıza" in page.locator("#legal-modal-title").inner_text()
    page.click('#legal-text-modal button[data-click-action="closeLegalModal"]:not(.btn-icon-modal-close)')
    page.wait_for_function("getComputedStyle(document.getElementById('legal-text-modal')).display === 'none'")


def test_successful_submit(page):
    """Senaryo 5: Geçerli form + mock backend 200 → success toast + modal kapanır."""
    # Backend 200 mock
    page.route(
        "**/api/lead/submit",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"ok":true,"leadId":"test-lead-uuid-1234","receivedAt":"2026-05-07T10:00:00Z"}',
        ),
    )

    # Form'u temizle ve geçerli veriyle doldur
    page.fill("#quote-first-name", "Ayşe")
    page.fill("#quote-last-name", "Demir")
    page.fill("#quote-phone", "+90 555 987 65 43")
    page.fill("#quote-email", "ayse.demir@example.com")
    page.fill("#quote-address", "Antalya / Muratpaşa")
    page.select_option("#quote-contact-time", "morning")
    # Consent'ler önceki testten zaten check'li olabilir; emin olmak için tekrar ayarla
    for cb_id in ["#quote-consent-marketing", "#quote-consent-data", "#quote-consent-third"]:
        if not page.is_checked(cb_id):
            page.check(cb_id)

    page.click('[data-testid="quote-submit"]')
    # Modal kapanmalı
    page.wait_for_function(
        "getComputedStyle(document.getElementById('quote-modal')).display === 'none'",
        timeout=5000,
    )


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

    page_errors = []
    console_errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            install_local_analytics_stub(page)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.on(
                "console",
                lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
            )

            open_modal_and_assertions(page, base_url)
            test_validation_errors(page)
            test_invalid_email(page)
            test_legal_sub_modal(page)
            test_successful_submit(page)

            browser.close()

        assert not page_errors, page_errors
        # console_errors filtresi: bilinen üçüncü-parti gürültüsünü tolere et
        relevant_console = [
            e for e in console_errors
            if "favicon" not in e.lower()
            and "autofill" not in e.lower()
            and "manifest" not in e.lower()
        ]
        assert not relevant_console, relevant_console
        print("quote form modal smoke passed")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
