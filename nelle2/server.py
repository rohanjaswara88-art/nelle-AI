"""Nelle's web app: serves the shadow UI, the /api/chat brain and /api/tts voice.

Run with:  python nelle2/server.py   then open http://127.0.0.1:8000
"""

from __future__ import annotations

import base64
import datetime
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))

from brain import Brain  # noqa: E402
from emotion import EMOTIONS  # noqa: E402

WEB_DIR = Path(__file__).resolve().parent / "web"
MAX_MESSAGE_CHARS = 2000
MAX_SPEECH_CHARS = 3000

log = logging.getLogger("nelle.server")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_SPEECH_CHARS)
    emotion: str = "neutral"
    intensity: float = Field(default=0.5, ge=0, le=1)


def create_app(brain: Brain | None = None) -> FastAPI:
    app = FastAPI(title="Nelle AI")
    app.state.brain = brain or Brain()

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/api/status")
    def status() -> dict:
        b: Brain = app.state.brain
        return {"provider": b.provider.name, "memory": len(b.memory)}

    @app.post("/api/chat")
    def chat(request: ChatRequest) -> dict:
        b: Brain = app.state.brain
        message = request.message.strip()
        if not message:
            raise HTTPException(status_code=422, detail="Message is empty")
        now = datetime.datetime.now().strftime("%I:%M %p")
        result = b.respond(message, now)
        return {**result.reply.to_dict(), "source": result.source, "url": result.url, "memory": len(b.memory)}

    @app.post("/api/reset")
    def reset() -> dict:
        app.state.brain.reset()
        return {"memory": 0}

    @app.post("/api/tts")
    async def tts(request: SpeechRequest) -> dict:
        from voice import synthesize

        emotion = request.emotion if request.emotion in EMOTIONS else "neutral"
        try:
            audio, words = await synthesize(request.text, emotion, request.intensity)
        except Exception as exc:  # noqa: BLE001 - offline or service down: the UI falls back to text
            log.warning("Speech synthesis failed: %s", exc)
            raise HTTPException(status_code=503, detail="Voice is unavailable right now") from exc
        if not audio:
            raise HTTPException(status_code=503, detail="Voice is unavailable right now")
        return {
            "audio": base64.b64encode(audio).decode("ascii"),
            "words": [{"text": w.text, "offset": w.offset_ms, "duration": w.duration_ms} for w in words],
        }

    @app.middleware("http")
    async def revalidate(request, call_next):
        # Local app: always revalidate, so an edited script is never served stale from cache.
        response = await call_next(request)
        response.headers.setdefault("Cache-Control", "no-cache")
        return response

    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
    return app


def main() -> None:
    import uvicorn
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = create_app()
    log.info("Brain: %s mode", app.state.brain.provider.name)
    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
