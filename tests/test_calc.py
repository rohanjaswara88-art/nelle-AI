import pytest

from calc import calculate


@pytest.mark.parametrize(
    ("question", "tokens", "result"),
    [
        ("what is 23 * 47", ("23", "×", "47"), "1,081"),
        ("whats 2+2?", ("2", "+", "2"), "4"),
        ("calculate 12.5 divided by 4", ("12.5", "÷", "4"), "3.125"),
        ("what is 3 x 4 plus 2", ("3", "×", "4", "+", "2"), "14"),
        ("15% of 200", ("15%", "of", "200"), "30"),
        ("square root of 144", ("√144",), "12"),
        ("what is the square root of 144 plus 8", ("√144", "+", "8"), "20"),
        ("2 to the power of 10", ("2", "^", "10"), "1,024"),
        ("-5 + 2", ("−5", "+", "2"), "-3"),
        ("(3+4)*2", ("(", "3", "+", "4", ")", "×", "2"), "14"),
        ("1,000 * 3", ("1000", "×", "3"), "3,000"),
        ("100 mod 7", ("100", "mod", "7"), "2"),
        ("sqrt(2)", ("√2",), "1.414214"),
    ],
)
def test_calculates_exactly(question, tokens, result):
    calc = calculate(question)
    assert calc is not None
    assert calc.tokens == tokens
    assert calc.result == result


@pytest.mark.parametrize(
    "text",
    ["hello", "I have 2 cats", "what time is it", "tell me a joke", "10/0", "2**999999", "sqrt(-4)", "__import__('os')", "2 + ", "9" * 200],
)
def test_ignores_non_arithmetic_and_unsafe_input(text):
    assert calculate(text) is None


def test_spoken_reply_reads_naturally():
    assert calculate("what is 23 * 47").reply() == "23 times 47 is 1,081."
    assert calculate("15% of 200").reply() == "15 percent of 200 is 30."
    assert calculate("square root of 144").reply() == "the square root of 144 is 12."
