"""
SlickTrace AI — FastAPI application entrypoint.

Start with:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.investigations import router as investigations_router

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SlickTrace AI API",
    description=(
        "Oil-spill investigation API combining:\n"
        "- Phase 1: SAR oil-spill detection & geometry\n"
        "- Phase 2: Lagrangian drift hindcast/forecast\n"
        "- Phase 3: AIS vessel attribution"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS (allow local Next.js dev server & Vercel cloud deployments) ──────────

# Explicit allowlist — add any new Vercel preview URLs here if needed.
ALLOWED_ORIGINS = [
    # Production Vercel deployment
    "https://slicktraceai.vercel.app",
    # Local development
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Also allow any Vercel preview deployments (slicktraceai-*.vercel.app)
    allow_origin_regex=r"^https://slicktraceai(-[a-z0-9]+)?\.vercel\.app$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(investigations_router)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
def health_check():
    """Simple liveness probe."""
    return {"status": "ok"}


@app.get("/", tags=["system"])
def root():
    return {
        "system": "SlickTrace AI",
        "version": "1.0.0",
        "docs": "/docs",
    }
