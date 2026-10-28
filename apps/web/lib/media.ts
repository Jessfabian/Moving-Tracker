import { uuid, type MediaRef } from "@moving/shared";

/** Resizes an image file in the browser and returns a compact JPEG data URL. */
export async function compressImage(file: File, maxSize = 1280, quality = 0.72): Promise<MediaRef> {
  if (!file.type.startsWith("image/")) {
    const uri = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
    return { id: uuid(), uri, mime: file.type || "application/octet-stream", name: file.name };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { id: uuid(), uri: canvas.toDataURL("image/jpeg", quality), mime: "image/jpeg", name: file.name };
}

export async function readMedia(ref: MediaRef): Promise<Blob> {
  if (!ref.uri) throw new Error("No local media to upload");
  return (await fetch(ref.uri)).blob();
}

/** Downloads a web image (through our proxy, since most sites block cross-site reads) and saves it as our own photo. */
export async function imageUrlToMedia(url: string): Promise<MediaRef | null> {
  try {
    const res = await fetch(`/api/image?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "photo.jpg").slice(0, 80);
    return await compressImage(new File([blob], name, { type: blob.type }));
  } catch {
    return null;
  }
}

/** Images (files or web image links) from a drop or paste event. */
export function droppedImages(dt: DataTransfer | null): { files: File[]; urls: string[] } {
  if (!dt) return { files: [], urls: [] };
  const files = [...dt.files].filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
  if (files.length) return { files, urls: [] };
  const urls = new Set<string>();
  for (const line of (dt.getData("text/uri-list") || "").split(/\r?\n/)) if (/^https?:\/\//i.test(line.trim())) urls.add(line.trim());
  const html = dt.getData("text/html");
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) if (/^https?:\/\//i.test(m[1]!)) urls.add(m[1]!);
  const text = dt.getData("text/plain").trim();
  if (!urls.size && /^https?:\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?$/i.test(text)) urls.add(text);
  return { files: [], urls: [...urls].slice(0, 20) };
}

export function download(filename: string, content: string | Blob, type = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Opens printable HTML in a new tab and triggers the print dialog (Save as PDF). */
export function printHtml(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    download("report.html", html, "text/html");
    return;
  }
  w.document.open();
  w.document.write(html.replace("</body>", `<script>setTimeout(()=>window.print(),400)</script></body>`));
  w.document.close();
}
