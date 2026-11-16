// Hand gestures: the laptop camera, MediaPipe Hand Landmarker and the gesture registry.
//
// Everything runs in this browser tab. Camera frames go from the <video> element straight into
// MediaPipe's WebAssembly/WebGL model and are never uploaded, sent to Nelle's server or saved.
// The only downloads are the MediaPipe library and the hand model, fetched once.
//
// To add a gesture: write a pose rule in poses.js, add { name, detect } to GESTURES below,
// and map the name to an animation in app.js.

import {
  FINGER_DEAD_ZONE,
  FINGER_SMOOTHING,
  MotionFilter,
  PoseGate,
  fingerStates,
  indexTip,
  isFive,
  isPoint,
  isThumbsUp,
  isTwo,
} from "./poses.js";

const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const VIDEO = { width: 640, height: 480 };
const PREVIEW_WIDTH = 160;
const MIN_CONFIDENCE = 0.7;
// Detect on every other frame (~30 fps). If a detection costs more than this many ms on this
// machine, back off to every third frame so the sphere's 60 fps animation never stutters.
const SLOW_DETECT_MS = 12;
// Following starts after the index points for this many detections in a row, and stops after
// this many without, so a flicker of the pose neither starts nor breaks it.
const POINT_START_FRAMES = 3;
const POINT_STOP_FRAMES = 6;

/** The gesture registry. Order matters only when two rules could match; the rules are mutually exclusive. */
export const GESTURES = [
  { name: "thumbsUp", detect: isThumbsUp },
  { name: "five", detect: isFive },
  { name: "two", detect: isTwo },
];

/** The registered gesture this hand is making, or null. `hand` is 21 mirrored landmarks. */
export function classifyPose(hand, aspect = VIDEO.width / VIDEO.height) {
  const states = fingerStates(hand, aspect);
  return GESTURES.find((gesture) => gesture.detect(hand, states, aspect))?.name ?? null;
}

// pairs of landmark indices joined in the preview
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

let landmarkerPromise = null;

/** Load MediaPipe once: GPU first, CPU if the GPU delegate can't start. */
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import(`${VISION}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: MIN_CONFIDENCE,
      minHandPresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: 0.5,
    });
    try {
      return await HandLandmarker.createFromOptions(files, options("GPU"));
    } catch (error) {
      console.warn("Hand tracking: GPU delegate unavailable, using CPU.", error);
      return HandLandmarker.createFromOptions(files, options("CPU"));
    }
  })();
  landmarkerPromise.catch(() => (landmarkerPromise = null)); // let a later try load it again
  return landmarkerPromise;
}

export class CameraError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code; // "denied" | "no-camera" | "unsupported" | "model"
    this.cause = cause;
  }
}

/**
 * Watches one hand through the camera. Call tick(now) once per animation frame (from stage.onFrame);
 * it runs detection on every other frame. Events:
 *   gesture  { name }                       a registered pose was held (debounced, see PoseGate)
 *   move     { x, y, vx, vy, wave } | null  index fingertip in 0..1 screen space (mirrored), per
 *                                           second, only while pointing; null when not following
 *   pose     { pose, states, score } | null every detection, for the debug overlay
 */
export class GestureTracker {
  constructor(previewRoot) {
    this.preview = previewRoot;
    this.canvas = previewRoot.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.listeners = {};
    this.gate = new PoseGate();
    this.filter = new MotionFilter({ smoothing: FINGER_SMOOTHING, deadZone: FINGER_DEAD_ZONE });
    this.following = false;
    this.pointStreak = 0;
    this.pointMiss = 0;
    this.running = false;
    this.frame = 0;
    this.every = 2;
    this.detectMs = 8;
    this.showVideo = true;
    this.lastVideoTime = -1;
    this.lastHand = null;
    this.quietUntil = 0;
    previewRoot.addEventListener("click", () => {
      this.showVideo = !this.showVideo;
      previewRoot.classList.toggle("video-off", !this.showVideo);
    });
    document.addEventListener("visibilitychange", () => {
      // tracking pauses with the hidden tab's animation loop; start fresh when it comes back
      if (!document.hidden) this.resetTracking();
    });
  }

  on(event, listener) {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }

  emit(event, data) {
    for (const listener of this.listeners[event] ?? []) listener(data);
  }

  /** Ignore gestures for a moment, e.g. while the user is typing. */
  quiet(ms) {
    this.quietUntil = Math.max(this.quietUntil, performance.now() + ms);
  }

  resetTracking() {
    this.gate.reset();
    this.filter.reset();
    this.following = false;
    this.pointStreak = 0;
    this.pointMiss = 0;
    this.emit("move", null);
  }

  /** Point with the index finger to be followed; stop pointing (or leave) to let go. */
  updateFollow(hand, states, now) {
    const pointing = Boolean(hand) && isPoint(hand, states);
    this.pointStreak = pointing ? this.pointStreak + 1 : 0;
    this.pointMiss = pointing ? 0 : this.pointMiss + 1;
    if (!this.following && this.pointStreak >= POINT_START_FRAMES) this.following = true;
    if (this.following && this.pointMiss >= POINT_STOP_FRAMES) {
      this.following = false;
      this.filter.reset();
      this.emit("move", null);
    }
    if (this.following && hand) this.emit("move", this.filter.update(indexTip(hand), now));
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: VIDEO.width }, height: { ideal: VIDEO.height } },
        audio: false,
      });
    } catch (error) {
      const code = error.name === "NotAllowedError" || error.name === "SecurityError" ? "denied" : "no-camera";
      throw new CameraError(code, error);
    }
    let landmarker;
    try {
      landmarker = await loadLandmarker();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw new CameraError("model", error);
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // the first detection compiles the GPU shaders (seconds on some machines); do it now, while the
    // button says "Starting…", rather than as a freeze in the middle of a gesture
    await new Promise((resolve) => (video.readyState >= 2 ? resolve() : video.addEventListener("loadeddata", resolve, { once: true })));
    try {
      landmarker.detectForVideo(video, performance.now());
    } catch (error) {
      console.warn("Hand tracking warm-up failed:", error);
    }
    this.stream = stream;
    this.video = video;
    this.landmarker = landmarker;
    this.running = true;
    this.lastVideoTime = -1;
    this.resetTracking();
    this.preview.hidden = false;
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.lastHand = null;
    this.preview.hidden = true;
    this.resetTracking();
    this.emit("pose", null);
  }

  /** Called every animation frame; detects on every other one (~30 fps). */
  tick(now) {
    if (!this.running || document.hidden) return;
    this.frame += 1;
    if (this.frame % this.every) return;
    const video = this.video;
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    let result;
    try {
      const started = performance.now();
      result = this.landmarker.detectForVideo(video, now);
      this.detectMs += (performance.now() - started - this.detectMs) * 0.1;
      this.every = this.detectMs > SLOW_DETECT_MS ? 3 : 2;
    } catch (error) {
      console.warn("Hand tracking frame failed:", error);
      return;
    }
    const raw = result.landmarks?.[0];
    const score = result.handedness?.[0]?.[0]?.score ?? 0;
    const hand = raw ? raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) : null; // mirror: your right is screen right
    this.lastHand = hand;

    const aspect = video.videoWidth / video.videoHeight || VIDEO.width / VIDEO.height;
    const states = hand ? fingerStates(hand, aspect) : null;
    const pose = hand ? classifyPose(hand, aspect) : null;
    const quiet = now < this.quietUntil;
    const fired = this.gate.update(quiet ? null : pose, score, now);
    if (fired) this.emit("gesture", { name: fired });
    this.updateFollow(hand, states, now);
    this.emit("pose", hand ? { pose, states, score, quiet, following: this.following, detectMs: this.detectMs } : null);
    this.drawPreview(hand, aspect);
  }

  drawPreview(hand, aspect) {
    const { canvas, ctx, video } = this;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const width = PREVIEW_WIDTH;
    const height = Math.round(width / aspect);
    if (canvas.width !== width * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this.showVideo) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1); // a mirror, like a selfie camera
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
    }
    if (!hand) return;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 120, 220, 0.9)";
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(hand[a].x * width, hand[a].y * height);
      ctx.lineTo(hand[b].x * width, hand[b].y * height);
    }
    ctx.stroke();
    ctx.fillStyle = "#ffd6f3";
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
