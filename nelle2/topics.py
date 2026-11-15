"""Work out what a conversation turn is about, so the ball can draw that topic as a constellation.

A small keyword scorer: the user's message counts twice as much as Nelle's reply. Each entry is a
whole word (plurals included); an entry ending in "*" is a prefix ("program*" matches "programming").
"""

from __future__ import annotations

import re

GENERAL = "general"

# topic -> words. Every topic here has a matching shape in web/constellation.js.
TOPIC_WORDS: dict[str, tuple[str, ...]] = {
    "code": (
        "code", "coding", "coder", "program*", "python", "javascript", "typescript", "java", "html",
        "css", "function", "variable", "bug", "debug*", "compil*", "recursion", "algorithm", "api",
        "git", "loop", "array", "database", "sql", "react", "software", "developer", "syntax", "script*",
    ),
    "ai": (
        "ai", "artificial intelligence", "machine learning", "neural", "llm", "chatgpt", "claude",
        "robot", "deep learning", "training data", "gpt",
    ),
    "math": (
        "math", "maths", "calculat*", "equation", "algebra", "geometry", "percent*", "sum", "multipl*",
        "divid*", "fraction", "integral", "derivative", "square root", "statistic*", "probabilit*",
    ),
    "science": (
        "scien*", "physic*", "chemi*", "biolog*", "atom", "molecule", "electron", "quantum",
        "experiment*", "energy", "gravity", "dna", "evolution", "element",
    ),
    "space": (
        "space", "planet", "star", "galaxy", "galaxies", "universe", "moon", "mars", "sun", "orbit*",
        "rocket", "astronaut*", "nasa", "black hole", "cosmos", "saturn", "jupiter", "solar",
    ),
    "music": (
        "music*", "song", "singing", "singer", "guitar", "piano", "melody", "melodies", "album",
        "band", "concert", "lyric", "rhythm", "spotify", "playlist", "drum", "rapper",
    ),
    "love": (
        "love", "crush", "relationship", "girlfriend", "boyfriend", "dating", "heart", "breakup",
        "broke up", "romanc*", "marry", "married", "feelings", "miss her", "miss him",
    ),
    "health": (
        "health*", "sick", "doctor", "medicine", "pain", "hurt", "sleep", "tired", "exercis*",
        "workout", "gym", "diet", "stress", "anxiety", "anxious", "headache", "fever", "therapy",
    ),
    "money": (
        "money", "budget*", "save", "saving", "invest*", "stock", "price", "cost", "salary", "bank",
        "loan", "debt", "crypto", "bitcoin", "rich", "income", "financ*", "dollar", "rupee",
    ),
    "weather": (
        "weather", "rain", "raining", "storm", "snow", "sunny", "cloudy", "thunder*", "lightning",
        "temperature", "forecast*", "windy", "climate",
    ),
    "time": (
        "time", "clock", "histor*", "ancient", "century", "centuries", "when did", "future",
        "schedul*", "deadline", "war",
    ),
    "nature": (
        "nature", "tree", "forest", "plant", "flower", "garden", "animal", "dog", "cat", "bird",
        "ocean", "sea", "river", "mountain", "leaf", "leaves", "environment",
    ),
    "travel": (
        "travel*", "trip", "flight", "plane", "vacation", "holiday", "visit", "country", "countries",
        "city", "cities", "hotel", "tour", "journey", "passport", "abroad",
    ),
    "web": (
        "website", "internet", "browser", "google", "youtube", "link", "online", "wikipedia", "url",
        "download",
    ),
    "books": (
        "book", "reading", "novel", "story", "stories", "writing", "essay", "poem", "poetry", "author",
        "language", "grammar", "english", "translat*", "spelling",
    ),
    "fun": (
        "joke", "funny", "laugh*", "game", "gaming", "fun", "bored", "meme", "riddle", "movie", "film",
        "anime", "cartoon", "netflix", "party", "parties",
    ),
    "food": (
        "food", "eat", "eating", "cook*", "recipe", "hungry", "pizza", "coffee", "tea", "dinner",
        "lunch", "breakfast", "baking", "cake", "restaurant", "snack", "drink",
    ),
}
TOPICS: tuple[str, ...] = (*TOPIC_WORDS, GENERAL)
USER_WEIGHT = 2


def _word_pattern(entry: str) -> str:
    if entry.endswith("*"):
        return re.escape(entry[:-1])
    return re.escape(entry) + r"(?:s|es)?\b"


_PATTERNS = {
    topic: re.compile(r"\b(?:" + "|".join(map(_word_pattern, words)) + r")", re.IGNORECASE)
    for topic, words in TOPIC_WORDS.items()
}
_ORDER = {topic: i for i, topic in enumerate(TOPIC_WORDS)}


def _add_scores(text: str, weight: int, totals: dict[str, int]) -> dict[str, int]:
    for topic, pattern in _PATTERNS.items():
        hits = len(pattern.findall(text))
        if hits:
            totals = {**totals, topic: totals.get(topic, 0) + hits * weight}
    return totals


def detect_topic(message: str, reply: str = "", source: str = "") -> str:
    """Return the topic of one exchange: a key of TOPIC_WORDS, or "general" when nothing matches."""
    if source == "calc":
        return "math"
    if source == "command" and re.search(r"\bopen\b", message, re.IGNORECASE):
        return "web"
    totals = _add_scores(reply, 1, _add_scores(message, USER_WEIGHT, {}))
    if not totals:
        return GENERAL
    # ties go to the topic listed first, so specific topics win over broad ones
    return max(totals, key=lambda topic: (totals[topic], -_ORDER[topic]))
