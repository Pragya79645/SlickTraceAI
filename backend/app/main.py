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

# ─── CORS (allow local Next.js dev server) ────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
