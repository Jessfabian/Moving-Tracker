"use client";

import { signedMediaUrl, type MediaRef } from "@moving/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compressImage, droppedImages, imageUrlToMedia } from "@/lib/media";
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

/** Viewable URLs for a list of photos (local copies right away, cloud copies once signed). */
export function useMediaUrls(refs: MediaRef[] | undefined | null): string[] {
  const { supabase } = useApp();
  const list = useMemo(() => (refs ?? []).filter((r) => (r.mime ?? "image/").startsWith("image/")), [refs]);
  const need = list.filter((r) => !r.uri && r.remotePath && !cache.has(r.remotePath)).map((r) => r.remotePath!);
  const needKey = need.join("|");
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!needKey || !supabase) return;
    let live = true;
    void Promise.all(
      needKey.split("|").map((p) =>
        signedMediaUrl(supabase, p).then((u) => {
          if (u) cache.set(p, u);
        }),
      ),
    ).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [needKey, supabase]);
  return list.map((r) => r.uri ?? (r.remotePath ? cache.get(r.remotePath) : undefined)).filter((u): u is string => !!u);
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
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const add = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const refs = await Promise.all([...files].map((f) => compressImage(f)));
      onChange([...value, ...refs]);
    } finally {
      setBusy(false);
    }
  };

  const take = async (dt: DataTransfer | null) => {
    const { files, urls } = droppedImages(dt);
    if (files.length) return add(files);
    if (!urls.length) return setNote("Drop photos or images from a web page.");
    setBusy(true);
    setNote(`Saving ${urls.length} image${urls.length === 1 ? "" : "s"}…`);
    const refs = (await Promise.all(urls.map(imageUrlToMedia))).filter((r): r is MediaRef => !!r);
    onChange([...value, ...refs]);
    setBusy(false);
    setNote(refs.length < urls.length ? `Saved ${refs.length} of ${urls.length} — that site blocked the rest.` : null);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer);
      }}
      onPaste={(e) => {
        const { files, urls } = droppedImages(e.clipboardData);
        if (!files.length && !urls.length) return;
        e.preventDefault();
        void take(e.clipboardData);
      }}
      className={`rounded-xl transition ${over ? "bg-indigo-50 ring-2 ring-indigo-400 ring-offset-4" : ""}`}
    >
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
      <p className="mt-1.5 text-xs text-gray-400">{note ?? (over ? "Drop to add" : "Or drag & drop photos here")}</p>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={fileRef} type="file" accept={accept} multiple className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
      <MediaLightbox media={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
