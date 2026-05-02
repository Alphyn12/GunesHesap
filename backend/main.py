import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router


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


app = FastAPI(
    title="Solar Rota Engineering Backend",
    version="0.1.0",
    description="Local-first Python calculation service for pvlib-ready solar proposal workflows.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=_CORS_ORIGIN_REGEX or None,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)
