import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.v1 import api_router
from app.core.config import settings

UPLOADS_DIR = "/app/uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ── Rate limiter — klucz: IP klienta ─────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="ADHD Calendar API",
    version="1.0.0",
    description="Time management app with weekly calendar and Eisenhower matrix",
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Serwuje uploadowane zdjęcia jako pliki statyczne
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# ── Security headers middleware ───────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    # Zapobiega osadzaniu w iframe (clickjacking)
    response.headers["X-Frame-Options"] = "DENY"
    # Wyłącza MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Wyłącza wbudowany XSS filter (zastąpiony przez CSP)
    response.headers["X-XSS-Protection"] = "0"
    # Kontroluje jakie info o refererze jest wysyłane
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # CSP — API nie serwuje HTML, ale header i tak warto mieć
    response.headers["Content-Security-Policy"] = "default-src 'none'"
    # HSTS — po wdrożeniu za HTTPS (Caddy ustawi to samo, ale dobrze mieć też tu)
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    # Ukryj wersję serwera
    if "server" in response.headers:
        del response.headers["server"]
    return response


@app.get("/health")
def health():
    return {"status": "ok"}
