from fastapi.testclient import TestClient

from brain import Brain, OfflineProvider
from server import create_app


def make_client():
    return TestClient(create_app(Brain(OfflineProvider())))


def test_index_serves_the_ui():
    response = make_client().get("/")
    assert response.status_code == 200
    assert "Nelle" in response.text


def test_chat_returns_a_structured_emotional_reply():
    data = make_client().post("/api/chat", json={"message": "I don't understand recursion at all"}).json()
    assert set(data) >= {"emotion", "intensity", "response", "voiceStyle", "source", "memory"}
    assert data["emotion"] == "confused"
    assert 0 <= data["intensity"] <= 1


def test_chat_rejects_empty_and_oversized_messages():
    client = make_client()
    assert client.post("/api/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/chat", json={"message": "   "}).status_code == 422
    assert client.post("/api/chat", json={"message": "x" * 2001}).status_code == 422


def test_reset_empties_memory():
    client = make_client()
    client.post("/api/chat", json={"message": "hello"})
    assert client.get("/api/status").json()["memory"] == 2
    client.post("/api/reset")
    assert client.get("/api/status").json() == {"provider": "offline", "memory": 0}


def test_chat_returns_calculation_details():
    data = make_client().post("/api/chat", json={"message": "what is 15% of 200"}).json()
    assert data["source"] == "calc"
    assert data["calc"] == {"tokens": ["15%", "of", "200"], "expression": "15% of 200", "result": "30", "value": 30.0}
    assert make_client().post("/api/chat", json={"message": "hello"}).json()["calc"] is None
