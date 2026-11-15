import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "nelle2"))

from commands import Action, match_command, search_url  # noqa: E402

NOW = "07:30 PM"


def test_opens_sites():
    assert match_command("open youtube", NOW).url == "https://youtube.com"
    assert match_command("please open google", NOW).url == "https://google.com"
    assert match_command("open chatgpt", NOW).url == "https://chatgpt.com"


def test_search_encodes_the_query():
    action = match_command("search google for c++ & rust", NOW)
    assert action.url == "https://www.google.com/search?q=c%2B%2B%20%26%20rust"
    assert action.reply == "Searching Google for c++ & rust sir"


def test_youtube_search():
    action = match_command("Search YouTube for lofi beats", NOW)
    assert action.url == "https://www.youtube.com/results?search_query=lofi%20beats"


def test_empty_search_asks_for_a_query():
    assert match_command("search google for", NOW) == Action("What should I search for?")


def test_search_wins_over_other_keywords():
    action = match_command("search google for time in tokyo", NOW)
    assert action.url == search_url("https://www.google.com/search?q=", "time in tokyo")


def test_tells_the_time():
    assert match_command("what time is it", NOW).reply == "Sir, the current time is 07:30 PM"


def test_stop_words_quit():
    for word in ("stop", "exit", "shutdown now"):
        assert match_command(word, NOW).stop


def test_creator_answer():
    assert "creator" in match_command("who is rohan", NOW).reply


def test_unknown_command():
    action = match_command("make me a sandwich", NOW)
    assert action == Action("Sorry sir, I don't understand that command.")
    assert not action.stop and action.url is None
