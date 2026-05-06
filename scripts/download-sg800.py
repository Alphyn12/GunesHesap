"""Space Grotesk 800 weight woff2 dosyasini indir."""
import re, urllib.request, os, sys

FONTS_CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Space+Grotesk:wght@800&display=swap"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

req = urllib.request.Request(FONTS_CSS_URL, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    css = r.read().decode("utf-8")

face_re = re.compile(r"@font-face\s*\{([^}]+)\}", re.DOTALL)
url_re  = re.compile(r"url\(([^)]+)\)")

FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts")

for m in face_re.finditer(css):
    block = m.group(1)
    url_m = url_re.search(block)
    if not url_m:
        continue
    src_url = url_m.group(1).strip().strip("'\"")
    filename = "SpaceGrotesk-800.woff2"
    local_path = os.path.join(FONT_DIR, filename)
    req2 = urllib.request.Request(src_url, headers=HEADERS)
    with urllib.request.urlopen(req2, timeout=30) as r2:
        data = r2.read()
    with open(local_path, "wb") as f:
        f.write(data)
    sys.stdout.write(f"OK {filename} ({len(data)//1024} KB)\n")
    break
