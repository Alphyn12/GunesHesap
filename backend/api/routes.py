import logging
from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

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


router = APIRouter()
logger = logging.getLogger(__name__)


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


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(pvlibAvailable=PVLIB_AVAILABLE, pvlibBackedEngineAvailable=PVLIB_AVAILABLE)


@router.post("/api/pv/calculate", response_model=EngineResponse)
def pv_calculate(request: EngineRequest) -> EngineResponse:
    return _run_engine(calculate_pv, request, "pv-calculate")


@router.post("/api/pvlib/calculate", response_model=EngineResponse)
def pvlib_calculate(request: EngineRequest) -> EngineResponse:
    return _run_engine(calculate_pv, request, "pvlib-calculate")


@router.post("/api/financial/proposal", response_model=EngineResponse)
def financial_proposal(request: EngineRequest) -> EngineResponse:
    return _run_engine(calculate_financial_proposal, request, "financial-proposal")


_MAX_FIELD_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/api/offgrid/field-import")
async def offgrid_field_import(
    kind: str = Query(..., pattern="^(load|critical-load|inverter-log)$"),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    try:
        # Read at most MAX+1 bytes; if we got more than MAX, the upload is too large.
        content = await file.read(_MAX_FIELD_IMPORT_BYTES + 1)
        if len(content) > _MAX_FIELD_IMPORT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"file exceeds {_MAX_FIELD_IMPORT_BYTES // (1024 * 1024)} MB limit",
            )
        result = analyze_field_import(file.filename or "field-import.csv", content, kind)
        return {
            "ok": True,
            "kind": kind,
            "filename": file.filename or "field-import.csv",
            "summary": result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/panel/thermal-check", response_model=PanelThermalResponse)
def panel_thermal_check(request: PanelThermalRequest) -> PanelThermalResponse:
    try:
        result = calculate_panel_thermal_sizing(
            voc_stc=request.vocStcV,
            voc_coeff_pct_per_c=request.vocCoeffPctPerC,
            vmp_stc=request.vmpStcV,
            vmp_coeff_pct_per_c=request.vmpCoeffPctPerC,
            pmax_stc_w=request.pmaxStcW,
            pmax_coeff_pct_per_c=request.pmaxCoeffPctPerC,
            inverter_max_input_v=request.inverterMaxInputV,
            inverter_mppt_optimal_v=request.inverterMpptOptimalV,
            temperatures_c=request.temperaturesC,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PanelThermalResponse(**result)


@router.get("/api/pvgis-proxy")
async def pvgis_proxy(
    lat: float = Query(..., ge=-90, le=90, description="Latitude (decimal degrees)"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude (decimal degrees)"),
    peakpower: float = Query(..., gt=0, le=10000, description="System peak power in kWp"),
    loss: float = Query(default=0.0, ge=0, le=100, description="System loss in %"),
    angle: float = Query(default=30.0, ge=0, le=90, description="Panel tilt angle in degrees"),
    aspect: float = Query(default=0.0, ge=-180, le=180, description="Azimuth offset from south in degrees"),
    includeHourly: bool = Query(default=False, description="Also fetch PVGIS seriescalc hourly PV profile"),
) -> Dict[str, Any]:
    """
    Backend proxy for PVGIS PVcalc API.
    Forwards the request to PVGIS from the server side (no CORS restrictions).
    Returns structured response with fetchStatus, rawEnergy, rawPoa, rawMonthly metadata.
    On proxy failure returns ok=false with error metadata — caller must use local PSH fallback.
    """
    errors = validate_pvgis_params(lat, lon, peakpower, loss, angle, aspect)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    result = await fetch_pvgis_via_proxy(lat, lon, peakpower, loss, angle, aspect, include_hourly=includeHourly)
    return result
