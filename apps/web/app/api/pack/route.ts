import { PACK_BOXES, type PackBoxKey, type PackItem } from "@moving/shared";

export const maxDuration = 60;

const API = "https://api.wyldapi.com/v1/binpacker";
const MAX_ROOMS = 15;
const MAX_UNITS = 2000;
const CM = 2.54;
const KG = 0.4536;
const boxName = (k: PackBoxKey) => `MT-${k}`;

interface RoomIn {
  id: string;
  items: PackItem[];
}

interface WyldBox {
  name: string;
  width: number;
  height: number;
  depth: number;
}

async function call<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as (T & { success?: boolean; error?: string }) | null;
  if (!res.ok || !body || body.success === false) throw new Error(body?.error || `Packing service error ${res.status}`);
  return body;
}

/** Map any box the service used back to one of our sizes (by name, or the smallest of ours it fits in). */
function toKey(b: WyldBox): PackBoxKey {
  const named = PACK_BOXES.find((p) => boxName(p.key) === b.name);
  if (named) return named.key;
  const d = [b.width, b.height, b.depth].map((x) => x / CM).sort((x, y) => y - x);
  return PACK_BOXES.find((p) => p.dims.every((v, i) => d[i]! <= v + 0.5))?.key ?? "xl";
}

/** Makes sure our four standard box sizes are registered with the packing service. */
async function ensureBoxes(key: string) {
  const { boxes = [] } = await call<{ boxes?: WyldBox[] }>(key, "/boxes");
  const have = new Set(boxes.map((b) => b.name));
  for (const p of PACK_BOXES) {
    if (have.has(boxName(p.key))) continue;
    await call(key, "/box", {
      method: "POST",
      body: JSON.stringify({
        name: boxName(p.key),
        width: p.dims[0] * CM,
        height: p.dims[2] * CM,
        depth: p.dims[1] * CM,
        max_weight: Math.round(p.maxLbs * KG * 10) / 10,
        box_weight: 0.3,
        length_units: "cm",
        weight_units: "kg",
      }),
    });
  }
}

/** Packs each room's loose items into our standard boxes with the 3D bin-packing service (key stays on the server). */
export async function POST(req: Request) {
  const key = process.env.WYLDAPI_KEY;
  if (!key) return Response.json({ error: "Exact packing isn't set up" }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { rooms?: RoomIn[] } | null;
  const rooms = (body?.rooms ?? []).filter((r) => r && typeof r.id === "string" && Array.isArray(r.items) && r.items.length).slice(0, MAX_ROOMS);
  if (!rooms.length) return Response.json({ engine: "wyldapi", rooms: [] });

  try {
    await ensureBoxes(key);
    const out = [];
    for (const r of rooms) {
      let units = 0;
      const items: { name: string; label: string; width: number; height: number; depth: number; weight: number; quantity: number }[] = [];
      for (const i of r.items) {
        if (!Array.isArray(i.dims) || i.dims.length !== 3 || !i.dims.every((x) => x > 0 && x < 3900) || !(i.lbs > 0)) continue;
        const quantity = Math.min(MAX_UNITS - units, Math.max(1, Math.round(i.qty)));
        if (quantity <= 0) break;
        units += quantity;
        items.push({ name: `i${items.length}`, label: String(i.name).slice(0, 80), width: i.dims[0] * CM, height: i.dims[2] * CM, depth: i.dims[1] * CM, weight: i.lbs * KG, quantity });
      }
      if (!items.length) continue;
      const res = await call<{ packed?: WyldBox[]; not_fit?: { name: string; quantity: number | string }[] }>(key, "/pack", {
        method: "POST",
        body: JSON.stringify({ items: items.map((i) => ({ name: i.name, width: i.width, height: i.height, depth: i.depth, weight: i.weight, quantity: i.quantity })) }),
      });
      const boxes: Record<PackBoxKey, number> = { small: 0, medium: 0, large: 0, xl: 0 };
      for (const b of res.packed ?? []) boxes[toKey(b)]++;
      const notFit = (res.not_fit ?? []).map((n) => ({ name: items.find((i) => i.name === n.name)?.label ?? n.name, qty: Number(n.quantity) || 1 }));
      out.push({ id: r.id, boxes, notFit });
    }
    return Response.json({ engine: "wyldapi", rooms: out });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Packing service unavailable" }, { status: 502 });
  }
}
