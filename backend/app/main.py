"""FastAPI application factory."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import bandi, catalog, health
from .config import ALLOWED_ORIGINS, REPO_ROOT
from .storage import store as storage


class SpaStaticFiles(StaticFiles):
    """Static files with an SPA fallback: unknown non-API paths serve index.html,
    so react-router deep links (``/bandi/:id``) survive a refresh on one port."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not scope["path"].startswith("/api"):
                return FileResponse(Path(self.directory) / "index.html")
            raise


def create_app() -> FastAPI:
    app = FastAPI(
        title="Bando -> Preventivo",
        version="0.1.0",
        description="Turns a tender PDF into a priced quote.",
    )

    # The archive index is a cache; upgrade it when it predates a summary field
    # the library needs (overview one-liner, page types for the page tape).
    storage.rebuild_index()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # The offer PDF reports its file name and counts in headers.
        expose_headers=["Content-Disposition", "X-Offer-Written", "X-Offer-Skipped", "X-Offer-Form-Written"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "invalid_input"
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": code, "message": str(exc.detail)}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}
        location = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        message = first.get("msg", "Invalid request")
        if location:
            message = "%s (%s)" % (message, location)
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "invalid_input", "message": message}},
        )

    app.include_router(health.router)
    app.include_router(catalog.router)
    app.include_router(bandi.router)

    # Serve the built frontend when present, so the demo can run on one port.
    dist = REPO_ROOT / "frontend" / "dist"
    if dist.exists():
        app.mount("/", SpaStaticFiles(directory=str(dist), html=True), name="frontend")

    return app


app = create_app()


def main() -> None:  # pragma: no cover - convenience entrypoint
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":  # pragma: no cover
    main()
