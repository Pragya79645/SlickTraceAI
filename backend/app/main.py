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

# ─── CORS ─────────────────────────────────────────────────────────────────────
# allow_origins=["*"] is safe here: the API has no cookies/sessions and is
# a public read-only API. Tighten this once you move to auth.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
