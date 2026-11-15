import pytest

from emotion import (
    EMOTIONS,
    FALLBACK_TEXT,
    EmotionReply,
    EmotionSmoother,
    clamp_intensity,
    normalize_emotion,
    parse_reply,
)


def test_parses_clean_json():
    reply = parse_reply('{"emotion": "curious", "intensity": 0.6, "response": "Tell me more.", "voiceStyle": "warm"}')
    assert reply == EmotionReply("curious", 0.6, "Tell me more.", "warm")


def test_parses_json_inside_code_fence_and_chatter():
    raw = 'Sure!\n```json\n{"emotion": "happy", "intensity": 0.4, "response": "Yay", "voiceStyle": "bright"}\n```'
    assert parse_reply(raw).emotion == "happy"


def test_every_supported_emotion_is_accepted():
    for emotion in EMOTIONS:
        assert parse_reply({"emotion": emotion, "intensity": 0.5, "response": "ok"}).emotion == emotion


@pytest.mark.parametrize(
    ("label", "expected"),
    [("HUMOUR", "playful"), ("playful/humour", "playful"), (" Worried ", "concerned"), ("rage-quit", "neutral"), (None, "neutral")],
)
def test_normalizes_emotion_labels(label, expected):
    assert normalize_emotion(label) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [(0.3, 0.3), (-2, 0.0), (1.5, 0.15), (40, 1.0), ("0.7", 0.7), ("loud", 0.5), (None, 0.5), (True, 0.5), (float("nan"), 0.5)],
)
def test_clamps_intensity(value, expected):
    assert clamp_intensity(value) == pytest.approx(expected)


def test_invalid_voice_style_uses_the_emotions_default():
    reply = parse_reply({"emotion": "sad", "intensity": 0.5, "response": "Oh.", "voiceStyle": "robotic"})
    assert reply.voice_style == "soft"


def test_missing_response_falls_back_safely():
    reply = parse_reply({"emotion": "happy", "intensity": 0.9})
    assert reply.response == FALLBACK_TEXT
    assert reply.emotion in EMOTIONS


@pytest.mark.parametrize("raw", ["", "   ", None, 42, '{"emotion": "happy", "response": "unterminated'])
def test_junk_falls_back_without_reading_braces_aloud(raw):
    reply = parse_reply(raw)
    assert reply.response == FALLBACK_TEXT
    assert "{" not in reply.response


def test_plain_prose_is_kept_as_a_neutral_reply():
    reply = parse_reply("Hello there, nice to meet you.")
    assert reply.emotion == "neutral" and reply.response == "Hello there, nice to meet you."


def test_to_dict_uses_the_api_field_names():
    assert EmotionReply("happy", 0.123456, "hi", "warm").to_dict() == {
        "emotion": "happy",
        "intensity": 0.123,
        "response": "hi",
        "voiceStyle": "warm",
    }


def _reply(emotion, intensity):
    return EmotionReply(emotion, intensity, f"{emotion} reply", "calm")


def test_smoother_blends_intensity_for_the_same_emotion():
    smoother = EmotionSmoother()
    smoother.update(_reply("happy", 0.2))
    assert smoother.update(_reply("happy", 1.0)).intensity == pytest.approx(0.68)


def test_smoother_ignores_a_weak_different_emotion():
    smoother = EmotionSmoother()
    smoother.update(_reply("happy", 0.8))
    smoothed = smoother.update(_reply("nervous", 0.1))
    assert smoothed.emotion == "happy"
    assert smoothed.intensity == pytest.approx(0.6)
    assert smoothed.response == "nervous reply"  # the words still come from the new reply


def test_smoother_switches_on_a_clear_new_emotion():
    smoother = EmotionSmoother()
    smoother.update(_reply("happy", 0.8))
    assert smoother.update(_reply("sad", 0.5)).emotion == "sad"


def test_smoother_lets_a_faded_mood_be_replaced():
    smoother = EmotionSmoother()
    smoother.update(_reply("happy", 0.2))
    assert smoother.update(_reply("curious", 0.2)).emotion == "curious"


def test_smoother_reset_forgets_the_mood():
    smoother = EmotionSmoother()
    smoother.update(_reply("sad", 0.9))
    smoother.reset()
    assert smoother.update(_reply("happy", 0.1)).emotion == "happy"
