import asyncio
import edge_tts

async def main():
    tts = edge_tts.Communicate("Hello, this is Jarvis voice test", "en-US-AriaNeural")
    await tts.save("test.mp3")

asyncio.run(main())