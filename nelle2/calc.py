"""Exact arithmetic for questions like "what is 23 * 47" or "15% of 200".

The expression is parsed with `ast` and only numbers, + - * / % ** and sqrt() are allowed, so
nothing the user types is ever executed. Anything else returns None and goes to the AI.
"""

from __future__ import annotations

import ast
import math
import operator
import re
from dataclasses import dataclass

MAX_LENGTH = 120
MAX_EXPONENT = 100
MAX_MAGNITUDE = 1e15

LEAD_IN = re.compile(
    r"^\s*(?:hey nelle[, ]+|nelle[, ]+)?(?:please\s+)?"
    r"(?:what(?:'s|s| is)|calculate|compute|solve|work out|how much is|can you (?:calculate|work out))?\s*(?:the\s+)?",
    re.IGNORECASE,
)
WORDS = (
    (r"\bmultiplied by\b|\btimes\b|×", "*"),
    (r"\bdivided by\b|\bover\b|÷", "/"),
    (r"\bplus\b", "+"),
    (r"\bminus\b|−", "-"),
    (r"\bto the power of\b|\^", "**"),
    (r"\bsquared\b", "**2"),
    (r"\bcubed\b", "**3"),
    (r"\bsquare root of\b|√", "sqrt "),
    (r"\bmod(?:ulo)?\b", "%"),
)
PERCENT_OF = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*", re.IGNORECASE)
X_BETWEEN_NUMBERS = re.compile(r"(?<=[\d)])\s*x\s*(?=[\d(])", re.IGNORECASE)
SQRT_BARE = re.compile(r"sqrt\s+(\d+(?:\.\d+)?)")
ALLOWED = re.compile(r"^[\d\s.+\-*/%()sqrt]+$")
PERCENT_TOKEN = re.compile(r"^\((\d+(?:\.\d+)?)/100\)$")
TOKEN = re.compile(r"\(\d+(?:\.\d+)?/100\)|\d+(?:\.\d+)?|\*\*|sqrt|[-+*/%()]")

BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
SHOWN = {"*": "×", "/": "÷", "-": "−", "**": "^", "sqrt": "√", "%": "mod"}
SPOKEN = {"+": "plus", "-": "minus", "*": "times", "/": "divided by", "%": "mod", "**": "to the power of", "sqrt": "the square root of"}


@dataclass(frozen=True)
class Calculation:
    tokens: tuple[str, ...]  # display tokens, e.g. ("23", "×", "47")
    result: str  # formatted, e.g. "1,081"
    value: float

    @property
    def expression(self) -> str:
        return " ".join(self.tokens)

    def reply(self) -> str:
        return f"{self.spoken()} is {self.result}."

    def spoken(self) -> str:
        words = []
        for token in self.tokens:
            if token in "()":
                continue
            if token.endswith("%"):
                words.append(f"{token[:-1]} percent")
            elif token.startswith("√") and len(token) > 1:
                words.append(f"the square root of {token[1:]}")
            else:
                words.append(SPOKEN.get(_raw(token), token.replace("−", "minus ")))
        return " ".join(words)

    def to_dict(self) -> dict:
        return {"tokens": list(self.tokens), "expression": self.expression, "result": self.result, "value": self.value}


def _raw(shown: str) -> str:
    for raw, symbol in SHOWN.items():
        if shown == symbol:
            return raw
    return shown


def normalize(text: str) -> str | None:
    """Turn a question into a bare arithmetic expression, or None if it isn't one."""
    expr = text.strip().rstrip("?.!= ").replace(",", "")
    expr = LEAD_IN.sub("", expr, count=1)
    expr = PERCENT_OF.sub(lambda m: f"({m.group(1)}/100)*", expr)
    for pattern, symbol in WORDS:
        expr = re.sub(pattern, symbol, expr, flags=re.IGNORECASE)
    expr = X_BETWEEN_NUMBERS.sub("*", expr)
    expr = SQRT_BARE.sub(r"sqrt(\1)", expr)
    expr = re.sub(r"(\d+(?:\.\d+)?)\s*%(?!\s*\d)", r"(\1/100)", expr)  # "20%" alone
    expr = expr.strip()
    if not expr or len(expr) > MAX_LENGTH or not ALLOWED.match(expr):
        return None
    if not re.search(r"\d", expr) or not re.search(r"[-+*/%]|sqrt", expr):
        return None
    return expr


def _evaluate(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _evaluate(node.body)
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _evaluate(node.operand)
        return -value if isinstance(node.op, ast.USub) else value
    if isinstance(node, ast.BinOp) and type(node.op) in BINARY:
        left, right = _evaluate(node.left), _evaluate(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > MAX_EXPONENT:
            raise ValueError("exponent too large")
        result = BINARY[type(node.op)](left, right)
        if isinstance(result, complex) or abs(result) > MAX_MAGNITUDE:
            raise ValueError("result out of range")
        return result
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "sqrt"
        and len(node.args) == 1
        and not node.keywords
    ):
        value = _evaluate(node.args[0])
        if value < 0:
            raise ValueError("square root of a negative number")
        return math.sqrt(value)
    raise ValueError("unsupported expression")


def format_number(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return f"{int(round(value)):,}"
    text = f"{value:,.6f}".rstrip("0").rstrip(".")
    return text


def display_tokens(expr: str) -> tuple[str, ...]:
    """Readable tokens for the animation: 23 × 47, 15% of 200, √ ( 16 ), −5 + 2."""
    tokens = TOKEN.findall(expr)
    shown: list[str] = []
    negate = False
    for i, token in enumerate(tokens):
        previous = tokens[i - 1] if i else None
        if token == "-" and (previous is None or previous in ("+", "-", "*", "/", "%", "(", "**")):
            negate = True
            continue
        percent = PERCENT_TOKEN.match(token)
        if percent:
            token = f"{percent.group(1)}%"
        elif token == "*" and previous and PERCENT_TOKEN.match(previous):
            shown.append("of")
            continue
        else:
            token = SHOWN.get(token, token)
        shown.append(f"−{token}" if negate else token)
        negate = False
    # √ ( 144 ) reads better as √144
    for i in range(len(shown) - 3, -1, -1):
        if shown[i] == "√" and shown[i + 1] == "(" and shown[i + 3] == ")":
            shown[i : i + 4] = [f"√{shown[i + 2]}"]
    return tuple(shown)


def calculate(text: str) -> Calculation | None:
    """Return the exact answer to a plain arithmetic question, or None."""
    expr = normalize(text)
    if expr is None:
        return None
    try:
        value = _evaluate(ast.parse(expr, mode="eval"))
    except (SyntaxError, ValueError, ZeroDivisionError, OverflowError, RecursionError):
        return None
    return Calculation(display_tokens(expr), format_number(value), float(value))
