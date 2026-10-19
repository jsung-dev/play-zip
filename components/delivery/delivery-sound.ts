// Tiny synthesized sound set (no audio files, nothing to license) plus phone
// vibration. One on/off switch for both, remembered on this device.
type Sfx = "jump" | "land" | "hit" | "deliver" | "correct";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let musicTimer: number | null = null;

try { enabled = localStorage.getItem("delivery-sound") !== "off"; } catch { /* storage blocked: default on */ }

export const soundEnabled = () => enabled;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem("delivery-sound", on ? "on" : "off"); } catch { /* not persisted */ }
  if (!on) stopMusic();
}

/** Browsers only allow audio after a tap; call from a user gesture. */
export function unlockSound() {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!context) {
    context = new Ctor();
    master = context.createGain(); master.gain.value = .5; master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
}

function tone(frequency: number, endFrequency: number, start: number, length: number, type: OscillatorType, volume: number) {
  if (!context || !master) return;
  const osc = context.createOscillator(), gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.frequency.exponentialRampToValueAtTime(endFrequency, start + length);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(.0001, start + length);
  osc.connect(gain).connect(master);
  osc.start(start); osc.stop(start + length + .02);
}

const VIBRATION: Record<Sfx, number | number[]> = { jump: 12, land: 22, hit: 60, deliver: [30, 40, 30], correct: 20 };

export function playSfx(name: Sfx) {
  if (!enabled) return;
  try { navigator.vibrate?.(VIBRATION[name]); } catch { /* unsupported (e.g. iPhone) */ }
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  if (name === "jump") tone(380, 880, now, .16, "triangle", .22);
  else if (name === "land") tone(150, 60, now, .12, "sine", .3);
  else if (name === "hit") { tone(220, 70, now, .22, "square", .12); tone(110, 50, now, .25, "sine", .25); }
  else if (name === "deliver") { tone(1319, 1319, now, .25, "sine", .2); tone(1047, 1047, now + .22, .4, "sine", .2); }
  else { [523, 659, 784].forEach((f, n) => tone(f, f, now + n * .08, .2, "triangle", .16)); }
}

// Light looping tune: C-major arpeggio over a soft bass, quiet under the effects.
const MELODY = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047, 988, 784, 659, 587];
const BASS = [131, 131, 147, 147, 131, 131, 196, 196];
export function startMusic() {
  if (!enabled || musicTimer !== null || !context) return;
  let step = 0, next = context.currentTime + .05;
  const beat = .26;
  musicTimer = window.setInterval(() => {
    if (!context || context.state !== "running") return;
    while (next < context.currentTime + .3) {
      tone(MELODY[step % MELODY.length], MELODY[step % MELODY.length], next, beat * .9, "triangle", .045);
      if (step % 2 === 0) tone(BASS[(step / 2) % BASS.length], BASS[(step / 2) % BASS.length], next, beat * 1.8, "sine", .06);
      step++; next += beat;
    }
  }, 100);
}

export function stopMusic() {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
}
