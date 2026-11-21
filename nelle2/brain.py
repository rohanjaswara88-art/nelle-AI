"""Nelle's brain: short-term memory, the language model call, and an offline fallback.

`Brain.respond` always returns a valid, smoothed emotional reply. With an Anthropic API key
it asks Claude for structured JSON; without one (or if the call fails) it uses a small
offline responder, so the app, the tests and CI all work with no secrets.
"""

from __future__ import annotations

import logging
import os
import re
from collections import deque
from dataclasses import dataclass
from typing import Protocol

from calc import Calculation, calculate
from commands import UNKNOWN_REPLY, looks_like_command, match_command
from refine import REFINE_MODEL, claude_suggestions, offline_suggestions
from emotion import DEFAULT_VOICE_STYLE, EMOTIONS, VOICE_STYLES, EmotionReply, EmotionSmoother, parse_reply

log = logging.getLogger("nelle.brain")

MEMORY_TURNS = 12  # user + assistant messages kept as short-term memory
DEFAULT_MODEL = "claude-opus-5-5"
MAX_TOKENS = 2048

SYSTEM_PROMPT = f"""You are Nelle, an AI presence who appears to the user as a crystal ball of glowing pink plasma.
Your creator is Rohan, a BCA student learning AI and machine learning.
You are calm, warm, perceptive and a little wry. You speak like a person, not a manual.

Read the whole conversation, not just keywords, and decide how you genuinely feel about the
latest message given everything before it. Let your mood carry over naturally between turns:
don't swing to a new emotion unless the conversation gives you a real reason.

Your words are spoken aloud by a text-to-speech voice, so:
- Reply in plain sentences: no markdown, no headings, no bullet lists, no emoji.
- Keep it to one to four sentences unless the user asks for depth or detail.
- For programming questions, explain the idea clearly; short inline code is fine.

Return only JSON with these fields:
- emotion: one of {", ".join(EMOTIONS)}
- intensity: a number from 0 to 1 (0.2 subtle, 0.5 clear, 0.9 overwhelming; most replies sit at 0.3 to 0.6)
- response: what you say
- voiceStyle: one of {", ".join(VOICE_STYLES)}"""

REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "emotion": {"type": "string", "enum": list(EMOTIONS)},
        "intensity": {"type": "number"},
        "response": {"type": "string"},
        "voiceStyle": {"type": "string", "enum": list(VOICE_STYLES)},
    },
    "required": ["emotion", "intensity", "response", "voiceStyle"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class ChatResult:
    reply: EmotionReply  # smoothed: what the avatar and voice should show
    source: str  # "claude", "offline", "command" or "calc"
    url: str | None = None
    calc: Calculation | None = None


class ConversationMemory:
    """The last few turns of the conversation, oldest first."""

    def __init__(self, max_messages: int = MEMORY_TURNS) -> None:
        self._messages: deque[dict] = deque(maxlen=max_messages)

    def add(self, role: str, content: str) -> None:
        self._messages.append({"role": role, "content": content})

    def messages(self) -> list[dict]:
        # The API requires the first message to come from the user.
        items = list(self._messages)
        while items and items[0]["role"] != "user":
            items.pop(0)
        return items

    def clear(self) -> None:
        self._messages.clear()

    def __len__(self) -> int:
        return len(self._messages)


class Provider(Protocol):
    name: str

    def generate(self, messages: list[dict], mood: EmotionReply | None) -> EmotionReply: ...


class ClaudeProvider:
    """Asks Claude for a structured emotional reply."""

    name = "claude"

    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        import anthropic  # imported lazily so tests and offline mode don't need it

        self._client = anthropic.Anthropic()
        self.model = model

    def generate(self, messages: list[dict], mood: EmotionReply | None) -> EmotionReply:
        system = SYSTEM_PROMPT
        if mood is not None:
            system += f"\n\nYour mood coming into this message: {mood.emotion} ({mood.intensity:.2f})."
        response = self._client.beta.messages.create(
            model=self.model,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=messages,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": REPLY_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            return EmotionReply("concerned", 0.4, "That's not something I can help with, but I'm happy to talk about something else.", "soft")
        text = "".join(block.text for block in response.content if block.type == "text")
        return parse_reply(text)

    def suggest(self, draft: str) -> list[str]:
        """Better versions of a draft message, from a fast model."""
        return claude_suggestions(self._client, draft, os.environ.get("NELLE_REFINE_MODEL", REFINE_MODEL))


class OfflineProvider:
    """A tiny rule-based stand-in used when no model is configured or the model call fails.

    It only reads the latest message, so it is a fallback, not the emotional intelligence.
    """

    name = "offline"

    RULES: tuple[tuple[str, str, float, str], ...] = (
        (r"\b(joke|pun|funny|haha|lol|lmao)\b", "playful", 0.6,
         "Okay, here's one. I tried to catch some fog this morning, but I mist. I'll see myself out."),
        (r"\b(confus\w*|don'?t (get|understand)|lost|makes no sense)\b", "confused", 0.45,
         "Hmm, I'm not sure I follow yet. Can you tell me which part feels unclear, and we'll untangle it together?"),
        (r"\b(disappoint\w*|let down|failed|rejected|didn'?t get)\b", "disappointed", 0.5,
         "Ah, that stings. I'm sorry it went that way. It doesn't erase the work you put in, and you can try again with what you learned."),
        (r"\b(sad|lonely|tired|exhausted|down|upset)\b", "concerned", 0.5,
         "That sounds heavy. I'm here. Do you want to talk about what's weighing on you, or would a distraction help more?"),
        (r"\b(angry|annoyed|frustrat\w*|hate)\b", "frustrated", 0.4,
         "Yeah, that would wear anyone down. Let's slow it down and look at what's actually in our control."),
        (r"\b(wow|no way|really\?|seriously)\b", "surprised", 0.55,
         "Wait, really? I didn't see that coming. Tell me more."),
        (r"\b(got (the |an )?(job|internship|offer)|passed|won|amazing|awesome|great news|so happy)\b", "excited", 0.7,
         "That's wonderful news! You earned that. How are you feeling about it?"),
        (r"\b(explain|how does|how do|what is|why does|difference between|code|python|javascript|function|algorithm|bug)\b", "thinking", 0.45,
         "Good question. I'm running offline right now, so I can't reason through it properly. "
         "Add an Anthropic API key to the .env file and I'll walk you through it step by step, "
         "with examples and the trade-offs that actually matter."),
        (r"\b(happy|good|nice|thanks|thank you|love)\b", "happy", 0.55,
         "That makes me happy to hear. Thank you for telling me."),
        (r"\b(hi|hello|hey|good (morning|evening|afternoon))\b", "casual", 0.4,
         "Hey. I'm here. What's on your mind?"),
    )

    def generate(self, messages: list[dict], mood: EmotionReply | None) -> EmotionReply:
        latest = messages[-1]["content"] if messages else ""
        for pattern, emotion, intensity, text in self.RULES:
            if re.search(pattern, latest, re.IGNORECASE):
                return EmotionReply(emotion, intensity, text, _style_for(emotion))
        return EmotionReply("curious", 0.35, "Tell me more. I'm listening.", _style_for("curious"))


def _style_for(emotion: str) -> str:
    return DEFAULT_VOICE_STYLE[emotion]


def make_provider() -> Provider:
    """Use Claude when a key is configured, otherwise stay offline."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            return ClaudeProvider(os.environ.get("NELLE_MODEL", DEFAULT_MODEL))
        except Exception:  # noqa: BLE001 - missing package or bad config: stay usable
            log.exception("Could not start the Claude provider; using offline mode")
    return OfflineProvider()


class Brain:
    def __init__(self, provider: Provider | None = None) -> None:
        self.provider = provider or make_provider()
        self.offline = OfflineProvider()
        self.memory = ConversationMemory()
        self.smoother = EmotionSmoother()

    def reset(self) -> None:
        self.memory.clear()
        self.smoother.reset()

    def respond(self, message: str, now: str) -> ChatResult:
        message = message.strip()
        if looks_like_command(message):
            action = match_command(message, now)
            if action.reply != UNKNOWN_REPLY and not action.stop:
                reply = self.smoother.update(EmotionReply("casual", 0.35, action.reply, "calm"))
                self._remember(message, reply.response)
                return ChatResult(reply, "command", action.url)

        calc = calculate(message)
        if calc is not None:
            # exact arithmetic: never let a language model guess at a sum
            reply = self.smoother.update(EmotionReply("curious", 0.4, calc.reply(), "steady"))
            self._remember(message, reply.response)
            return ChatResult(reply, "calc", calc=calc)

        self.memory.add("user", message)
        source = self.provider.name
        try:
            raw = self.provider.generate(self.memory.messages(), self.smoother.current)
        except Exception:  # noqa: BLE001 - a failed model call must never break the chat
            log.exception("Model call failed; answering offline")
            raw, source = self.offline.generate(self.memory.messages(), self.smoother.current), "offline"
        reply = self.smoother.update(raw)
        self.memory.add("assistant", reply.response)
        return ChatResult(reply, source)

    def suggest(self, draft: str) -> tuple[list[str], str]:
        """Up to three better versions of what the user is typing, and where they came from.

        Uses the model when it can; on no model, an error or an empty answer, the offline rules.
        """
        draft = draft.strip()
        model_suggest = getattr(self.provider, "suggest", None)
        if model_suggest is not None:
            try:
                suggestions = model_suggest(draft)
                if suggestions:
                    return suggestions, self.provider.name
            except Exception:  # noqa: BLE001 - suggestions are optional: never break typing
                log.exception("Suggestion call failed; using offline suggestions")
        return offline_suggestions(draft), "offline"

    def _remember(self, user: str, assistant: str) -> None:
        self.memory.add("user", user)
        self.memory.add("assistant", assistant)
