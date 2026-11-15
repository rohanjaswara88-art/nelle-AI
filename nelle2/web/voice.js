// Voice output (decoded edge-tts audio with a level meter) and voice input (browser speech recognition).

export class VoicePlayer {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.samples = null;
  }

  /** Create the audio context inside a user gesture so the browser lets it play. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.connect(this.ctx.destination);
      this.samples = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  get playing() {
    return Boolean(this.source);
  }

  /** Play base64 MP3. Resolves when it finishes; resolves early (false) if stopped. */
  async play(base64) {
    this.unlock();
    this.stop();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const buffer = await this.ctx.decodeAudioData(bytes.buffer);
    return new Promise((resolve) => {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.analyser);
      source.onended = () => {
        if (this.source === source) this.source = null;
        resolve(true);
      };
      this.finish = () => resolve(false);
      this.startedAt = this.ctx.currentTime;
      this.source = source;
      source.start();
    });
  }

  /** Milliseconds into the current clip. */
  elapsedMs() {
    return this.source ? (this.ctx.currentTime - this.startedAt) * 1000 : 0;
  }

  /** Loudness 0..1 (RMS of the current audio frame). */
  level() {
    if (!this.source) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const s of this.samples) sum += s * s;
    return Math.sqrt(sum / this.samples.length);
  }

  stop() {
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source.disconnect();
    this.finish?.();
  }
}

export class SpeechInput {
  constructor() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    if (!this.supported) return;
    this.recognition = new Recognition();
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.continuous = false;
    this.active = false;
  }

  /** Listen once. Calls onInterim(text) while speaking and resolves with the final text ("" if none). */
  listen(onInterim) {
    return new Promise((resolve, reject) => {
      const r = this.recognition;
      let finalText = "";
      r.onresult = (event) => {
        let interim = "";
        for (const result of event.results) {
          if (result.isFinal) finalText = result[0].transcript;
          else interim += result[0].transcript;
        }
        onInterim(finalText || interim);
      };
      r.onerror = (event) => {
        this.active = false;
        if (event.error === "no-speech" || event.error === "aborted") resolve("");
        else reject(new Error(event.error));
      };
      r.onend = () => {
        this.active = false;
        resolve(finalText.trim());
      };
      this.active = true;
      r.start();
    });
  }

  cancel() {
    if (this.active) this.recognition.abort();
  }
}
