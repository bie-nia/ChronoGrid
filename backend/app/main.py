import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.v1 import api_router
from app.core.config import settings
from app.core.demo_seed import reset_demo_data
from app.db.base import get_db

UPLOADS_DIR = "/app/uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ── Limity ────────────────────────────────────────────────────────────────────
# Globalny limit rozmiaru ciała żądania — zapobiega zapełnieniu RAM
MAX_BODY_SIZE = 11 * 1024 * 1024  # 11 MB (nieco powyżej max zdjęcia 10 MB)

# ── Rate limiter — klucz: IP klienta ─────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

DEMO_RESET_INTERVAL_SECONDS = 3600  # co godzinę


async def _demo_reset_loop() -> None:
    """Resetuje dane demo co godzinę w tle."""
    while True:
        await asyncio.sleep(DEMO_RESET_INTERVAL_SECONDS)
        try:
            db = next(get_db())
            reset_demo_data(db)
            db.close()
        except Exception as exc:
            print(f"[demo] reset failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed demo przy starcie
    try:
        db = next(get_db())
        reset_demo_data(db)
        db.close()
        print("[demo] seed OK")
    except Exception as exc:
        print(f"[demo] seed failed at startup: {exc}")

    # Uruchom pętlę resetu w tle
    task = asyncio.create_task(_demo_reset_loop())
    yield
    task.cancel()


app = FastAPI(
    title="ADHD Calendar API",
    version="1.0.0",
    description="Time management app with weekly calendar and Eisenhower matrix",
    lifespan=lifespan,
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


# ── Middleware: limit rozmiaru ciała żądania ──────────────────────────────────
@app.middleware("http")
async def limit_request_body(request: Request, call_next) -> Response:
    """Odrzuca żądania przekraczające MAX_BODY_SIZE przed wczytaniem do RAM."""
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        return Response(
            content='{"detail":"Request body too large (max 11 MB)."}',
            status_code=413,
            media_type="application/json",
        )
    return await call_next(request)


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
