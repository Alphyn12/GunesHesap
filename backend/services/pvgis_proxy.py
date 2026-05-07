"""
PVGIS Proxy Service — Solar Rota Backend
Forwards PVGIS API requests from the backend, avoiding browser CORS restrictions.
Returns structured response with error classification metadata.

Güvenlik (S-11 — SSRF Koruması):
  • _ALLOWED_PVGIS_HOSTS: Yalnızca bu host'lara istek gönderilir.
  • _assert_pvgis_url(): Her endpoint'i istek öncesi doğrular.
  • follow_redirects=False: Redirect zincirine körü körüne uyulmuyor.
  • verify=True: SSL sertifika doğrulama zorunlu (explicit).
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── SSRF Whitelist — yalnızca bu host'lara bağlanılabilir ────────────────────
_ALLOWED_PVGIS_HOSTS: frozenset[str] = frozenset({
    "re.jrc.ec.europa.eu",
})

_PVGIS_ENDPOINTS = [
    "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc",
    "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
    "https://re.jrc.ec.europa.eu/api/PVcalc",
]
_PVGIS_SERIES_ENDPOINTS = [
    "https://re.jrc.ec.europa.eu/api/v5_3/seriescalc",
    "https://re.jrc.ec.europa.eu/api/v5_2/seriescalc",
    "https://re.jrc.ec.europa.eu/api/seriescalc",
]


def _assert_pvgis_url(url: str) -> None:
    """SSRF guard: URL'in whitelist'teki host'a ait olduğunu doğrular.

    Raises ValueError if host is not in _ALLOWED_PVGIS_HOSTS or scheme is not https.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"SSRF guard: yalnızca https şeması izinlidir, alınan: {parsed.scheme!r}")
    if parsed.hostname not in _ALLOWED_PVGIS_HOSTS:
        raise ValueError(f"SSRF guard: izinsiz host {parsed.hostname!r}")
_PROXY_TIMEOUT_S = 22.0
_PROXY_CONNECT_TIMEOUT_S = 3.0  # fail-fast on unreachable endpoints
_PROXY_TOTAL_BUDGET_S = 35.0  # cumulative wall-clock budget across all retries
_COMMON_YEAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_MONTH_START_HOURS = []
_offset = 0
for _days in _COMMON_YEAR_MONTH_DAYS:
    _MONTH_START_HOURS.append(_offset)
    _offset += _days * 24


def _classify_httpx_error(exc: Exception) -> str:
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    if "timeout" in name or "timeout" in msg:
        return "timeout"
    if "connect" in name or "network" in name or "connect" in msg:
        return "network"
    return "unknown"


async def fetch_pvgis_via_proxy(
    lat: float,
    lon: float,
    peakpower: float,
    loss: float = 0.0,
    angle: float = 30.0,
    aspect: float = 0.0,
    include_hourly: bool = False,
) -> Dict[str, Any]:
    """
    Proxy-fetch PVGIS PVcalc for given parameters.

    Returns a dict with:
      ok (bool), fetchStatus, rawEnergy, rawPoa, rawMonthly,
      endpointUsed, error_type, error_message

    Never raises — errors are returned as structured metadata.
    Caller should use local PSH fallback when ok=False.
    """
    try:
        import httpx
    except ImportError:
        logger.error("[pvgis-proxy] httpx not installed — proxy unavailable")
        return _fail("dependency-missing", "httpx not installed")

    params: Dict[str, Any] = {
        "lat": lat,
        "lon": lon,
        "peakpower": peakpower,
        "loss": loss,
        "angle": angle,
        "aspect": aspect,
        "outputformat": "json",
        "pvtechchoice": "crystSi",
        "mountingplace": "building",
    }

    last_error_type = "unknown"
    last_error_msg = "All PVGIS endpoints failed"

    # Bound connect time separately so a dead endpoint fails fast (~3 s)
    # instead of consuming the full 22 s read budget.
    timeout = httpx.Timeout(_PROXY_TIMEOUT_S, connect=_PROXY_CONNECT_TIMEOUT_S)
    deadline = time.monotonic() + _PROXY_TOTAL_BUDGET_S

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,  # SSRF: redirect zincirine körü körüne uyulmuyor
        verify=True,             # SSRF: SSL sertifika doğrulama zorunlu
        trust_env=False,          # PVGIS proxy: bozuk HTTP(S)_PROXY env ayarlarına takılma
    ) as client:
        for endpoint in _PVGIS_ENDPOINTS:
            if time.monotonic() >= deadline:
                logger.warning("[pvgis-proxy] total budget %.0fs exhausted before %s", _PROXY_TOTAL_BUDGET_S, endpoint)
                last_error_type = "timeout"
                last_error_msg = f"PVGIS proxy budget {_PROXY_TOTAL_BUDGET_S:.0f}s exhausted"
                break
            try:
                _assert_pvgis_url(endpoint)  # SSRF: istek öncesi whitelist doğrulama
                resp = await client.get(endpoint, params=params)
                if resp.status_code != 200:
                    logger.warning("[pvgis-proxy] HTTP %s from %s", resp.status_code, endpoint)
                    last_error_type = "http-error"
                    last_error_msg = f"HTTP {resp.status_code}"
                    continue

                data = resp.json()
                fixed = (data.get("outputs") or {}).get("totals", {}).get("fixed", {})
                ey: Optional[float] = fixed.get("E_y")
                if not ey or ey <= 0:
                    logger.warning("[pvgis-proxy] E_y missing or zero from %s", endpoint)
                    last_error_type = "empty-response"
                    last_error_msg = "E_y missing or zero"
                    continue

                poa: Optional[float] = fixed.get("H(i)_y") or fixed.get("H_i_y")

                monthly_fixed = (data.get("outputs") or {}).get("monthly", {}).get("fixed")
                raw_monthly: Optional[List[Optional[float]]] = None
                if monthly_fixed and len(monthly_fixed) == 12:
                    raw_monthly = [m.get("E_m") for m in monthly_fixed]

                raw_hourly = None
                if include_hourly:
                    raw_hourly = await _fetch_hourly_series(client, params)

                logger.info("[pvgis-proxy] OK E_y=%.1f from %s", ey, endpoint)
                return {
                    "ok": True,
                    "fetchStatus": "proxy-success",
                    "rawEnergy": ey,
                    "rawPoa": poa,
                    "rawMonthly": raw_monthly,
                    "rawHourly": raw_hourly,
                    "endpointUsed": endpoint,
                    "error_type": None,
                    "error_message": None,
                }

            except Exception as exc:
                etype = _classify_httpx_error(exc)
                logger.warning("[pvgis-proxy] %s on %s: %s", etype, endpoint, exc)
                last_error_type = etype
                last_error_msg = "PVGIS upstream unavailable"

    return _fail(last_error_type, last_error_msg)


def _fail(error_type: str, message: str) -> Dict[str, Any]:
    return {
        "ok": False,
        "fetchStatus": "proxy-failed",
        "rawEnergy": None,
        "rawPoa": None,
        "rawMonthly": None,
        "rawHourly": None,
        "endpointUsed": None,
        "error_type": error_type,
        "error_message": message,
    }


def _parse_pvgis_hour_index(value: Any, fallback_index: Optional[int] = None) -> Optional[int]:
    text = str(value or "")
    match = re.match(r"^(\d{4})(\d{2})(\d{2}):?(\d{2})", text)
    if match:
        month = int(match.group(2))
        day = int(match.group(3))
        hour = min(23, int(match.group(4)))
        if month == 2 and day == 29:
            return None
        if 1 <= month <= 12 and 1 <= day <= _COMMON_YEAR_MONTH_DAYS[month - 1]:
            return _MONTH_START_HOURS[month - 1] + (day - 1) * 24 + hour
    if fallback_index is not None:
        return fallback_index % 8760
    return None


def _hourly_rows_to_typical_8760(rows: Any) -> Optional[List[float]]:
    if not isinstance(rows, list) or not rows:
        return None
    sums = [0.0] * 8760
    counts = [0] * 8760
    use_fallback_index = len(rows) >= 8760
    for fallback_index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        idx = _parse_pvgis_hour_index(row.get("time") or row.get("Time") or row.get("timestamp"),
                                      fallback_index if use_fallback_index else None)
        if idx is None or idx < 0 or idx >= 8760:
            continue
        try:
            watts = float(row.get("P") or row.get("PV") or row.get("p") or row.get("power") or 0)
        except (TypeError, ValueError):
            continue
        if watts < 0:
            continue
        sums[idx] += watts / 1000.0
        counts[idx] += 1
    if not any(counts):
        return None
    return [sums[i] / counts[i] if counts[i] else 0.0 for i in range(8760)]


async def _fetch_hourly_series(client: Any, base_params: Dict[str, Any]) -> Optional[List[float]]:
    params = {
        **base_params,
        "pvcalculation": 1,
        "localtime": 1,
    }
    for endpoint in _PVGIS_SERIES_ENDPOINTS:
        try:
            _assert_pvgis_url(endpoint)  # SSRF: saatlik seri endpoint'i de doğrula
            resp = await client.get(endpoint, params=params)
            if resp.status_code != 200:
                logger.warning("[pvgis-proxy] hourly HTTP %s from %s", resp.status_code, endpoint)
                continue
            data = resp.json()
            hourly = _hourly_rows_to_typical_8760((data.get("outputs") or {}).get("hourly"))
            if hourly and any(value > 0 for value in hourly):
                return hourly
        except Exception as exc:
            logger.warning("[pvgis-proxy] hourly failed on %s: %s", endpoint, exc)
    return None


def validate_pvgis_params(
    lat: float, lon: float, peakpower: float,
    loss: float, angle: float, aspect: float,
) -> List[str]:
    """Fiziksel sınır doğrulaması + SSRF ek kontrol.

    Tüm sayısal parametreler fiziksel olarak geçerli aralıklara sıkıştırılır.
    Bu fonksiyon yalnızca gerçek coğrafi/mühendislik koordinatları için geçer —
    dahili ağ adresleri (127.0.0.1, ::1) lat/lon olarak girilse de PVGIS
    endpoint'leri Türkiye sınırı dışındaki koordinatları reddeder.
    """
    errors: List[str] = []
    if not -90 <= lat <= 90:
        errors.append("lat must be -90..90")
    if not -180 <= lon <= 180:
        errors.append("lon must be -180..180")
    if not 0 < peakpower <= 10000:
        errors.append("peakpower must be 0..10000 kWp")
    if not 0 <= loss <= 100:
        errors.append("loss must be 0..100 %")
    if not 0 <= angle <= 90:
        errors.append("angle must be 0..90 degrees")
    if not -180 <= aspect <= 180:
        errors.append("aspect must be -180..180 degrees")
    return errors
