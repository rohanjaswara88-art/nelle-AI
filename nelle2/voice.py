"""Nelle's voice: one neural edge-tts voice, with gentle per-emotion delivery and word timings."""

from __future__ import annotations

import re
from dataclasses import dataclass

VOICE = "en-US-AvaNeural"  # one consistent identity for every reply

# (rate %, pitch Hz) at full intensity. Kept small: the voice should shift, not change character.
PROSODY = {
    "happy": (6, 3),
    "excited": (10, 5),
    "sad": (-12, -4),
    "frustrated": (2, -2),
    "confused": (-6, 1),
    "curious": (2, 2),
    "surprised": (8, 5),
    "disappointed": (-10, -3),
    "nervous": (6, 2),
    "casual": (0, 0),
    "playful": (6, 4),
    "thinking": (-8, -1),
    "concerned": (-8, -2),
    "neutral": (0, 0),
}
BASE_RATE = -4  # slightly unhurried overall: calmer and easier to follow


@dataclass(frozen=True)
class Prosody:
    rate: str
    pitch: str


@dataclass(frozen=True)
class WordTiming:
    text: str
    offset_ms: int
    duration_ms: int


def prosody_for(emotion: str, intensity: float) -> Prosody:
    """Scale an emotion's delivery by intensity, formatted for edge-tts."""
    rate, pitch = PROSODY.get(emotion, (0, 0))
    scale = 0.4 + 0.6 * min(1.0, max(0.0, intensity))  # even a subtle mood is faintly audible
    return Prosody(f"{round(BASE_RATE + rate * scale):+d}%", f"{round(pitch * scale):+d}Hz")


def clean_for_speech(text: str) -> str:
    """Strip markdown and code markers so they aren't read aloud."""
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"[`*_#>]+", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


async def synthesize(text: str, emotion: str, intensity: float) -> tuple[bytes, list[WordTiming]]:
    """Return MP3 audio and per-word timings (for lip sync and text reveal)."""
    import edge_tts  # needs network; imported lazily so tests don't

    prosody = prosody_for(emotion, intensity)
    communicate = edge_tts.Communicate(
        clean_for_speech(text), VOICE, rate=prosody.rate, pitch=prosody.pitch, boundary="WordBoundary"
    )
    audio = bytearray()
    words: list[WordTiming] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            # edge-tts reports offsets in 100-nanosecond ticks
            words.append(WordTiming(chunk["text"], chunk["offset"] // 10_000, chunk["duration"] // 10_000))
    return bytes(audio), words
