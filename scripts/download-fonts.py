"""Google Fonts woff2 dosyalarini indir."""
import re, urllib.request, os, sys

FONTS_CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Inter:wght@400;500;600;700"
    "&family=Space+Grotesk:wght@400;500;600;700;800"
    "&display=swap"
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

face_re   = re.compile(r"@font-face\s*\{([^}]+)\}", re.DOTALL)
url_re    = re.compile(r"url\(([^)]+)\)")
fam_re    = re.compile(r"font-family:\s*'([^']+)'")
wgt_re    = re.compile(r"font-weight:\s*(\d+)")
uni_re    = re.compile(r"unicode-range:\s*(.+)")

FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts")
os.makedirs(FONT_DIR, exist_ok=True)

seen = set()
downloaded = 0

for m in face_re.finditer(css):
    block = m.group(1)
    url_m = url_re.search(block)
    fam_m = fam_re.search(block)
    wgt_m = wgt_re.search(block)
    uni_m = uni_re.search(block)

    if not (url_m and fam_m and wgt_m):
        continue

    unicode_range = uni_m.group(1).strip() if uni_m else ""

    # Sadece latin ve latin-ext subsetlerini al (diger script bloklarini atla)
    if unicode_range:
        latin_ranges = ["U+0000", "U+0100", "U+0102", "U+0131"]
        if not any(lr in unicode_range for lr in latin_ranges):
            continue

    src_url = url_m.group(1).strip().strip("'\"")
    family  = fam_m.group(1)
    weight  = wgt_m.group(1)
    slug    = family.replace(" ", "")
    filename = f"{slug}-{weight}.woff2"

    if filename in seen:
        continue
    seen.add(filename)

    local_path = os.path.join(FONT_DIR, filename)
    if not os.path.exists(local_path):
        req2 = urllib.request.Request(src_url, headers=HEADERS)
        with urllib.request.urlopen(req2, timeout=30) as r2:
            data = r2.read()
        with open(local_path, "wb") as f:
            f.write(data)
        downloaded += 1
        sys.stdout.write(f"OK {filename} ({len(data)//1024} KB)\n")
        sys.stdout.flush()
    else:
        sys.stdout.write(f"SKIP {filename}\n")
        sys.stdout.flush()

sys.stdout.write(f"DONE downloaded={downloaded} total={len(seen)}\n")
