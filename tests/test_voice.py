from voice import clean_for_speech, prosody_for


def test_neutral_prosody_is_the_calm_base_voice():
    assert prosody_for("neutral", 0.5) == prosody_for("casual", 1.0)
    assert prosody_for("neutral", 0.5).pitch == "+0Hz"


def test_emotions_shift_delivery_gently():
    sad, excited = prosody_for("sad", 1.0), prosody_for("excited", 1.0)
    assert sad.rate == "-16%" and sad.pitch == "-4Hz"
    assert excited.rate == "+6%" and excited.pitch == "+5Hz"


def test_low_intensity_softens_the_shift():
    assert prosody_for("excited", 0.0).rate == "+0%"
    assert prosody_for("unknown-mood", 0.9).pitch == "+0Hz"


def test_markdown_is_not_read_aloud():
    assert clean_for_speech("Use **`map()`** here, see [docs](http://x).\n```py\nx=1\n```") == "Use map() here, see docs."
