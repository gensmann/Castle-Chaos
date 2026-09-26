import type { Action, Battle } from "./game";

export type SoundCue =
  | "click"
  | "step"
  | "hammer"
  | "build"
  | "stone"
  | "craft"
  | "settle"
  | "recruit"
  | "feast"
  | "turn"
  | "quest"
  | "error"
  | "launch"
  | "ballista"
  | "goat"
  | "magic"
  | "impact";
let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = false;
let volume = 0.6;
const voices = new Set<AudioScheduledSourceNode>();
const lastCue = new Map<SoundCue, number>();
const MAX_VOICES = 40;

function status(cue?: SoundCue) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.audioState = !enabled
    ? "muted"
    : (context?.state ?? "awaiting-gesture");
  document.documentElement.dataset.audioVoices = String(voices.size);
  if (cue) document.documentElement.dataset.audioCue = cue;
}
function silence() {
  for (const voice of voices) {
    try {
      voice.stop();
    } catch {
      /* Already ended. */
    }
  }
  lastCue.clear();
}
function gain() {
  if (!context || !master) return;
  master.gain.cancelScheduledValues(context.currentTime);
  master.gain.setTargetAtTime(
    enabled ? volume * 0.32 : 0,
    context.currentTime,
    0.015,
  );
}
export function setSoundEnabled(value: boolean) {
  enabled = value;
  if (!enabled) silence();
  gain();
  status();
}
export function setSoundVolume(value: number) {
  volume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.6));
  gain();
  if (volume === 0) silence();
}
/** Called only by a pointer/key gesture. Saved preferences never autoplay. */
export async function unlockSound() {
  if (!enabled || document.hidden) return;
  try {
    if (!context) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      context = new Ctx();
      master = context.createGain();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      master.connect(limiter);
      limiter.connect(context.destination);
      gain();
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
    }
    if (context.state === "suspended") await context.resume();
    if (document.hidden) suspendSound();
    status();
  } catch {
    /* Devices without audio remain playable. */
  }
}
export function suspendSound() {
  silence();
  if (context?.state === "running")
    void context
      .suspend()
      .then(() => status())
      .catch(() => {});
}
export function disposeSound() {
  silence();
  const old = context;
  context = null;
  master = null;
  noise = null;
  voices.clear();
  if (old) void old.close().catch(() => {});
  status();
}

/** Short layered, band-limited Foley. No downloads, timers, or perpetual loops. */
export function playSound(cue: SoundCue, strength = 1, pan = 0) {
  const ctx = context;
  if (
    !enabled ||
    volume === 0 ||
    !ctx ||
    ctx.state !== "running" ||
    !master ||
    document.hidden
  )
    return;
  const now = ctx.currentTime;
  const gap =
    cue === "step"
      ? 0.22
      : cue === "hammer"
        ? 1.4
        : cue === "click"
          ? 0.06
          : 0.08;
  if (now - (lastCue.get(cue) ?? -Infinity) < gap) return;
  lastCue.set(cue, now);
  const output = master;
  const level = Math.max(0, Math.min(1, strength));
  function voice(
    kind: OscillatorType | "noise",
    hz: number,
    endHz: number,
    duration: number,
    amplitude: number,
    delay = 0,
  ) {
    if (voices.size >= MAX_VOICES) return;
    const start = now + delay;
    const source =
      kind === "noise" ? ctx!.createBufferSource() : ctx!.createOscillator();
    if ("buffer" in source) source.buffer = noise;
    else {
      source.type = kind as OscillatorType;
      source.frequency.setValueAtTime(hz, start);
      source.frequency.exponentialRampToValueAtTime(
        Math.max(20, endHz),
        start + duration,
      );
    }
    const filter = ctx!.createBiquadFilter();
    filter.type = kind === "noise" ? "bandpass" : "lowpass";
    filter.frequency.value = kind === "noise" ? hz : 3500;
    filter.Q.value = kind === "noise" ? 0.7 : 0.5;
    const envelope = ctx!.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(
      Math.max(0.0001, amplitude * level),
      start + 0.004,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    const stereo = ctx!.createStereoPanner();
    stereo.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(stereo);
    stereo.connect(output);
    voices.add(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      stereo.disconnect();
      voices.delete(source);
      status();
    };
    source.start(start);
    source.stop(start + duration + 0.015);
  }
  const knock = (delay: number, pitch = 190, amount = 0.3) => {
    voice("sine", pitch, pitch * 0.6, 0.11, amount, delay);
    voice("noise", 1100, 1100, 0.065, amount * 0.6, delay);
  };
  const chime = (notes: number[], spacing = 0.1) =>
    notes.forEach((hz, i) => {
      voice("sine", hz, hz, 0.38, 0.16, i * spacing);
      voice("sine", hz * 2.01, hz * 2.01, 0.14, 0.04, i * spacing);
    });
  switch (cue) {
    case "click":
      knock(0, 420, 0.16);
      break;
    case "step":
      voice("noise", 650, 650, 0.08, 0.15);
      voice("sine", 105, 65, 0.065, 0.11);
      break;
    case "hammer":
      knock(0, 480, 0.14);
      voice("sine", 1350, 1100, 0.18, 0.07);
      break;
    case "build":
      [0, 0.14, 0.32].forEach((t, i) => knock(t, 180 + i * 45));
      break;
    case "stone":
      voice("noise", 700, 700, 0.35, 0.38);
      knock(0.08, 105, 0.45);
      knock(0.22, 160, 0.2);
      break;
    case "craft":
      knock(0, 440);
      knock(0.16, 650);
      chime([880, 1174], 0.22);
      break;
    case "settle":
      knock(0, 130);
      chime([262, 330, 392, 524], 0.13);
      break;
    case "recruit":
      chime([392, 494, 587]);
      break;
    case "feast":
      chime([1047, 1319, 1568], 0.07);
      voice("noise", 2200, 2200, 0.35, 0.1, 0.15);
      break;
    case "turn":
      chime([330, 440, 660], 0.13);
      break;
    case "quest":
      voice("noise", 1800, 1800, 0.17, 0.18);
      chime([440, 587]);
      break;
    case "error":
      voice("triangle", 190, 135, 0.16, 0.15);
      break;
    case "launch":
      knock(0, 90, 0.6);
      voice("triangle", 150, 45, 0.45, 0.18);
      voice("noise", 800, 800, 0.48, 0.45, 0.035);
      break;
    case "ballista":
      voice("triangle", 440, 60, 0.25, 0.28);
      voice("noise", 2600, 2600, 0.2, 0.3);
      break;
    case "goat":
      voice("triangle", 310, 170, 0.34, 0.22);
      voice("triangle", 280, 360, 0.25, 0.16, 0.18);
      knock(0, 90, 0.45);
      break;
    case "magic":
      [0, 0.08, 0.16].forEach((t, i) =>
        voice("sine", 330 * (i + 1), 1600, 0.55, 0.15, t),
      );
      voice("noise", 2400, 2400, 0.55, 0.15);
      break;
    case "impact":
      voice("sine", 95, 28, 0.65, 0.8);
      voice("noise", 320, 320, 0.55, 0.65);
      [0.07, 0.17, 0.3, 0.43].forEach((t, i) => knock(t, 160 + i * 70, 0.16));
      break;
  }
  status(cue);
}
export function actionSound(action: Action): SoundCue | null {
  switch (action.type) {
    case "attack":
      return null; // Launch and impact follow the actual replay.
    case "build":
      return action.building === "walls" || action.building === "quarry"
        ? "stone"
        : "build";
    case "repair":
      return "stone";
    case "craft":
      return "craft";
    case "settle":
      return "settle";
    case "recruit":
      return "recruit";
    case "feast":
      return "feast";
    case "quest":
      return "quest";
    case "end":
    case "start":
    case "start-bots":
      return "turn";
    default:
      return "click";
  }
}
export function siegeSound(weapon: Battle["weapon"]): SoundCue {
  return weapon === "ballista"
    ? "ballista"
    : weapon === "goatapult"
      ? "goat"
      : weapon === "arcane" || weapon === "scientist"
        ? "magic"
        : "launch";
}
