import logging
from pathlib import Path
from typing import Any, Dict
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile

from backend.auth import is_dev_mode, verify_api_key
from backend.rate_limit import LIMITS, limiter
from backend.engines.engine_router import calculate_pv
from backend.engines.panel_thermal_engine import calculate_panel_thermal_sizing
from backend.engines.pvlib_engine import PVLIB_AVAILABLE
from backend.models.engine_contracts import (
    EngineRequest,
    EngineResponse,
    HealthResponse,
    PanelThermalRequest,
    PanelThermalResponse,
)
from backend.services.financial_service import calculate_financial_proposal
from backend.services.offgrid_field_import_service import analyze_field_import
from backend.services.pvgis_proxy import fetch_pvgis_via_proxy, validate_pvgis_params

logger = logging.getLogger(__name__)

# ── Public router — auth gerektirmez ────────────────────────────────────────
# Yalnızca /health endpoint'i burada; monitoring ve bağlantı denetimi için.
router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    startup = getattr(request.app.state, "startup_result", None)
    warnings = startup.messages if (startup and startup.level == "warning") else []
    return HealthResponse(
        pvlibAvailable=PVLIB_AVAILABLE,
        pvlibBackedEngineAvailable=PVLIB_AVAILABLE,
        authMode="dev-mode" if is_dev_mode() else "key-required",
        startupWarnings=warnings,
    )


# ── Protected router — tüm endpoint'ler auth gerektirir ─────────────────────
# verify_api_key: SOLARROTA_API_KEY boşsa (dev-mode) sessizce geçer,
# tanımlıysa X-Api-Key + X-Timestamp header'larını doğrular.
protected_router = APIRouter(dependencies=[Depends(verify_api_key)])


def _run_engine(handler, request: EngineRequest, label: str) -> EngineResponse:
    try:
        return handler(request)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        logger.exception("[%s] engine calculation failed", label)
        raise HTTPException(status_code=500, detail=f"{label} engine calculation failed")


@protected_router.post("/api/pv/calculate", response_model=EngineResponse)
@limiter.limit(LIMITS["pv_calculate"])
def pv_calculate(request: Request, body: EngineRequest) -> EngineResponse:
    return _run_engine(calculate_pv, body, "pv-calculate")


@protected_router.post("/api/pvlib/calculate", response_model=EngineResponse)
@limiter.limit(LIMITS["pvlib_calculate"])
def pvlib_calculate(request: Request, body: EngineRequest) -> EngineResponse:
    return _run_engine(calculate_pv, body, "pvlib-calculate")


@protected_router.post("/api/financial/proposal", response_model=EngineResponse)
@limiter.limit(LIMITS["financial"])
def financial_proposal(request: Request, body: EngineRequest) -> EngineResponse:
    return _run_engine(calculate_financial_proposal, body, "financial-proposal")


_MAX_FIELD_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB

# İzin verilen dosya uzantıları — içerik bazlı doğrulama servis katmanında yapılır.
_ALLOWED_EXTENSIONS = frozenset({".csv", ".tsv", ".txt", ".xlsx"})


def _validate_upload_extension(file: UploadFile) -> str:
    """Dosya adı varlığını ve uzantı whitelist'ini kontrol eder.

    Raises:
        HTTPException 422: Dosya adı boş.
        HTTPException 415: Uzantı whitelist dışında.

    Returns:
        Güvenli dosya adı string'i.
    """
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=422, detail="Dosya adı gereklidir.")
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(_ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=415,
            detail=(
                f"Desteklenmeyen dosya uzantısı: {suffix!r}. "
                f"İzin verilenler: {allowed}"
            ),
        )
    return filename


@protected_router.post("/api/offgrid/field-import")
@limiter.limit(LIMITS["field_import"])
async def offgrid_field_import(
    request: Request,
    kind: str = Query(..., pattern="^(load|critical-load|inverter-log)$"),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    filename = _validate_upload_extension(file)   # uzantı whitelist — içerik okunmadan
    try:
        content = await file.read(_MAX_FIELD_IMPORT_BYTES + 1)
        if len(content) > _MAX_FIELD_IMPORT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"file exceeds {_MAX_FIELD_IMPORT_BYTES // (1024 * 1024)} MB limit",
            )
        result = analyze_field_import(filename, content, kind)
        return {
            "ok": True,
            "kind": kind,
            "filename": filename,
            "summary": result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BadZipFile as exc:
        raise HTTPException(
            status_code=422,
            detail="XLSX dosyası açılamadı: ZIP yapısı bozuk veya geçersiz.",
        ) from exc


@protected_router.post("/api/panel/thermal-check", response_model=PanelThermalResponse)
@limiter.limit(LIMITS["panel_thermal"])
def panel_thermal_check(request: Request, body: PanelThermalRequest) -> PanelThermalResponse:
    try:
        result = calculate_panel_thermal_sizing(
            voc_stc=body.vocStcV,
            voc_coeff_pct_per_c=body.vocCoeffPctPerC,
            vmp_stc=body.vmpStcV,
            vmp_coeff_pct_per_c=body.vmpCoeffPctPerC,
            pmax_stc_w=body.pmaxStcW,
            pmax_coeff_pct_per_c=body.pmaxCoeffPctPerC,
            inverter_max_input_v=body.inverterMaxInputV,
            inverter_mppt_optimal_v=body.inverterMpptOptimalV,
            temperatures_c=body.temperaturesC,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PanelThermalResponse(**result)


@protected_router.get("/api/pvgis-proxy")
@limiter.limit(LIMITS["pvgis_proxy"])
async def pvgis_proxy(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    peakpower: float = Query(..., gt=0, le=10000),
    loss: float = Query(default=0.0, ge=0, le=100),
    angle: float = Query(default=30.0, ge=0, le=90),
    aspect: float = Query(default=0.0, ge=-180, le=180),
    includeHourly: bool = Query(default=False),
) -> Dict[str, Any]:
    """Backend proxy for PVGIS PVcalc API (auth korumalı)."""
    errors = validate_pvgis_params(lat, lon, peakpower, loss, angle, aspect)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    return await fetch_pvgis_via_proxy(lat, lon, peakpower, loss, angle, aspect, include_hourly=includeHourly)
