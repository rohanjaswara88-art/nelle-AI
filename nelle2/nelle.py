import datetime
import webbrowser

import pyttsx3
import speech_recognition as sr

from commands import match_command


def speak(text):
    print("Jarvis:", text)
    engine = pyttsx3.init("sapi5")
    engine.setProperty("rate", 170)
    engine.setProperty("volume", 1.0)
    engine.say(text)
    engine.runAndWait()


def take_command():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("\nListening...")
        recognizer.adjust_for_ambient_noise(source, duration=0.5)
        recognizer.pause_threshold = 0.8
        audio = recognizer.listen(source)

    try:
        print("Recognizing...")
        command = recognizer.recognize_google(audio)
        print("You said:", command)
        return command.lower().strip()
    except sr.UnknownValueError:
        speak("Sorry sir, I didn't understand that.")
        return ""
    except sr.RequestError:
        speak("Sorry sir, the speech recognition service is unavailable.")
        return ""


def main():
    speak("Jarvis online and ready")
    while True:
        command = take_command()
        if not command:
            continue

        now = datetime.datetime.now().strftime("%I:%M %p")
        action = match_command(command, now)
        speak(action.reply)
        if action.url:
            webbrowser.open(action.url)
        if action.stop:
            break


if __name__ == "__main__":
    main()
