"use client";

let audio: AudioContext | null = null;
let hapticLabel: HTMLLabelElement | null = null;

/** Call from a user tap (e.g. opening the scanner) so iOS allows sound later. */
export function primeScanFeedback() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx && !audio) audio = new Ctx();
    void audio?.resume();
  } catch {
    audio = null;
  }
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

export function soundEnabled() {
  return typeof localStorage === "undefined" || localStorage.getItem("scan-sound") !== "off";
}

export function setSoundEnabled(on: boolean) {
  localStorage.setItem("scan-sound", on ? "on" : "off");
}

function beep() {
  if (!audio || !soundEnabled()) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1320, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

/** Vibrate (Android), haptic tick (iPhone) and a short beep when a code is scanned. */
export function scanFeedback() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(90);
  else hapticLabel?.click();
  beep();
}
