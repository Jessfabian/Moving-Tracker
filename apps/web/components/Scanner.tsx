"use client";

import type { IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";
import { canVibrate, primeScanFeedback, releaseScanFeedback, scanFeedback, setSoundEnabled, soundEnabled } from "./scanFeedback";
import { Modal } from "./ui";

/**
 * Camera barcode/QR scanner. In continuous mode it keeps scanning (e.g. a stack of books)
 * and ignores repeats of the same code for a few seconds.
 */
export function Scanner({
  open,
  onClose,
  onScan,
  title = "Scan barcode",
  continuous = false,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  continuous?: boolean;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(0);
  const [sound, setSound] = useState(soundEnabled);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hit = (code: string) => {
    scanFeedback();
    setLast(code);
    setCount((n) => n + 1);
    setFlash(Date.now());
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(0), 1400);
  };
  const hitRef = useRef(hit);
  const close = () => {
    setCount(0);
    setFlash(0);
    setLast(null);
    onClose();
  };
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
    hitRef.current = hit;
  });

  useEffect(() => {
    if (!open) return;
    primeScanFeedback();
    let controls: IScannerControls | null = null;
    let stopped = false;
    const recent = new Map<string, number>();
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        setError(null);
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
          videoRef.current!,
          (result) => {
            if (!result || stopped) return;
            const code = result.getText();
            const now = Date.now();
            if ((recent.get(code) ?? 0) > now - 4000) return;
            recent.set(code, now);
            hitRef.current(code);
            onScanRef.current(code);
            if (!continuous) {
              stopped = true;
              controls?.stop();
              onCloseRef.current();
            }
          },
        );
        if (stopped) controls.stop();
      } catch (e) {
        setError(e instanceof Error ? `${e.name}: ${e.message}` : "Camera unavailable");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
      // Let the last beep finish before handing the audio session back.
      setTimeout(releaseScanFeedback, 600);
    };
  }, [open, continuous]);

  return (
    <Modal open={open} onClose={close} title={title}>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,.9)]" />
        {flash > 0 && (
          <div key={flash} className="scan-flash pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-emerald-500/85 text-white" role="status" aria-live="assertive">
            <span className="text-5xl leading-none">✓</span>
            <span className="text-[17px] font-bold">Got it!</span>
            {continuous && <span className="text-[15px] font-semibold">Next one →</span>}
          </div>
        )}
        {continuous && count > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-semibold text-white">{count} scanned</span>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        {hint ? <p className="muted min-w-0">{hint}</p> : <span />}
        <button
          type="button"
          className="seg-btn flex-none rounded-full bg-ink/[0.06] px-3 py-1.5 text-[13px] font-semibold"
          aria-pressed={sound}
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
            if (sound) releaseScanFeedback();
            else primeScanFeedback();
          }}
        >
          {sound ? "🔊 Beep on" : "🔇 Beep off"}
        </button>
      </div>
      {last && continuous && <p className="mt-2 text-sm font-medium text-green-700">✓ Scanned {last} — keep going!</p>}
      {open && !canVibrate() && (
        <p className="mt-2 text-[12px] leading-snug text-gray-500">
          {sound
            ? "iPhone doesn't let websites vibrate on their own — listen for the beep-beep (it plays even on silent) and watch for the green ✓."
            : "iPhone doesn't let websites vibrate on their own — watch for the green ✓, or turn the beep on."}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Camera not available ({error}). Camera access needs HTTPS or localhost and permission. You can type the code instead.
        </p>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!manual.trim()) return;
          hit(manual.trim());
          onScanRef.current(manual.trim());
          setManual("");
          if (!continuous) close();
        }}
      >
        <input className="input" placeholder="Or type ISBN / UPC / code" value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" />
        <button className="btn-primary" type="submit">
          Add
        </button>
      </form>
      {continuous && (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={close}>
          Done scanning
        </button>
      )}
    </Modal>
  );
}
