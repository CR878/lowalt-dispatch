"""Loopback BFF with NDJSON tool events. No cloud resources required."""

from __future__ import annotations

import json
import os
import queue
import threading
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from services.api.routes import router as dispatch_router
from services.api.routes import runtime as dispatch_runtime
from services.assistant.engine import Engine, ModelUnavailable, Settings
from services.assistant.models import Turn
from services.assistant.places import search_places
from services.assistant.telemetry import stream_telemetry


@asynccontextmanager
async def lifespan(app: FastAPI):
    from services.api.runtime import from_env

    dispatch = from_env()
    app.state.dispatch = dispatch
    app.state.dispatch_error = False
    stop = threading.Event()

    def advance():
        while not stop.wait(0.5):
            try:
                dispatch.tick()
            except Exception:
                # Surface a failed pump instead of silently advertising health.
                app.state.dispatch_error = True
                break

    worker = threading.Thread(target=advance, daemon=True)
    worker.start()
    try:
        yield
    finally:
        stop.set()
        worker.join(timeout=10)
        dispatch.close()
        app.state.dispatch = None


app = FastAPI(
    title="AERIS assistant local BFF", docs_url="/api/assistant/docs", redoc_url=None, lifespan=lifespan
)
app.include_router(dispatch_router)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
settings = Settings.from_env()
engine = Engine(settings)
audit_lock = threading.Lock()
slots = threading.BoundedSemaphore(3)


@app.middleware("http")
async def local_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in {
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:4174",
        "http://localhost:4174",
        "http://127.0.0.1:8012",
        "http://localhost:8012",
    }:
        return JSONResponse({"detail": "Origin is not allowed"}, status_code=403)
    # This service is for loopback development, not a public unauthenticated deployment.
    return await call_next(request)


@app.get("/api/assistant/health")
def health():
    return {
        "status": "ok",
        "provider": settings.provider,
        "model_configured": settings.provider == "maas",
        "dispatch_enabled": False,
        "data_mode": "ui_demo",
        "protocol": "aeris-assistant-1",
    }


@app.get("/api/assistant/places/search")
def places(q: str):
    return search_places(q)


@app.get("/api/telemetry/stream")
async def telemetry_stream():
    path = os.environ.get("AERIS_TELEMETRY_FILE")
    if not path:
        raise HTTPException(503, "M4 telemetry feed is not configured")
    return StreamingResponse(
        stream_telemetry(Path(path)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def write_audit(packet):
    root = Path(__file__).resolve().parents[2] / "logs/assistant"
    root.mkdir(parents=True, exist_ok=True)
    path = root / (datetime.now(UTC).strftime("%Y-%m-%d") + "_DEMO.jsonl")
    with audit_lock, path.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps({"at": datetime.now(UTC).isoformat(), **packet}, ensure_ascii=False, allow_nan=False)
            + "\n"
        )


@app.post("/api/assistant/turn")
async def turn(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 200_000:
            raise HTTPException(413, "Request too large")
    try:
        value = Turn.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422, "Assistant request fields are invalid") from None
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Assistant is busy; retry later")
    packets = queue.Queue()
    try:
        read_dispatch_task = dispatch_runtime(request).get
    except HTTPException:
        read_dispatch_task = None

    def worker():
        try:

            def emit(packet):
                if packet["type"] == "tool_result":
                    write_audit({"turn_id": str(value.request_id), "provider": settings.provider, **packet})
                packets.put(packet)

            write_audit(
                {
                    "turn_id": str(value.request_id),
                    "provider": settings.provider,
                    "type": "turn_start",
                    "is_simulated": True,
                }
            )
            result = engine.run(value, emit, read_dispatch_task=read_dispatch_task)
            write_audit(
                {
                    "turn_id": str(value.request_id),
                    "provider": settings.provider,
                    "type": "turn_complete",
                    "tool_count": len(result["traces"]),
                    "dispatch_enabled": False,
                }
            )
            packets.put({"type": "result", "result": result})
        except ModelUnavailable as error:
            packets.put({"type": "error", "message": str(error)})
        except Exception:
            packets.put(
                {"type": "error", "message": "本地工具或审计写入失败，请检查服务状态；本轮没有执行飞行操作。"}
            )
        finally:
            packets.put(None)
            slots.release()

    threading.Thread(target=worker, daemon=True).start()

    def stream():
        yield (
            json.dumps({"type": "start", "turn_id": str(value.request_id), "provider": settings.provider})
            + "\n"
        )
        while True:
            try:
                packet = packets.get(timeout=5)
            except queue.Empty:
                yield '{"type":"heartbeat"}\n'
                continue
            if packet is None:
                break
            yield json.dumps(packet, ensure_ascii=False, allow_nan=False) + "\n"

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
