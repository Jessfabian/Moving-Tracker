"use client";

/* eslint-disable @next/next/no-img-element -- remote listing photos come from arbitrary hosts */
import { useEffect, useState, type ReactNode } from "react";

export function Gallery({ urls, className = "" }: { urls: string[]; className?: string }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  if (!urls.length) return null;
  const cur = urls[Math.min(i, urls.length - 1)]!;
  const go = (d: number) => setI((x) => (x + d + urls.length) % urls.length);
  const n = Math.min(i, urls.length - 1) + 1;
  return (
    <div className={className}>
      <div className="group relative overflow-hidden rounded-3xl bg-gray-100">
        <button type="button" className="block w-full cursor-zoom-in" aria-label={`Photo ${n} of ${urls.length}. View full screen`} onClick={() => setZoom(true)}>
          <img src={cur} alt="" referrerPolicy="no-referrer" className="aspect-[16/10] w-full object-cover" />
        </button>
        {urls.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow transition group-hover:opacity-100 sm:opacity-0" aria-label="Previous photo">
              ‹
            </button>
            <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow transition group-hover:opacity-100 sm:opacity-0" aria-label="Next photo">
              ›
            </button>
            <span className="absolute right-3 bottom-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-semibold text-white">
              {i + 1} / {urls.length}
            </span>
          </>
        )}
      </div>
      {urls.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {urls.map((u, k) => (
            <button type="button" key={u} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} aria-current={k === i ? "true" : undefined} className={`h-14 w-20 flex-none overflow-hidden rounded-xl ring-2 transition ${k === i ? "ring-ink" : "opacity-70 ring-transparent hover:opacity-100"}`}>
              <img src={u} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <ZoomView onClose={() => setZoom(false)} onPrev={() => go(-1)} onNext={() => go(1)}>
          <img src={cur} alt={`Photo ${n} of ${urls.length}`} referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-2xl object-contain" />
          {urls.length > 1 && (
            <>
              <button type="button" aria-label="Previous photo" onClick={(e) => (e.stopPropagation(), go(-1))} className="absolute top-1/2 left-4 h-12 w-12 -translate-y-1/2 rounded-full bg-white/15 text-2xl text-white">
                ‹
              </button>
              <button type="button" aria-label="Next photo" onClick={(e) => (e.stopPropagation(), go(1))} className="absolute top-1/2 right-4 h-12 w-12 -translate-y-1/2 rounded-full bg-white/15 text-2xl text-white">
                ›
              </button>
            </>
          )}
        </ZoomView>
      )}
    </div>
  );
}

/** Full-screen photo viewer: Done button, Escape and arrow keys (HIG Image views / Modality). */
function ZoomView({ children, onClose, onPrev, onNext }: { children: ReactNode; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 p-4" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <button type="button" autoFocus className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 h-11 rounded-full bg-white/15 px-4 text-[17px] font-semibold text-white" onClick={onClose}>
        Done
      </button>
      {children}
    </div>
  );
}

/** Editable list of remote photo URLs (pulled from a listing or pasted in). */
export function ImageUrlsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [url, setUrl] = useState("");
  const urls = value ?? [];
  const add = () => {
    const parts = url
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s) && !urls.includes(s));
    if (parts.length) onChange([...urls, ...parts]);
    setUrl("");
  };
  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {urls.map((u, k) => (
            <div key={u} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100">
              <img src={u} alt={k === 0 ? "Cover photo" : `Photo ${k + 1}`} referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
              {k === 0 && <span className="absolute top-1 left-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-semibold text-white">Cover</span>}
              <div className="absolute inset-x-1 bottom-1 flex justify-between transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                {k > 0 ? (
                  <button type="button" title="Make cover" aria-label="Make this the cover photo" className="grid h-7 min-w-7 place-items-center rounded-full bg-white/90 px-1.5 text-[11px] font-semibold" onClick={() => onChange([u, ...urls.filter((x) => x !== u)])}>
                    ★
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" title="Remove" aria-label="Remove photo" className="grid h-7 min-w-7 place-items-center rounded-full bg-white/90 px-1.5 text-[11px] font-semibold text-red-600" onClick={() => onChange(urls.filter((x) => x !== u))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Paste a photo link (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-secondary flex-none" onClick={add} disabled={!url.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
