"""Emotion engine: parse, validate and smooth the structured replies Nelle's brain produces.

Every reply is `{emotion, intensity, response, voiceStyle}`. Anything malformed is repaired
or replaced with a safe fallback, so the avatar and voice never receive a value they can't use.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace

EMOTIONS = (
    "happy",
    "excited",
    "sad",
    "frustrated",
    "confused",
    "curious",
    "surprised",
    "disappointed",
    "nervous",
    "casual",
    "playful",
    "thinking",
    "concerned",
    "neutral",
)

VOICE_STYLES = ("calm", "warm", "bright", "soft", "steady", "playful", "tense")

# The voice style each emotion uses when the model doesn't pick a valid one.
DEFAULT_VOICE_STYLE = {
    "happy": "warm",
    "excited": "bright",
    "sad": "soft",
    "frustrated": "tense",
    "confused": "steady",
    "curious": "warm",
    "surprised": "bright",
    "disappointed": "soft",
    "nervous": "tense",
    "casual": "calm",
    "playful": "playful",
    "thinking": "steady",
    "concerned": "soft",
    "neutral": "calm",
}

ALIASES = {
    "humour": "playful",
    "humor": "playful",
    "playful/humour": "playful",
    "funny": "playful",
    "joy": "happy",
    "glad": "happy",
    "angry": "frustrated",
    "annoyed": "frustrated",
    "worried": "concerned",
    "anxious": "nervous",
    "calm": "neutral",
    "pensive": "thinking",
    "interested": "curious",
    "shocked": "surprised",
}

DEFAULT_INTENSITY = 0.5
FALLBACK_TEXT = "Sorry, my thoughts got a little tangled there. Could you say that again?"

# Smoothing: a different emotion only takes over when it is strong enough, so the face
# doesn't flicker between moods on weak signals. Same-emotion replies blend intensity.
SWITCH_THRESHOLD = 0.35
SAME_EMOTION_BLEND = 0.6  # weight of the new intensity when the emotion stays the same
HOLD_DECAY = 0.75  # how much the current mood fades when a weak, different one is ignored


@dataclass(frozen=True)
class EmotionReply:
    emotion: str
    intensity: float
    response: str
    voice_style: str

    def to_dict(self) -> dict:
        return {
            "emotion": self.emotion,
            "intensity": round(self.intensity, 3),
            "response": self.response,
            "voiceStyle": self.voice_style,
        }


def fallback_reply(text: str = FALLBACK_TEXT) -> EmotionReply:
    return EmotionReply("concerned", 0.3, text, DEFAULT_VOICE_STYLE["concerned"])


def normalize_emotion(value: object) -> str:
    """Map a model-provided label onto one of EMOTIONS, defaulting to neutral."""
    if not isinstance(value, str):
        return "neutral"
    label = value.strip().lower()
    if label in EMOTIONS:
        return label
    return ALIASES.get(label, "neutral")


def clamp_intensity(value: object) -> float:
    """Return a float in [0, 1]; anything unusable becomes the default."""
    if isinstance(value, bool):
        return DEFAULT_INTENSITY
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return DEFAULT_INTENSITY
    if number != number:  # NaN
        return DEFAULT_INTENSITY
    if number > 1 and number <= 10:  # a 0-10 scale slipped through
        number /= 10
    return min(1.0, max(0.0, number))


def _extract_json_object(raw: str) -> dict | None:
    """Find the first JSON object in raw text, tolerating code fences or chatter around it."""
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def validate_reply(data: dict) -> EmotionReply:
    """Turn a decoded dict into a valid EmotionReply, repairing each field."""
    response = data.get("response")
    if not isinstance(response, str) or not response.strip():
        return fallback_reply()
    emotion = normalize_emotion(data.get("emotion"))
    style = data.get("voiceStyle", data.get("voice_style"))
    if not isinstance(style, str) or style.strip().lower() not in VOICE_STYLES:
        style = DEFAULT_VOICE_STYLE[emotion]
    return EmotionReply(emotion, clamp_intensity(data.get("intensity")), response.strip(), style.strip().lower())


def parse_reply(raw: object) -> EmotionReply:
    """Parse the model's raw output. Plain prose is kept as a neutral reply; junk falls back."""
    if isinstance(raw, dict):
        return validate_reply(raw)
    if not isinstance(raw, str) or not raw.strip():
        return fallback_reply()
    data = _extract_json_object(raw)
    if data is not None:
        return validate_reply(data)
    if raw.lstrip().startswith("{"):
        return fallback_reply()  # broken JSON: don't read braces out loud
    return EmotionReply("neutral", DEFAULT_INTENSITY, raw.strip(), DEFAULT_VOICE_STYLE["neutral"])


class EmotionSmoother:
    """Keeps Nelle's mood continuous across messages instead of jumping on every reply."""

    def __init__(self) -> None:
        self.current: EmotionReply | None = None

    def reset(self) -> None:
        self.current = None

    def update(self, reply: EmotionReply) -> EmotionReply:
        previous = self.current
        if previous is None:
            smoothed = reply
        elif reply.emotion == previous.emotion:
            intensity = previous.intensity * (1 - SAME_EMOTION_BLEND) + reply.intensity * SAME_EMOTION_BLEND
            smoothed = replace(reply, intensity=intensity)
        elif reply.intensity >= SWITCH_THRESHOLD or reply.intensity > previous.intensity * HOLD_DECAY:
            smoothed = reply
        else:
            # A weak, different signal: keep the current mood, let it fade a little.
            smoothed = replace(
                reply,
                emotion=previous.emotion,
                intensity=previous.intensity * HOLD_DECAY,
                voice_style=previous.voice_style,
            )
        self.current = smoothed
        return smoothed
