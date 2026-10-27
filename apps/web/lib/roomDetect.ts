import { suppressDuplicates, type Detection } from "@moving/shared";
import type { ObjectDetector } from "@mediapipe/tasks-vision";

// Pinned to the installed package so the JS glue and the wasm always match.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/latest/efficientdet_lite2.tflite";

let detectorPromise: Promise<ObjectDetector> | null = null;

/** Loads the on-device object detector once (≈16 MB the first time, then cached by the browser). */
export function loadDetector(): Promise<ObjectDetector> {
  detectorPromise ??= (async () => {
    const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate: "GPU" | "CPU") =>
      ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "IMAGE",
        scoreThreshold: 0.3,
        maxResults: 40,
      });
    return make("GPU").catch(() => make("CPU"));
  })().catch((e) => {
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}

export async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
}

type Source = HTMLImageElement | HTMLCanvasElement;

function run(det: ObjectDetector, src: Source, dx = 0, dy = 0, minScore = 0): Detection[] {
  return det.detect(src).detections.flatMap((d) => {
    const c = d.categories[0];
    if (!c?.categoryName || c.score < minScore) return [];
    const b = d.boundingBox;
    return [{ label: c.categoryName, score: c.score, ...(b ? { box: { x: b.originX + dx, y: b.originY + dy, w: b.width, h: b.height } } : {}) }];
  });
}

/**
 * Everything the camera can name in one photo. Besides the whole frame it also
 * looks at four overlapping zoomed-in quarters, which finds the smaller things
 * (chairs, plants, TVs, vases, clocks) a single pass at low resolution misses.
 */
export async function detectObjects(img: HTMLImageElement, { tiles = true } = {}): Promise<Detection[]> {
  const det = await loadDetector();
  const all = run(det, img);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (tiles && Math.min(W, H) >= 480) {
    const tw = Math.round(W * 0.6);
    const th = Math.round(H * 0.6);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d")!;
    for (const [x, y] of [
      [0, 0],
      [W - tw, 0],
      [0, H - th],
      [W - tw, H - th],
    ] as const) {
      ctx.drawImage(img, x, y, tw, th, 0, 0, tw, th);
      // Tiles see less context, so ask for a bit more confidence, and skip anything
      // touching a cut edge — that's part of a bigger object the full frame already saw.
      const m = 6;
      const cut = (b: { x: number; y: number; w: number; h: number }) =>
        (x > 0 && b.x - x <= m) || (x + tw < W && b.x + b.w >= x + tw - m) || (y > 0 && b.y - y <= m) || (y + th < H && b.y + b.h >= y + th - m);
      all.push(...run(det, canvas, x, y, 0.4).filter((d) => !d.box || !cut(d.box)));
    }
  }
  return suppressDuplicates(all);
}
/** JPEG data URL of one region (with a little margin), for an item's own thumbnail. */
export function cropToDataUrl(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }, max = 640): string {
  const pad = 0.08;
  const x = Math.max(0, box.x - box.w * pad);
  const y = Math.max(0, box.y - box.h * pad);
  const w = Math.min(img.naturalWidth - x, box.w * (1 + 2 * pad));
  const h = Math.min(img.naturalHeight - y, box.h * (1 + 2 * pad));
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")!.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

/** Is the optional cloud vision (server key) turned on? */
export async function cloudVisionEnabled(): Promise<boolean> {
  try {
    const r = await fetch("/api/vision");
    return r.ok && ((await r.json()) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

/** Ask the server's vision model for a full item list (names a nightstand or vanity, which the on-device model can't). */
export async function cloudDetect(photos: string[], room: string): Promise<{ name: string; quantity: number }[]> {
  const r = await fetch("/api/vision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photos, room }) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `vision ${r.status}`);
  return ((await r.json()) as { items: { name: string; quantity: number }[] }).items;
}
