"use client";

let audio: AudioContext | null = null;
let hapticLabel: HTMLLabelElement | null = null;

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

function unlockAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx && !audio) audio = new Ctx();
    if (audio && audio.state !== "running") void audio.resume();
  } catch {
    audio = null;
  }
}

// iOS only lets audio start inside a real tap. React effects run after the tap, so unlock on the tap itself
// (e.g. the "Scan books" button) via a capturing listener.
if (typeof document !== "undefined") {
  const onTap = () => {
    if (audio?.state === "running") return;
    unlockAudio();
  };
  document.addEventListener("touchend", onTap, { capture: true, passive: true });
  document.addEventListener("click", onTap, { capture: true, passive: true });
}

/** Call when the scanner opens. */
export function primeScanFeedback() {
  if (typeof window === "undefined") return;
  // iOS mutes Web Audio when the ring/silent switch is on; the "playback" session plays through it (Safari 17+).
  const nav = navigator as AudioSessionNav;
  if (nav.audioSession && soundEnabled()) {
    try {
      nav.audioSession.type = "playback";
    } catch {
      /* unsupported */
    }
  }
  unlockAudio();
  if (!hapticLabel) {
    // iOS Safari has no Vibration API; toggling a native <input switch> fires the system haptic (iOS 18+).
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = "scan-haptic";
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    label.appendChild(input);
    document.body.appendChild(label);
    hapticLabel = label;
  }
}

/** Hand the audio session back (so music/podcasts aren't affected) once the scanner closes. */
export function releaseScanFeedback() {
  const nav = typeof navigator === "undefined" ? null : (navigator as AudioSessionNav);
  if (nav?.audioSession) {
    try {
      nav.audioSession.type = "auto";
    } catch {
      /* unsupported */
    }
  }
}

/** Phones without the Vibration API (iPhone): websites can only vibrate on a real finger tap. */
export function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function soundEnabled() {
  return typeof localStorage === "undefined" || localStorage.getItem("scan-sound") !== "off";
}

export function setSoundEnabled(on: boolean) {
  localStorage.setItem("scan-sound", on ? "on" : "off");
}

function tone(freq: number, start: number, dur: number) {
  const osc = audio!.createOscillator();
  const gain = audio!.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
  gain.gain.setValueAtTime(0.35, start + dur - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(audio!.destination);
  osc.start(start);
  osc.stop(start + dur + 0.01);
}

/** A two-note "beep-beep" like a store scanner — easy to hear over a room. */
function beep() {
  if (!audio || !soundEnabled()) return;
  if (audio.state !== "running") void audio.resume();
  const t = audio.currentTime + 0.01;
  tone(1760, t, 0.08);
  tone(2350, t + 0.1, 0.1);
}

/** Vibrate (Android), haptic tick (iPhone) and a short beep when a code is scanned. */
export function scanFeedback() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(90);
  else hapticLabel?.click();
  beep();
}
