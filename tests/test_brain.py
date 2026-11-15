from brain import Brain, ConversationMemory, OfflineProvider
from emotion import EmotionReply

NOW = "07:30 PM"


class ScriptedProvider:
    name = "scripted"

    def __init__(self, *replies):
        self.replies = list(replies)
        self.seen = []

    def generate(self, messages, mood):
        self.seen.append((list(messages), mood))
        return self.replies.pop(0)


class BrokenProvider:
    name = "broken"

    def generate(self, messages, mood):
        raise RuntimeError("network down")


def test_memory_keeps_the_latest_messages_and_starts_with_the_user():
    memory = ConversationMemory(max_messages=3)
    for i in range(4):
        memory.add("user", f"u{i}")
        memory.add("assistant", f"a{i}")
    messages = memory.messages()
    assert messages[0]["role"] == "user"
    assert [m["content"] for m in messages] == ["u3", "a3"]


def test_brain_sends_the_whole_conversation_and_current_mood():
    provider = ScriptedProvider(EmotionReply("happy", 0.6, "Hi!", "warm"), EmotionReply("happy", 0.6, "Sure.", "warm"))
    brain = Brain(provider)
    brain.respond("hello", NOW)
    brain.respond("can you help me?", NOW)
    messages, mood = provider.seen[1]
    assert [m["content"] for m in messages] == ["hello", "Hi!", "can you help me?"]
    assert mood.emotion == "happy"


def test_brain_falls_back_offline_when_the_model_fails():
    result = Brain(BrokenProvider()).respond("tell me a joke", NOW)
    assert result.source == "offline"
    assert result.reply.emotion == "playful"


def test_commands_still_work_through_chat():
    result = Brain(OfflineProvider()).respond("open youtube", NOW)
    assert result.source == "command"
    assert result.url == "https://youtube.com"


def test_time_command_and_ordinary_sentences_are_told_apart():
    brain = Brain(OfflineProvider())
    assert "07:30 PM" in brain.respond("what time is it", NOW).reply.response
    assert brain.respond("I had a hard time today", NOW).source == "offline"


def test_stop_words_do_not_shut_down_the_web_chat():
    result = Brain(OfflineProvider()).respond("stop", NOW)
    assert result.source == "offline"


def test_reset_clears_memory_and_mood():
    brain = Brain(OfflineProvider())
    brain.respond("I'm so sad", NOW)
    brain.reset()
    assert len(brain.memory) == 0 and brain.smoother.current is None


def test_arithmetic_is_answered_exactly_without_the_model():
    result = Brain(BrokenProvider()).respond("what is 23 * 47", NOW)
    assert result.source == "calc"
    assert result.calc.result == "1,081"
    assert result.reply.response == "23 times 47 is 1,081."
