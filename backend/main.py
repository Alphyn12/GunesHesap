import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.api.routes import protected_router, router


# ── CORS yapılandırması ──────────────────────────────────────────────────────
_DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:8123,"
    "http://127.0.0.1:8124,"
    "http://127.0.0.1:3000,"
    "http://localhost:3000"
)
_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
_CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", r"^http://(127\.0\.0\.1|localhost):\d+$")

# ── Güvenlik Header Middleware (HSTS + nosniff) ──────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        # HSTS: 1 yıl, subdomainleri dahil et
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


app = FastAPI(
    title="Solar Rota Engineering Backend",
    version="0.1.0",
    description="Local-first Python calculation service for pvlib-ready solar proposal workflows.",
)

# Middleware sırası önemli: CORS önce, güvenlik header'ları sonra
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=_CORS_ORIGIN_REGEX or None,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    # Güvenlik düzeltmesi (S-08): ["*"] → explicit whitelist
    # x-api-key ve x-timestamp auth header'ları için eklendi
    allow_headers=[
        "content-type",
        "accept",
        "x-api-key",
        "x-timestamp",
    ],
)

app.add_middleware(SecurityHeadersMiddleware)

# ── Router kayıt ─────────────────────────────────────────────────────────────
# Public: /health  — auth yok (monitoring, bağlantı denetimi)
app.include_router(router)

# Protected: /api/* — verify_api_key bağımlılığı router seviyesinde
app.include_router(protected_router)
