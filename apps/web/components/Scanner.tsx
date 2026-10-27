"use client";

import type { IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";
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
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
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
            setLast(code);
            navigator.vibrate?.(80);
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
    };
  }, [open, continuous]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,.9)]" />
      </div>
      {hint && <p className="muted mt-2">{hint}</p>}
      {last && continuous && <p className="mt-2 text-sm font-medium text-green-700">✓ Scanned {last} — keep going!</p>}
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
          onScanRef.current(manual.trim());
          setLast(manual.trim());
          setManual("");
          if (!continuous) onClose();
        }}
      >
        <input className="input" placeholder="Or type ISBN / UPC / code" value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" />
        <button className="btn-primary" type="submit">
          Add
        </button>
      </form>
      {continuous && (
        <button className="btn-secondary mt-3 w-full" onClick={onClose}>
          Done scanning
        </button>
      )}
    </Modal>
  );
}
