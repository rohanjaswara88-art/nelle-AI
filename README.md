# Nelle AI: voice assistant

A voice-controlled personal assistant written in Python. Speak a command and it answers you out loud: it opens websites, searches Google and YouTube for you, and tells you the time.

> Built by [Rohan Jaswara](https://rohanjaswara88-art.github.io/portfolio/), a BCA (AI & ML) student, while learning speech recognition and text-to-speech.

## What it can do

| Say something like | What happens |
|---|---|
| "open YouTube" | Opens youtube.com |
| "search YouTube for lo-fi music" | Opens YouTube search results for "lo-fi music" |
| "open Google" | Opens google.com |
| "search Google for python tutorials" | Opens Google results for "python tutorials" |
| "open ChatGPT" | Opens chatgpt.com |
| "what's the time" | Tells you the current time |
| "who is Rohan" | Introduces its creator |
| "stop" / "exit" / "shutdown" | Says goodbye and closes |

Anything it doesn't recognise gets a polite "I don't understand that command", and it keeps listening.

## How it works

1. **Listen:** `speech_recognition` records from the microphone, adjusting for background noise first.
2. **Understand:** the audio is turned into text with Google's speech recognition, then lower-cased and matched against the commands above.
3. **Act:** websites and searches open in your default browser (`webbrowser`, with the query URL-encoded).
4. **Reply:** `pyttsx3` speaks the answer using the Windows voice engine (SAPI5), so replies work offline.

`main.py` is a small experiment with `edge-tts`, a more natural-sounding neural voice, saved to `test.mp3`.

## Run it

Needs Python 3, a microphone and Windows (for the SAPI5 voice).

```bash
pip install SpeechRecognition pyttsx3 pyaudio
python nelle2/nelle.py
```

Wait for "Jarvis online and ready", then speak. Speech recognition needs an internet connection.

## Project structure

```
nelle2/
  nelle.py    the assistant: listen, match a command, act, speak
  main.py     edge-tts neural voice test
  test.mp3    sample output of main.py
  voice.mp3   sample voice clip
```

## Ideas for next steps

- Answer open questions with a language model instead of fixed commands
- A wake word, so it only listens after "Hey Nelle"
- Weather, reminders and opening local apps
- Switch replies to the neural `edge-tts` voice

## Tech

Python · SpeechRecognition · pyttsx3 · edge-tts · webbrowser
