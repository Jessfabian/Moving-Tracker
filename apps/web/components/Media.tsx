"use client";

import { signedMediaUrl, type MediaRef } from "@moving/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compressImage } from "@/lib/media";
import { useApp } from "@/lib/store-context";

const cache = new Map<string, string>();

export function useMediaUrl(ref: MediaRef | undefined | null): string | null {
  const { supabase } = useApp();
  const path = ref && !ref.uri ? (ref.remotePath ?? null) : null;
  const [fetched, setFetched] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path || !supabase || cache.has(path)) return;
    let cancelled = false;
    void signedMediaUrl(supabase, path).then((u) => {
      if (u) cache.set(path, u);
      if (!cancelled) setFetched({ path, url: u });
    });
    return () => {
      cancelled = true;
    };
  }, [path, supabase]);
  if (!ref) return null;
  if (ref.uri) return ref.uri;
  if (!path) return null;
  return cache.get(path) ?? (fetched?.path === path ? fetched.url : null);
}

export function MediaThumb({ media, className = "h-16 w-16", onClick }: { media: MediaRef; className?: string; onClick?: () => void }) {
  const url = useMediaUrl(media);
  const isImage = (media.mime ?? "image/").startsWith("image/");
  const isPdf = media.mime === "application/pdf" || /\.pdf$/i.test(media.name ?? "");
  // Only a real button when clickable, so it can sit inside another button (e.g. item cards).
  const Tag = onClick ? "button" : "span";
  return (
    <Tag {...(onClick ? { type: "button" as const, onClick } : {})} title={media.name} className={`${className} flex flex-none items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100`}>
      {url && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={media.name ?? "photo"} className="h-full w-full object-cover" />
      ) : isPdf ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-white p-1">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
          <span className="line-clamp-2 w-full break-all text-center text-[9px] leading-tight text-gray-500">{media.name ?? "document"}</span>
        </span>
      ) : (
        <span className="text-xs text-gray-500">{isImage ? "☁️" : "📄"}</span>
      )}
    </Tag>
  );
}

/** Browsers block navigating to data: URLs, so convert them to blob: URLs for viewing/downloading. */
export function useBlobUrl(url: string | null): string | null {
  const [blob, setBlob] = useState<{ src: string; url: string } | null>(null);
  useEffect(() => {
    if (!url || !url.startsWith("data:")) return;
    let live = true;
    let made: string | null = null;
    void fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setBlob({ src: url, url: made });
      });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url]);
  if (!url) return null;
  if (!url.startsWith("data:")) return url;
  return blob?.src === url ? blob.url : null;
}

export function MediaLightbox({ media, onClose }: { media: MediaRef | null; onClose: () => void }) {
  const raw = useMediaUrl(media);
  const url = useBlobUrl(raw);
  if (!media) return null;
  const isImage = (media.mime ?? "image/").startsWith("image/");
  const isPdf = media.mime === "application/pdf" || /\.pdf$/i.test(media.name ?? "");
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={onClose}>
      {url && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={raw ?? url} alt="" className="max-h-full max-w-full rounded-lg" />
      ) : url && isPdf ? (
        <iframe src={url} title={media.name ?? "PDF"} className="h-full w-full max-w-4xl flex-1 rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
      ) : !url ? (
        <p className="text-white">{raw ? "Opening…" : "Not available on this device yet."}</p>
      ) : null}
      {url && !isImage && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <a href={url} target="_blank" rel="noreferrer" className="btn-accent">
            Open in new tab
          </a>
          <a href={url} download={media.name ?? "document"} className="btn-secondary">
            Download
          </a>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Photo/scan picker. On phones `capture` opens the camera directly. */
export function MediaField({ value, onChange, accept = "image/*" }: { value: MediaRef[]; onChange: (v: MediaRef[]) => void; accept?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<MediaRef | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const refs = await Promise.all([...files].map((f) => compressImage(f)));
      onChange([...value, ...refs]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((m) => (
          <div key={m.id} className="relative">
            <MediaThumb media={m} className="h-20 w-20" onClick={() => setPreview(m)} />
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white"
              onClick={() => onChange(value.filter((x) => x.id !== m.id))}
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-indigo-400" onClick={() => cameraRef.current?.click()} disabled={busy}>
          <span className="text-2xl">📷</span>
          {busy ? "Saving…" : "Camera"}
        </button>
        <button type="button" className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-indigo-400" onClick={() => fileRef.current?.click()} disabled={busy}>
          <span className="text-2xl">{accept.includes("pdf") ? "📎" : "🖼️"}</span>
          {accept.includes("pdf") ? "File / PDF" : "Upload"}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={fileRef} type="file" accept={accept} multiple className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      <MediaLightbox media={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
