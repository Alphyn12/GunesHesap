from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright


def main():
    root = Path.cwd()

    class QuietHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, format, *args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    html_url = f"http://127.0.0.1:{server.server_port}/index.html"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(service_workers="block")
            page = context.new_page()
            page_errors = []
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            page.goto(html_url, wait_until="domcontentloaded")
            page.wait_for_function(
                """typeof window.updateTariffAssumptions === "function"
                && typeof window.renderResults === "function" """
            )

            page.eval_on_selector(
                "#display-currency",
                """el => {
                    el.value = "USD";
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                }""",
            )
            page.eval_on_selector(
                "#usd-try-input",
                """el => {
                    el.value = "40";
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                }""",
            )
            scenario_state = page.evaluate(
                """() => {
                    window.selectScenario("off-grid");
                    return {
                        key: window.state.scenarioKey,
                        batteryEnabled: window.state.batteryEnabled,
                        netMeteringEnabled: window.state.netMeteringEnabled,
                        nmDisplay: document.getElementById("nm-block").style.display,
                        summary: document.getElementById("scenario-selected-summary").innerText
                    };
                }"""
            )
            assert scenario_state["key"] == "off-grid", scenario_state
            assert scenario_state["batteryEnabled"] is True, scenario_state
            assert scenario_state["netMeteringEnabled"] is False, scenario_state
            assert scenario_state["nmDisplay"] == "none", scenario_state
            assert "Off-Grid" in scenario_state["summary"], scenario_state

            blocked_approval = page.evaluate(
                """() => {
                    document.getElementById("user-role-input").value = "approver";
                    document.getElementById("proposal-approval-state").value = "approved";
                    window.updateProposalGovernanceInput();
                    return {
                        state: window.state.proposalApproval.state,
                        hasRecord: !!window.state.proposalApproval.approvalRecord
                    };
                }"""
            )
            assert blocked_approval["state"] != "approved", blocked_approval
            assert blocked_approval["hasRecord"] is False, blocked_approval

            custom_battery = page.evaluate(
                """() => {
                    window.onBatteryToggle(true);
                    window.renderBatteryModels();
                    window.selectBatteryModel("custom");
                    document.getElementById("bat-capacity").value = "12.5";
                    document.getElementById("bat-dod").value = "85";
                    document.getElementById("bat-eff").value = "93";
                    window.updateBatteryCustom();
                    return {
                        display: document.getElementById("bat-custom-inputs").style.display,
                        model: window.state.battery.model,
                        capacity: window.state.battery.capacity,
                        dod: window.state.battery.dod,
                        efficiency: window.state.battery.efficiency
                    };
                }"""
            )
            assert custom_battery["display"] == "block", custom_battery
            assert custom_battery["model"] == "custom", custom_battery
            assert custom_battery["capacity"] == 12.5, custom_battery
            assert round(custom_battery["dod"], 2) == 0.85, custom_battery
            assert round(custom_battery["efficiency"], 2) == 0.93, custom_battery

            page.evaluate(
                """async () => {
                    Object.assign(window.state, {
                        lat: 39.9334,
                        lon: 32.8597,
                        cityName: "Ankara",
                        ghi: 4.3,
                        roofArea: 80,
                        displayCurrency: "USD",
                        usdToTry: 40
                    });
                    const roofArea = document.getElementById("roof-area");
                    if (roofArea) roofArea.value = "80";
                    window.updateTariffAssumptions();
                    const engine = await import("./js/calc-engine.js");
                    await engine.runCalculation();
                }"""
            )
            page.wait_for_function(
                """window.state.results
                && window.state.results.displayCurrency === "USD" """
            )
            page.wait_for_timeout(800)

            fin_cost = page.locator("#fin-cost").inner_text()
            fin_total = page.locator("#fin-total").inner_text()
            lcoe = page.locator("#fin-lcoe").inner_text()
            tech_table = page.locator("#tech-table-body").inner_text()

            assert "USD" in fin_cost, fin_cost
            assert "USD" in fin_total, fin_total
            assert "USD/kWh" in lcoe, lcoe
            assert "Para Birimi" in tech_table and "USD" in tech_table, tech_table

            page.evaluate("window.renderEngReport()")
            eng_report = page.locator("#eng-report-body").inner_text()
            assert "PVGIS" in eng_report, eng_report
            assert "loss=0" in eng_report, eng_report
            assert fin_cost in eng_report, eng_report

            pdf = page.evaluate(
                """() => {
                    const calls = [];
                    window.jspdf = {
                        jsPDF: function() {
                            return {
                                setFillColor() {},
                                rect() {},
                                setTextColor() {},
                                setFontSize() {},
                                setFont() {},
                                setDrawColor() {},
                                setLineWidth() {},
                                line() {},
                                addPage() {},
                                text(value) { calls.push(String(value)); },
                                splitTextToSize(value) { return String(value).split("\\n"); },
                                save(name) { window.__pdfSaved = name; }
                            };
                        }
                    };
                    window.downloadPDF();
                    const customerSaved = window.__pdfSaved;
                    window.downloadTechnicalPDF();
                    return { saved: customerSaved, technicalSaved: window.__pdfSaved, text: calls.join("\\n") };
                }"""
            )
            assert pdf["saved"].endswith(".pdf"), pdf
            assert "teknik" in pdf["technicalSaved"], pdf
            assert "Metodoloji:" in pdf["text"], pdf
            assert fin_cost in pdf["text"], pdf
            assert lcoe in pdf["text"], pdf
            assert not page_errors, page_errors

            print(f"fin_cost={fin_cost}")
            print(f"fin_total={fin_total}")
            print(f"lcoe={lcoe}")

            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
