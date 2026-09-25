import speech_recognition as sr
import pyttsx3
import webbrowser
import datetime
import urllib.parse



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

        recognizer.adjust_for_ambient_noise(
            source,
            duration=0.5
        )

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




def google_search(query):

    encoded_query = urllib.parse.quote(query)

    url = "https://www.google.com/search?q=" + encoded_query

    webbrowser.open(url)



def youtube_search(query):

    encoded_query = urllib.parse.quote(query)

    url = "https://www.youtube.com/results?search_query=" + encoded_query

    webbrowser.open(url)



speak("Jarvis online and ready")




while True:

    command = take_command()

    if not command:
        continue


    
    if "open youtube" in command:

        speak("Opening YouTube for you sir")

        webbrowser.open("https://youtube.com")


    

    elif "search youtube for" in command:

        query = command.replace(
            "search youtube for",
            ""
        ).strip()

        if query:

            speak(
                "Searching YouTube for "
                + query
                + " sir"
            )

            youtube_search(query)

        else:

            speak("What should I search for?")


    
    elif "open google" in command:

        speak("Opening Google for you sir")

        webbrowser.open("https://google.com")


    
    elif "search google for" in command:

        query = command.replace(
            "search google for",
            ""
        ).strip()

        if query:

            speak(
                "Searching Google for "
                + query
                + " sir"
            )

            google_search(query)

        else:

            speak("What should I search for?")


    

    elif "open chat" in command or "open chatgpt" in command:

        speak("Opening ChatGPT for you sir")

        webbrowser.open("https://chatgpt.com")

    elif "time" in command:

        now = datetime.datetime.now().strftime(
            "%I:%M %p"
        )

        speak(
            "Sir, the current time is "
            + now
        )


    

    elif "rohan" in command:

        speak(
            "Rohan is my creator. "
            "He is currently learning "
            "artificial intelligence and machine learning."
        )


   
    elif (
        "stop" in command
        or "exit" in command
        or "shutdown" in command
    ):

        speak("Shutting down Jarvis. Goodbye sir.")

        break


    
    else:

        speak(
            "Sorry sir, I don't understand that command."
        )