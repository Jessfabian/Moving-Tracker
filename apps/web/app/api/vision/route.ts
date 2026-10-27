/**
 * Optional cloud room scan. Off unless OPENAI_API_KEY is set on the server —
 * without it, photos never leave the device (the on-device detector is used).
 *
 * GET  /api/vision                  → { enabled }
 * POST /api/vision {photos, room}   → { items: [{ name, quantity }] }
 */
const KEY = () => process.env.OPENAI_API_KEY;
const MODEL = () => process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";

export async function GET() {
  return Response.json({ enabled: Boolean(KEY()) });
}

export async function POST(request: Request) {
  const key = KEY();
  if (!key) return Response.json({ error: "Cloud vision is off (no OPENAI_API_KEY)." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { photos?: unknown; room?: unknown } | null;
  const photos = Array.isArray(body?.photos) ? body.photos.filter((p): p is string => typeof p === "string" && p.startsWith("data:image/")).slice(0, 6) : [];
  if (!photos.length) return Response.json({ error: "Send 1–6 photos" }, { status: 400 });
  const room = typeof body?.room === "string" ? body.room.slice(0, 60) : "room";
  const prompt = `These photos all show the same ${room} in a home that is being packed for a long-distance move. List every distinct household item worth putting in a moving inventory: furniture, appliances, electronics, decor, lamps, rugs, mirrors, wall art, storage pieces, notable sets (e.g. "Books", "Clothes"). Count each item once even if it appears in several photos. Use short plain names like "Nightstand", "Makeup vanity", "Queen bed", "Floor lamp". Skip people, pets, built-in fixtures (outlets, windows, doors, ceiling lights, built-in cabinets) and trash. Reply with JSON: {"items":[{"name":string,"quantity":number}]}.`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: MODEL(),
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...photos.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } }))] }],
      }),
    });
    if (!res.ok) return Response.json({ error: `Vision service answered ${res.status}` }, { status: 502 });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as { items?: { name?: unknown; quantity?: unknown }[] };
    const items = (parsed.items ?? [])
      .filter((i) => typeof i.name === "string" && i.name.trim())
      .map((i) => ({ name: String(i.name).trim().slice(0, 80), quantity: Math.max(1, Math.min(99, Math.round(Number(i.quantity) || 1))) }))
      .slice(0, 60);
    return Response.json({ items });
  } catch {
    return Response.json({ error: "Vision service unavailable" }, { status: 502 });
  }
}
