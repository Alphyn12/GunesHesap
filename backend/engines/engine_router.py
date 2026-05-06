from backend.engines.production_router import calculate_backend_production
from backend.engines.offgrid_engine import build_backend_offgrid_results
from backend.models.engine_contracts import EngineRequest, EngineResponse
from backend.services.financial_service import build_financial_payload


def calculate_pv(request: EngineRequest) -> EngineResponse:
    production_payload = calculate_backend_production(request)
    offgrid_results = build_backend_offgrid_results(request, production_payload["production"])
    financial_payload = build_financial_payload(request, production_payload["production"], offgrid_results)
    scenario = request.scenario.model_dump() if hasattr(request.scenario, "model_dump") else request.scenario.dict()
    return EngineResponse(
        engineSource=production_payload["engineSource"],
        production=production_payload["production"],
        losses=production_payload["losses"],
        financial=financial_payload["financial"],
        proposal=financial_payload["proposal"],
        offgridL2Results=offgrid_results,
        raw={
            **production_payload.get("raw", {}),
            "requestSchema": request.schema_,
            "scenario": scenario,
            "offgridDispatchAvailable": bool(offgrid_results),
        },
    )
