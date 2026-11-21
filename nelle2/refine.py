"""Prompt suggestions: better versions of what the user is typing, shown above the input.

`suggest` asks the model (when there is one) for up to three rewrites of the draft that keep its
meaning but say it more clearly. Without a model, `offline_suggestions` fixes common typos and
shorthand and offers a couple of clearer shapes for the request, so the feature works offline too.
"""

from __future__ import annotations

import json
import logging
import re

log = logging.getLogger("nelle.refine")

MAX_SUGGESTIONS = 3
MIN_DRAFT_CHARS = 6
REFINE_MODEL = "claude-haiku-5-5"  # fast: suggestions must appear while the user is still typing
REFINE_MAX_TOKENS = 400

REFINE_PROMPT = """You help someone write a better message to Nelle, a friendly AI assistant.
You get their draft. Write up to three improved versions of it, each a single message they could
send as it is.

- Keep their meaning, language and voice. Never answer the message or add facts.
- Fix spelling, grammar and shorthand, and make vague requests specific where the draft makes
  the intent clear (for example ask for an example, steps or a short answer).
- Make the versions genuinely different: a corrected version, a clearer version, and a more
  detailed version.
- Keep each under 200 characters. Plain text, no quotes or markdown.

Return only JSON: {"suggestions": ["...", "..."]}"""

SUGGESTION_SCHEMA = {
    "type": "object",
    "properties": {"suggestions": {"type": "array", "items": {"type": "string"}}},
    "required": ["suggestions"],
    "additionalProperties": False,
}

# shorthand and common typos, matched as whole words, case-insensitively
FIXES = {
    "u": "you", "ur": "your", "r": "are", "pls": "please", "plz": "please", "thx": "thanks",
    "wat": "what", "wht": "what", "whats": "what's", "hw": "how", "abt": "about", "bcoz": "because",
    "becuase": "because", "becasue": "because", "coz": "because", "cuz": "because",
    "dont": "don't", "doesnt": "doesn't", "didnt": "didn't", "cant": "can't", "wont": "won't",
    "isnt": "isn't", "im": "I'm", "ive": "I've", "i": "I",
    "teh": "the", "adn": "and", "recieve": "receive", "seperate": "separate", "definately": "definitely",
    "wich": "which", "becomeing": "becoming", "explian": "explain", "explane": "explain",
    "progam": "program", "pyhton": "python", "langauge": "language", "wanna": "want to",
    "gonna": "going to", "gimme": "give me", "tmrw": "tomorrow", "msg": "message",
    "diff": "difference", "b/w": "between", "btw": "by the way", "idk": "I don't know", "ppl": "people",
}
QUESTION_WORDS = ("what", "why", "how", "when", "where", "who", "which", "can", "could", "would",
                  "should", "is", "are", "do", "does", "did", "will")
EXPLAIN = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?(?:explain|tell me about|what is|what's|what are|how does|how do"
    r"|I don't understand|I don't get)\s+(.+)$",
    re.I,
)
POLITE = re.compile(r"[\s,]*\b(?:please|pls|plz)\b[\s,]*", re.I)


def tidy(text: str) -> str:
    """Fix shorthand and typos, capitalise, and end with the right punctuation."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return text

    def fix(match: re.Match) -> str:
        word = match.group(0)
        return FIXES.get(word.lower(), word)

    text = re.sub(r"[A-Za-z/']+", fix, text)
    text = text[0].upper() + text[1:]
    if text[-1] not in ".?!":
        first = text.split(" ", 1)[0].lower().strip("',")
        text += "?" if first in QUESTION_WORDS else "."
    return text


def offline_suggestions(draft: str) -> list[str]:
    """Rule-based suggestions used without a model: a tidied draft plus clearer shapes of it."""
    fixed = tidy(draft)
    core = POLITE.sub(" ", fixed.rstrip(".?!")).strip(" ,")
    options = [fixed]
    topic = EXPLAIN.match(core)
    if topic:
        subject = topic.group(1)
        options.append(f"Can you explain {subject} in simple words, with one example?")
        options.append(f"Explain {subject} step by step, as if I'm a beginner.")
    elif fixed.endswith("?"):
        options.append(f"{core}? Please answer briefly, with an example.")
        options.append(f"{core}? Explain it step by step.")
    else:
        options.append(f"Please {core[0].lower() + core[1:]}.")
        options.append(f"{core}, and keep it short.")
    return clean(options, draft)


def clean(options: list[str], draft: str) -> list[str]:
    """Drop empty, duplicate and unchanged suggestions; keep at most MAX_SUGGESTIONS."""
    seen = {_key(draft)}
    out = []
    for option in options:
        option = re.sub(r"\s+", " ", str(option)).strip().strip('"')
        if not option or _key(option) in seen:
            continue
        seen.add(_key(option))
        out.append(option[:240])
    return out[:MAX_SUGGESTIONS]


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def claude_suggestions(client, draft: str, model: str = REFINE_MODEL) -> list[str]:
    """Ask Claude for rewrites of the draft. Raises on any API error; the caller falls back."""
    response = client.messages.create(
        model=model,
        max_tokens=REFINE_MAX_TOKENS,
        system=REFINE_PROMPT,
        messages=[{"role": "user", "content": f"Draft:\n{draft}"}],
        output_config={"format": {"type": "json_schema", "schema": SUGGESTION_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        return []
    text = "".join(block.text for block in response.content if block.type == "text")
    data = json.loads(text)
    return clean(data.get("suggestions", []), draft)
