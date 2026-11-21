import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from brain import Brain, OfflineProvider
from refine import MAX_SUGGESTIONS, claude_suggestions, clean, offline_suggestions, tidy
from server import create_app


def test_tidy_fixes_shorthand_capitalises_and_punctuates():
    assert tidy("wat is recursion") == "What is recursion?"
    assert tidy("i dont understand u") == "I don't understand you."
    assert tidy("  explain   pyhton  ") == "Explain python."


def test_tidy_leaves_words_that_only_contain_shorthand_alone():
    assert tidy("user id in python") == "User id in python."
    assert tidy("ultimate guide") == "Ultimate guide."


def test_offline_suggestions_offer_clearer_versions_of_a_question():
    suggestions = offline_suggestions("wat is recursion")
    assert suggestions[0] == "What is recursion?"
    assert any("example" in s for s in suggestions)
    assert any("step by step" in s for s in suggestions)
    assert len(suggestions) <= MAX_SUGGESTIONS


def test_offline_suggestions_turn_confusion_into_a_request():
    suggestions = offline_suggestions("i dont understand how u do binary search")
    assert "Can you explain how you do binary search in simple words, with one example?" in suggestions


def test_offline_suggestions_drop_please_from_the_subject():
    suggestions = offline_suggestions("explain pyhton decorators pls")
    assert "Explain python decorators step by step, as if I'm a beginner." in suggestions


def test_offline_suggestions_never_repeat_the_draft_or_each_other():
    for draft in ["How far is Mars?", "tell me a joke", "Can you explain recursion?"]:
        suggestions = offline_suggestions(draft)
        keys = [s.lower() for s in suggestions]
        assert len(keys) == len(set(keys))
        assert draft not in suggestions


def test_clean_strips_quotes_and_limits_the_count():
    assert clean(['"One."', "One.", "", "Two.", "Three.", "Four."], "draft") == ["One.", "Two.", "Three."]


def fake_client(payload, stop_reason="end_turn"):
    response = SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=json.dumps(payload))])
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return response

    return SimpleNamespace(messages=SimpleNamespace(create=create)), calls


def test_claude_suggestions_reads_structured_output():
    client, calls = fake_client({"suggestions": ["What is recursion?", "Explain recursion with an example."]})
    assert claude_suggestions(client, "wat is recursion") == ["What is recursion?", "Explain recursion with an example."]
    assert calls[0]["output_config"]["format"]["type"] == "json_schema"
    assert "wat is recursion" in calls[0]["messages"][0]["content"]


def test_claude_suggestions_returns_nothing_on_refusal():
    client, _ = fake_client({"suggestions": []}, stop_reason="refusal")
    assert claude_suggestions(client, "anything at all") == []


class BrokenModel(OfflineProvider):
    name = "claude"

    def suggest(self, draft):
        raise RuntimeError("network down")


class EmptyModel(OfflineProvider):
    name = "claude"

    def suggest(self, draft):
        return []


def test_brain_falls_back_to_offline_suggestions_when_the_model_fails_or_says_nothing():
    for provider in (BrokenModel(), EmptyModel()):
        suggestions, source = Brain(provider).suggest("wat is recursion")
        assert source == "offline"
        assert suggestions[0] == "What is recursion?"


def test_refine_endpoint_returns_suggestions_offline():
    client = TestClient(create_app(Brain(OfflineProvider())))
    data = client.post("/api/refine", json={"text": "wat is recursion"}).json()
    assert data["source"] == "offline"
    assert data["suggestions"][0] == "What is recursion?"


def test_refine_endpoint_skips_short_drafts_and_rejects_bad_input():
    client = TestClient(create_app(Brain(OfflineProvider())))
    assert client.post("/api/refine", json={"text": "hi"}).json() == {"suggestions": [], "source": "none"}
    assert client.post("/api/refine", json={"text": ""}).status_code == 422
    assert client.post("/api/refine", json={"text": "x" * 501}).status_code == 422


def test_refine_does_not_touch_the_conversation_memory():
    brain = Brain(OfflineProvider())
    TestClient(create_app(brain)).post("/api/refine", json={"text": "wat is recursion"})
    assert len(brain.memory) == 0
