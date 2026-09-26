import assert from "node:assert/strict";
import {
  actionSound,
  siegeSound,
  setSoundEnabled,
  setSoundVolume,
  unlockSound,
  playSound,
  suspendSound,
  disposeSound,
} from "../lib/game-audio.ts";

// Graph stub verifies lifecycle and limits, not subjective sound quality.
let created = 0;
const param = () => ({
  value: 0,
  setValueAtTime() {},
  exponentialRampToValueAtTime() {},
  linearRampToValueAtTime() {},
  cancelScheduledValues() {},
  setTargetAtTime() {},
});
const node = () => ({
  connect() {},
  disconnect() {},
  gain: param(),
  frequency: param(),
  Q: param(),
  pan: param(),
  threshold: param(),
  knee: param(),
  ratio: param(),
});
class Context {
  constructor() {
    created++;
    Context.current = this;
    this.state = "suspended";
    this.currentTime = 1;
    this.sampleRate = 44100;
    this.destination = node();
  }
  createGain = node;
  createDynamicsCompressor = node;
  createBiquadFilter = node;
  createStereoPanner = node;
  createBuffer() {
    return { getChannelData: () => new Float32Array(44100) };
  }
  createOscillator() {
    return {
      ...node(),
      start() {},
      stop(when) {
        if (when === undefined) this.onended?.();
      },
    };
  }
  createBufferSource() {
    return { ...this.createOscillator(), buffer: null };
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
}
globalThis.window = { AudioContext: Context };
globalThis.document = { hidden: false, documentElement: { dataset: {} } };
const state = document.documentElement.dataset;
await unlockSound();
assert.equal(created, 0, "Muted games must never create an AudioContext");
setSoundEnabled(true);
playSound("build");
assert.equal(created, 0, "World events must not unlock audio");
await unlockSound();
assert.equal(created, 1);
playSound("build");
assert.equal(state.audioCue, "build");
assert.equal(Number(state.audioVoices), 6);
playSound("build");
assert.equal(Number(state.audioVoices), 6, "Duplicate cues are throttled");
for (let i = 0; i < 20; i++) {
  Context.current.currentTime++;
  playSound("impact");
}
assert.equal(
  Number(state.audioVoices),
  40,
  "Overlapping effects have a fixed voice budget",
);
setSoundEnabled(false);
assert.equal(
  Number(state.audioVoices),
  0,
  "Mute stops queued and current voices",
);
setSoundEnabled(true);
setSoundVolume(0);
playSound("build");
assert.equal(Number(state.audioVoices), 0);
setSoundVolume(0.6);
document.hidden = true;
playSound("build");
assert.equal(Number(state.audioVoices), 0, "Hidden pages stay silent");
suspendSound();
assert.equal(Context.current.state, "suspended");
document.hidden = false;
await unlockSound();
assert.equal(created, 1, "A gesture resumes the same context");
playSound("step");
assert.equal(Number(state.audioVoices), 2);
disposeSound();
assert.equal(Context.current.state, "closed");
assert.equal(Number(state.audioVoices), 0);
assert.equal(actionSound({ type: "attack" }), null);
assert.equal(actionSound({ type: "build", building: "walls" }), "stone");
assert.equal(siegeSound("ballista"), "ballista");
assert.equal(siegeSound("goatapult"), "goat");
assert.equal(siegeSound("arcane"), "magic");
console.log(
  "Audio checked: gesture unlock, voice cap, throttling, mute, zero volume, hidden tabs, cleanup and event mapping.",
);
