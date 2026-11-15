"""Turn what the user said into an action, with no microphone, speaker or browser.

Keeping this logic pure (text in, action out) means it can be tested without any hardware.
"""

from dataclasses import dataclass
from urllib.parse import quote

GOOGLE_HOME = "https://google.com"
YOUTUBE_HOME = "https://youtube.com"
CHATGPT_HOME = "https://chatgpt.com"
GOOGLE_SEARCH = "https://www.google.com/search?q="
YOUTUBE_SEARCH = "https://www.youtube.com/results?search_query="

STOP_WORDS = ("stop", "exit", "shutdown")


@dataclass(frozen=True)
class Action:
    """What the assistant should do: say `reply`, open `url` if set, and quit if `stop`."""

    reply: str
    url: str | None = None
    stop: bool = False


def search_url(base: str, query: str) -> str:
    """Build a search URL with the query safely encoded."""
    return base + quote(query)


def _search(command: str, phrase: str, site: str, base: str) -> Action:
    query = command.split(phrase, 1)[1].strip()
    if not query:
        return Action("What should I search for?")
    return Action(f"Searching {site} for {query} sir", search_url(base, query))


def match_command(command: str, now: str) -> Action:
    """Pick the action for a spoken command. `now` is the current time, e.g. "07:30 PM"."""
    command = command.lower().strip()

    # Searches are checked before "open ..." and "time", so "search google for time" searches.
    if "search youtube for" in command:
        return _search(command, "search youtube for", "YouTube", YOUTUBE_SEARCH)
    if "search google for" in command:
        return _search(command, "search google for", "Google", GOOGLE_SEARCH)
    if "open youtube" in command:
        return Action("Opening YouTube for you sir", YOUTUBE_HOME)
    if "open google" in command:
        return Action("Opening Google for you sir", GOOGLE_HOME)
    if "open chat" in command:
        return Action("Opening ChatGPT for you sir", CHATGPT_HOME)
    if "time" in command:
        return Action(f"Sir, the current time is {now}")
    if "rohan" in command:
        return Action(
            "Rohan is my creator. He is currently learning artificial intelligence and machine learning."
        )
    if any(word in command for word in STOP_WORDS):
        return Action("Shutting down Jarvis. Goodbye sir.", stop=True)
    return Action("Sorry sir, I don't understand that command.")
