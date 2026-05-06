APP_ROUTE = "#/app"


def calculator_url(base_url):
    return f"{base_url.rstrip('/')}/index.html{APP_ROUTE}"


def install_local_analytics_stub(page):
    page.route(
        "**/_vercel/insights/script.js",
        lambda route: route.fulfill(
            status=200,
            headers={"content-type": "application/javascript"},
            body="",
        ),
    )


def enter_calculator(page, base_url=None, wait_until="networkidle"):
    install_local_analytics_stub(page)

    if base_url is not None:
        page.goto(calculator_url(base_url), wait_until=wait_until)
    else:
        page.evaluate(
            """() => {
                if (window.startCalculator) window.startCalculator();
                else location.hash = '#/app';
            }"""
        )
        if wait_until:
            page.wait_for_load_state(wait_until)

    page.wait_for_function(
        """() =>
            document.body.dataset.route === 'app'
            && !document.body.classList.contains('landing-active')
            && Boolean(window.state)
            && typeof window.goToStep === 'function'"""
    )
    page.wait_for_selector("#app-header", state="visible")
    page.wait_for_selector("#main-content", state="visible")
