"""
File upload MIME validation testleri — Solar Rota Backend

Kapsam:
  - Uzantı whitelist (415 Unsupported Media Type)
  - Magic byte doğrulama (422 Unprocessable Entity)
  - ZIP bomb koruması (422)
  - Bozuk XLSX (422)
  - Binary metin girişimi (422)
  - Geçerli CSV / TSV / TXT / XLSX (200)
  - Dosya adı boş (422)
"""
from __future__ import annotations

import io
import struct
import zipfile

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

BASE_URL = "/api/offgrid/field-import?kind=load"
INV_URL  = "/api/offgrid/field-import?kind=inverter-log"

# ── Test içerikleri ───────────────────────────────────────────────────────────

_VALID_CSV = b"timestamp,power_kw\n2026-01-01 00:00,1.5\n2026-01-01 00:01,2.3\n"
_VALID_TSV = b"timestamp\tpower_kw\n2026-01-01 00:00\t1.5\n2026-01-01 00:01\t2.3\n"
_VALID_TXT = _VALID_CSV   # aynı içerik, farklı uzantı

_VALID_INV_CSV = (
    b"timestamp,severity,code,message\n"
    b"2026-01-01 12:00,alarm,OVR-1,Overload trip\n"
    b"2026-01-01 12:05,error,FLT-9,Generic fault\n"
)

# Gerçek (minimal) geçerli XLSX oluştur — ZipFile ile in-memory
def _make_valid_xlsx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Minimal OOXML yapısı — parse_xlsx_rows bunları okur
        zf.writestr("[Content_Types].xml", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '</Types>'
        ))
        zf.writestr("_rels/.rels", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        ))
        zf.writestr("xl/workbook.xml", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
            '</workbook>'
        ))
        zf.writestr("xl/_rels/workbook.xml.rels", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '</Relationships>'
        ))
        zf.writestr("xl/worksheets/sheet1.xml", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetData>'
            '<row r="1"><c r="A1" t="inlineStr"><is><t>timestamp</t></is></c>'
            '<c r="B1" t="inlineStr"><is><t>power_kw</t></is></c></row>'
            '<row r="2"><c r="A2" t="inlineStr"><is><t>2026-01-01 00:00</t></is></c>'
            '<c r="B2"><v>1.5</v></c></row>'
            '<row r="3"><c r="A3" t="inlineStr"><is><t>2026-01-01 00:01</t></is></c>'
            '<c r="B3"><v>2.3</v></c></row>'
            '<row r="4"><c r="A4" t="inlineStr"><is><t>2026-01-01 00:02</t></is></c>'
            '<c r="B4"><v>1.8</v></c></row>'
            '</sheetData>'
            '</worksheet>'
        ))
    return buf.getvalue()


def _make_zip_bomb_xlsx(uncompressed_mb: int = 60) -> bytes:
    """Sıkıştırılmamış boyutu limit üstünde olan XLSX (ZIP bomb simülasyonu)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Tekrarlayan veri — yüksek sıkıştırma oranı
        large_content = b"A" * (uncompressed_mb * 1024 * 1024)
        zf.writestr("xl/worksheets/sheet1.xml", large_content)
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("_rels/.rels", "<Relationships/>")
        zf.writestr("xl/workbook.xml", "<workbook/>")
        zf.writestr("xl/_rels/workbook.xml.rels", "<Relationships/>")
    return buf.getvalue()


def _make_corrupt_xlsx() -> bytes:
    """ZIP magic byte ile başlayan ama içi bozuk dosya."""
    return b"PK\x03\x04" + b"\xff\xfe\xfd" * 100


def _make_binary_content() -> bytes:
    """UTF-8 decode edilemeyen binary içerik."""
    return bytes(range(256)) * 8


def _post_file(url: str, filename: str, content: bytes, content_type: str = "application/octet-stream"):
    return client.post(url, files={"file": (filename, content, content_type)})


# ── Geçerli yüklemeler — 200 beklenir ────────────────────────────────────────

class TestValidUploads:

    def test_valid_csv_returns_200(self):
        r = _post_file(BASE_URL, "load.csv", _VALID_CSV, "text/csv")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_valid_tsv_returns_200(self):
        r = _post_file(BASE_URL, "load.tsv", _VALID_TSV, "text/tab-separated-values")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_valid_txt_returns_200(self):
        r = _post_file(BASE_URL, "load.txt", _VALID_TXT, "text/plain")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_valid_xlsx_returns_200(self):
        xlsx = _make_valid_xlsx()
        r = _post_file(
            BASE_URL, "load.xlsx", xlsx,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_valid_inverter_log_csv_returns_200(self):
        r = _post_file(INV_URL, "inv-log.csv", _VALID_INV_CSV, "text/csv")
        assert r.status_code == 200
        assert r.json()["summary"]["eventCount"] == 2


# ── Uzantı whitelist — 415 beklenir ──────────────────────────────────────────

class TestExtensionWhitelist:

    @pytest.mark.parametrize("filename", [
        "evil.exe", "data.pdf", "image.jpg", "archive.zip",
        "script.js", "data.json", "sheet.ods", "doc.docx",
    ])
    def test_disallowed_extension_returns_415(self, filename: str):
        r = _post_file(BASE_URL, filename, _VALID_CSV)
        assert r.status_code == 415, f"{filename} için 415 beklendi, {r.status_code} geldi"
        body = r.json()
        assert "detail" in body
        assert "İzin verilenler" in body["detail"]

    def test_415_detail_lists_allowed_extensions(self):
        r = _post_file(BASE_URL, "bad.pdf", _VALID_CSV)
        assert r.status_code == 415
        detail = r.json()["detail"]
        for ext in (".csv", ".tsv", ".txt", ".xlsx"):
            assert ext in detail

    def test_empty_filename_returns_422(self):
        """Dosya adı boş string → 422."""
        r = _post_file(BASE_URL, "", _VALID_CSV)
        assert r.status_code == 422

    def test_uppercase_extension_rejected(self):
        """Uzantı büyük/küçük harf duyarsız kontrol edilmeli."""
        r = _post_file(BASE_URL, "data.EXE", _VALID_CSV)
        assert r.status_code == 415

    def test_mixed_case_csv_accepted(self):
        """.CSV uzantısı (büyük harf) kabul edilmeli."""
        r = _post_file(BASE_URL, "load.CSV", _VALID_CSV, "text/csv")
        assert r.status_code == 200


# ── Magic byte doğrulama — 422 beklenir ──────────────────────────────────────

class TestMagicByteValidation:

    def test_xlsx_extension_with_csv_content_returns_422(self):
        """.xlsx uzantılı ama CSV içerikli dosya reddedilmeli."""
        r = _post_file(BASE_URL, "trap.xlsx", _VALID_CSV, "text/csv")
        assert r.status_code == 422
        assert "ZIP/OOXML imzası" in r.json()["detail"]

    def test_xlsx_extension_with_pdf_magic_returns_422(self):
        """.xlsx uzantılı ama PDF magic byte'lı dosya reddedilmeli."""
        pdf_like = b"%PDF-1.4 fake pdf content"
        r = _post_file(BASE_URL, "trap.xlsx", pdf_like)
        assert r.status_code == 422

    def test_csv_extension_with_binary_content_returns_422(self):
        """.csv uzantılı ama binary (non-UTF-8) içerik reddedilmeli."""
        r = _post_file(BASE_URL, "binary.csv", _make_binary_content())
        assert r.status_code == 422
        assert "UTF-8" in r.json()["detail"]

    def test_txt_extension_with_binary_content_returns_422(self):
        """.txt uzantılı binary içerik reddedilmeli."""
        r = _post_file(BASE_URL, "binary.txt", _make_binary_content())
        assert r.status_code == 422

    def test_corrupt_xlsx_returns_422(self):
        """ZIP magic byte var ama içi bozuk XLSX → 422."""
        r = _post_file(BASE_URL, "corrupt.xlsx", _make_corrupt_xlsx())
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert "bozuk" in detail or "açılamadı" in detail


# ── ZIP bomb koruması — 422 beklenir ─────────────────────────────────────────

class TestZipBombProtection:

    def test_zip_bomb_xlsx_returns_422(self):
        """Sıkıştırılmamış boyutu 50 MB sınırını aşan XLSX → 422."""
        bomb = _make_zip_bomb_xlsx(uncompressed_mb=60)
        r = _post_file(BASE_URL, "bomb.xlsx", bomb)
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert "sınırını aşıyor" in detail or "50" in detail

    def test_normal_size_xlsx_not_flagged_as_bomb(self):
        """Normal boyutlu XLSX ZIP bomb olarak işaretlenmemeli."""
        xlsx = _make_valid_xlsx()
        r = _post_file(BASE_URL, "normal.xlsx", xlsx)
        # 200 veya parse hatası (eksik kolon) alınabilir; 422 ZIP bomb mesajı gelmemeli
        if r.status_code == 422:
            assert "sınırını aşıyor" not in r.json().get("detail", "")
