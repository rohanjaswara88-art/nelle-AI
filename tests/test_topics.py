import pytest

from topics import GENERAL, TOPICS, detect_topic


@pytest.mark.parametrize(
    ("message", "topic"),
    [
        ("I don't understand recursion at all", "code"),
        ("how do neural networks learn?", "ai"),
        ("how far away is Mars?", "space"),
        ("my girlfriend broke up with me", "love"),
        ("is it going to rain tomorrow", "weather"),
        ("tell me a joke", "fun"),
        ("I have a headache", "health"),
        ("give me a pizza recipe", "food"),
        ("I want to save money", "money"),
    ],
)
def test_detects_the_topic_of_a_message(message, topic):
    assert detect_topic(message) == topic


def test_small_talk_is_general():
    assert detect_topic("hello there") == GENERAL
    assert detect_topic("") == GENERAL


def test_calculations_and_open_commands_have_fixed_topics():
    assert detect_topic("what is 23 * 47", "23 times 47 is 1,081.", "calc") == "math"
    assert detect_topic("open youtube", "Opening YouTube.", "command") == "web"


def test_the_message_outweighs_the_reply():
    assert detect_topic("help me debug my python", "Take a deep breath, then tell me about the stress.") == "code"


def test_the_reply_decides_when_the_message_is_vague():
    assert detect_topic("what about that?", "Saturn's rings are mostly ice orbiting the planet.") == "space"


def test_stems_match_whole_word_starts_only():
    # "plan" must not match "planet", and "art" inside "start" must not count as anything
    assert detect_topic("let's start") == GENERAL
    assert "general" in TOPICS
