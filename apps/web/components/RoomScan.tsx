"use client";

import { PickAll, SelectCircle } from "./Selection";
import {
  DISPOSITION_COLORS,
  ROOM_TYPE_LABELS,
  formatMoney,
  guessItemCategory,
  itemPriceIdea,
  mergeDetections,
  refineForRoom,
  roomSuggestions,
  roomTypeFromName,
  sum,
  uuid,
  type Detection,
  type Item,
  type RoomType,
  type ScannedItem,
} from "@moving/shared";
import { useMemo, useRef, useState } from "react";
import { cloudDetect, cloudVisionEnabled, cropToDataUrl, detectObjects, fileToImage, loadDetector } from "@/lib/roomDetect";
import { compressImage } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";
import { Drawer } from "./ui";

type Photo = { id: string; file: File; url: string; img?: HTMLImageElement; dets: Detection[] };
type Row = ScannedItem & { condition: Item["condition"]; disposition: Item["disposition"]; planTouched?: boolean };

const CONDITIONS: { value: Item["condition"]; label: string }[] = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];
const PLANS: { value: Item["disposition"]; label: string }[] = [
  { value: "move", label: "Keep / move" },
  { value: "sell", label: "Sell" },
  { value: "donate", label: "Donate" },
  { value: "give", label: "Give away" },
  { value: "trash", label: "Toss" },
  { value: "store", label: "Storage" },
  { value: "undecided", label: "Undecided" },
];
const VERDICT: Record<string, { label: string; plan: Item["disposition"]; color: string }> = {
  sell: { label: "Sell it", plan: "sell", color: DISPOSITION_COLORS.sell ?? "#16a34a" },
  keep: { label: "Worth moving", plan: "move", color: DISPOSITION_COLORS.move ?? "#4f46e5" },
  donate: { label: "Donate", plan: "donate", color: DISPOSITION_COLORS.donate ?? "#d97706" },
  either: { label: "Your call", plan: "undecided", color: "#6b7280" },
};

const toRow = (s: ScannedItem): Row => ({ ...s, condition: "good", disposition: "undecided" });
const same = (a: string, b: string) => a.toLowerCase().replace(/s$/, "") === b.toLowerCase().replace(/s$/, "");

/** Photograph a whole room → AI lists what's in it → fix, delete or add → save to inventory with price ideas. */
export function RoomScan({ open, onClose, initialRoomId, onSaved }: { open: boolean; onClose: () => void; initialRoomId?: string | null; onSaved?: (count: number, roomId: string) => void }) {
  const db = useDb();
  const store = useStore();
  const rooms = useMemo(() => [...db.rooms].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), [db.rooms]);
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [newRoom, setNewRoom] = useState("");
  const roomName = roomId === "__new" ? newRoom.trim() : (rooms.find((r) => r.id === roomId)?.name ?? "");
  const [typeOverride, setTypeOverride] = useState<RoomType | "">("");
  const roomType: RoomType = typeOverride || roomTypeFromName(roomName);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [phase, setPhase] = useState<"pick" | "scanning" | "review">("pick");
  const [status, setStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [suggested, setSuggested] = useState<ScannedItem[]>([]);
  const [addName, setAddName] = useState("");
  const [saving, setSaving] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setRows([]);
    setSuggested([]);
    setPhase("pick");
    setStatus(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...files].filter((f) => f.type.startsWith("image/")).map((file) => ({ id: uuid(), file, url: URL.createObjectURL(file), dets: [] as Detection[] }));
    setPhotos((p) => [...p, ...next].slice(0, 8));
  };

  const scan = async () => {
    if (!photos.length) return;
    setPhase("scanning");
    const withImgs: Photo[] = [];
    let detectorOk = true;
    try {
      setStatus("Loading the AI model (first time only, ~16 MB)…");
      await loadDetector();
    } catch {
      detectorOk = false;
    }
    for (const [i, p] of photos.entries()) {
      setStatus(`Looking at photo ${i + 1} of ${photos.length}…`);
      const img = p.img ?? (await fileToImage(p.file));
      const dets = detectorOk ? await detectObjects(img).catch(() => []) : [];
      withImgs.push({ ...p, img, dets });
    }
    setPhotos(withImgs);
    let found = refineForRoom(mergeDetections(withImgs.map((p) => p.dets)), roomType).map(toRow);

    if (await cloudVisionEnabled()) {
      setStatus("Asking the cloud model for the full list…");
      try {
        const small = await Promise.all(withImgs.slice(0, 6).map((p) => compressImage(p.file, 1024, 0.7)));
        const ai = await cloudDetect(
          small.map((m) => m.uri!),
          roomName || ROOM_TYPE_LABELS[roomType],
        );
        for (const a of ai) {
          const hit = found.find((f) => same(f.name, a.name));
          if (hit) hit.quantity = Math.max(hit.quantity, a.quantity);
          else found.push(toRow({ key: `ai:${a.name}`, name: a.name, quantity: a.quantity, category: guessItemCategory(a.name), confidence: 0.8, source: "ai", photos: [], keep: true }));
        }
      } catch {
        /* the on-device result still stands */
      }
    }
    found = found.map(withPlan);
    setRows(found);
    setSuggested(roomSuggestions(roomType, found.map((f) => f.name)));
    setStatus(
      !detectorOk
        ? "The AI model couldn't load on this network, so nothing was auto-detected. Tick the usual items below or add your own."
        : found.length
          ? `Found ${found.length} kind${found.length === 1 ? "" : "s"} of item. Fix names or counts, untick anything wrong, and add what the camera missed.`
          : "Nothing recognisable — try a wider shot with more light, or tick the usual items below.",
    );
    setPhase("review");
  };

  const withPlan = (r: Row): Row => {
    if (r.planTouched) return r;
    const idea = itemPriceIdea({ name: r.name, category: guessItemCategory(r.name), condition: r.condition, quantity: r.quantity });
    return { ...r, disposition: VERDICT[idea.verdict]!.plan };
  };
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? withPlan({ ...r, ...p }) : r)));

  const addRow = (name: string, qty = 1, from?: ScannedItem) => {
    const n = name.trim();
    if (!n) return;
    setRows((rs) => [...rs, withPlan(toRow(from ? { ...from, keep: true } : { key: `man:${uuid()}`, name: n, quantity: qty, category: guessItemCategory(n), confidence: 0, source: "manual", photos: [], keep: true }))]);
    if (from) setSuggested((s) => s.filter((x) => x.key !== from.key));
  };

  const chosen = rows.filter((r) => r.keep && r.name.trim());
  const ideas = new Map(rows.map((r) => [r.key, itemPriceIdea({ name: r.name, category: guessItemCategory(r.name), condition: r.condition, quantity: r.quantity })]));
  const totalValue = sum(chosen.map((r) => (ideas.get(r.key)?.likely ?? 0) * r.quantity));
  const sellValue = sum(chosen.filter((r) => r.disposition === "sell").map((r) => (ideas.get(r.key)?.likely ?? 0) * r.quantity));

  const save = async () => {
    if (!chosen.length) return;
    setSaving(true);
    let rid = roomId;
    if (rid === "__new" || !rid) {
      const name = roomId === "__new" && newRoom.trim() ? newRoom.trim() : ROOM_TYPE_LABELS[roomType];
      const same = rooms.find((r) => r.name.trim().toLowerCase() === name.toLowerCase());
      rid = same ? same.id : store.insert("rooms", { name, sort: rooms.length }).id;
    }
    const rowsOut = await Promise.all(
      chosen.map(async (r) => {
        const idea = ideas.get(r.key)!;
        let photo: Item["photos"] = [];
        const src = r.crop ? photos[r.crop.photo] : r.photos.length ? photos[r.photos[0]!] : undefined;
        if (src?.img && r.crop) photo = [{ id: uuid(), uri: cropToDataUrl(src.img, r.crop.box), mime: "image/jpeg", name: `${r.name}.jpg` }];
        else if (src) photo = [await compressImage(src.file, 900, 0.7)];
        return {
          name: r.name.trim(),
          room_id: rid,
          quantity: Math.max(1, r.quantity),
          category: guessItemCategory(r.name),
          condition: r.condition,
          disposition: r.disposition,
          est_value: idea.likely,
          sale_price: r.disposition === "sell" ? idea.likely : null,
          photos: photo,
          notes: `Price idea ${formatMoney(idea.low)}–${formatMoney(idea.high)} (${idea.basis}). ${idea.why}${idea.tip ? ` Tip: ${idea.tip}` : ""}`,
        } as Partial<Item>;
      }),
    );
    store.insertMany("items", rowsOut as never);
    setSaving(false);
    onSaved?.(rowsOut.length, rid);
    close();
  };

  return (
    <Drawer open={open} onClose={close} title="📸 Scan a whole room" wide>
      <div className="space-y-4">
        {phase !== "review" && (
          <>
            <p className="text-sm text-gray-600">Take 1–8 photos of the room from different corners. The AI picks out the furniture and things in them, then you fix the list before anything is saved. Photos are analysed on this device.</p>
            <div className="grid gap-3 @md:grid-cols-2">
              <label className="block">
                <span className="label">Room</span>
                <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">Choose a room…</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value="__new">+ New room…</option>
                </select>
              </label>
              {roomId === "__new" ? (
                <label className="block">
                  <span className="label">New room name</span>
                  <input className="input" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="e.g. Primary bedroom" />
                </label>
              ) : (
                <label className="block">
                  <span className="label">Kind of room</span>
                  <select className="input" value={roomType} onChange={(e) => setTypeOverride(e.target.value as RoomType)}>
                    {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
                      <option key={t} value={t}>
                        {ROOM_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="card flex flex-col items-center gap-1 py-6 hover:shadow-md" onClick={() => camRef.current?.click()} disabled={phase === "scanning"}>
                <span className="text-4xl">📷</span>
                <span className="font-bold">Take photos</span>
              </button>
              <button type="button" className="card flex flex-col items-center gap-1 py-6 hover:shadow-md" onClick={() => pickRef.current?.click()} disabled={phase === "scanning"}>
                <span className="text-4xl">🖼️</span>
                <span className="font-bold">Upload photos</span>
              </button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="aspect-square w-full rounded-xl object-cover" />
                    {phase === "pick" && (
                      <button type="button" aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-sm text-white" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {status && <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{status}</p>}
            <button type="button" className="btn-primary w-full" disabled={!photos.length || phase === "scanning" || (roomId === "__new" && !newRoom.trim())} onClick={() => void scan()}>
              {phase === "scanning" ? "Scanning…" : `✨ Find items in ${photos.length || ""} photo${photos.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}

        {phase === "review" && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <div key={p.id} className="relative h-28 flex-none overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`Photo ${i + 1}`} className="h-28 w-auto" />
                  {p.img &&
                    p.dets
                      .filter((d) => d.box && d.score >= 0.35)
                      .map((d, j) => (
                        <div
                          key={j}
                          className="pointer-events-none absolute border-2 border-lime"
                          style={{ left: `${(d.box!.x / p.img!.naturalWidth) * 100}%`, top: `${(d.box!.y / p.img!.naturalHeight) * 100}%`, width: `${(d.box!.w / p.img!.naturalWidth) * 100}%`, height: `${(d.box!.h / p.img!.naturalHeight) * 100}%` }}
                        />
                      ))}
                </div>
              ))}
            </div>
            {status && <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{status}</p>}

            <PickAll
              count={rows.filter((r) => r.keep).length}
              total={rows.length}
              onAll={() => rows.forEach((r) => !r.keep && patch(r.key, { keep: true }))}
              onClear={() => rows.forEach((r) => r.keep && patch(r.key, { keep: false }))}
            />
            <ul className="space-y-2">
              {rows.map((r) => {
                const idea = ideas.get(r.key)!;
                const v = VERDICT[idea.verdict]!;
                const src = r.crop ? photos[r.crop.photo] : undefined;
                return (
                  <li key={r.key} className={`rounded-2xl border p-3 ${r.keep ? "border-gray-200 bg-white" : "border-dashed border-gray-200 bg-gray-50 opacity-60"}`}>
                    <div className="flex items-start gap-3">
                      <button type="button" role="checkbox" aria-checked={r.keep} aria-label={`Include ${r.name}`} className="-m-1.5 flex h-11 w-9 flex-none items-center justify-center" onClick={() => patch(r.key, { keep: !r.keep })}>
                        <SelectCircle on={r.keep} />
                      </button>
                      {src?.img && r.crop ? (
                        <div
                          className="h-14 w-14 flex-none rounded-lg bg-gray-100 bg-no-repeat"
                          style={{
                            backgroundImage: `url(${src.url})`,
                            backgroundSize: `${(src.img.naturalWidth / r.crop.box.w) * 100}% ${(src.img.naturalHeight / r.crop.box.h) * 100}%`,
                            backgroundPosition: `${(r.crop.box.x / Math.max(1, src.img.naturalWidth - r.crop.box.w)) * 100}% ${(r.crop.box.y / Math.max(1, src.img.naturalHeight - r.crop.box.h)) * 100}%`,
                          }}
                        />
                      ) : (
                        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-gray-100 text-xl">{r.source === "suggested" ? "💡" : r.source === "manual" ? "✍️" : "🛋️"}</div>
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input className="input min-w-0 flex-1 py-1.5" aria-label="Item name" value={r.name} onChange={(e) => patch(r.key, { name: e.target.value, category: guessItemCategory(e.target.value) })} />
                          <input className="input w-16 py-1.5" aria-label="Quantity" type="number" min={1} value={r.quantity} onChange={(e) => patch(r.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                          <button type="button" aria-label={`Delete ${r.name}`} className="btn-ghost px-2 text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                            🗑
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <select className="input w-auto py-1 text-sm" aria-label="Condition" value={r.condition} onChange={(e) => patch(r.key, { condition: e.target.value as Item["condition"] })}>
                            {CONDITIONS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <select className="input w-auto py-1 text-sm" aria-label="Plan" value={r.disposition} onChange={(e) => patch(r.key, { disposition: e.target.value as Item["disposition"], planTouched: true })}>
                            {PLANS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          {r.source === "photo" && <span className="chip self-center bg-lime/30 text-ink">seen {Math.round(r.confidence * 100)}%</span>}
                          {r.source === "ai" && <span className="chip self-center bg-violet-100 text-violet-800">AI</span>}
                        </div>
                        <div className="text-xs text-gray-600">
                          <span className="font-semibold text-gray-900">
                            💲 {formatMoney(idea.likely)}
                            {r.quantity > 1 ? " each" : ""}
                          </span>{" "}
                          <span className="text-gray-500">
                            ({formatMoney(idea.low)}–{formatMoney(idea.high)} used)
                          </span>{" "}
                          <span className="chip ml-1" style={{ background: `${v.color}1a`, color: v.color }}>
                            {v.label}
                          </span>
                          <div className="mt-0.5 text-gray-500">
                            {idea.why}{" "}
                            <a className="text-indigo-700 underline" href={idea.links[0]!.url} target="_blank" rel="noreferrer">
                              eBay sold
                            </a>{" "}
                            ·{" "}
                            <a className="text-indigo-700 underline" href={idea.links[1]!.url} target="_blank" rel="noreferrer">
                              Marketplace
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Add something the camera missed…" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRow(addName), setAddName(""))} />
              <button
                type="button"
                className="btn-secondary"
                disabled={!addName.trim()}
                onClick={() => {
                  addRow(addName);
                  setAddName("");
                }}
              >
                + Add
              </button>
            </div>

            {suggested.length > 0 && (
              <div>
                <div className="label">Usually in a {ROOM_TYPE_LABELS[roomType].toLowerCase()} — tap to add</div>
                <div className="flex flex-wrap gap-2">
                  {suggested.map((s) => (
                    <button key={s.key} type="button" className="chip bg-gray-100 px-3 py-1.5 text-sm hover:bg-indigo-50" onClick={() => addRow(s.name, s.quantity, s)}>
                      + {s.name}
                      {s.quantity > 1 ? ` ×${s.quantity}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="ink-panel sticky bottom-0 -mx-1 space-y-2 rounded-2xl bg-ink p-3 text-white">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {chosen.length} item{chosen.length === 1 ? "" : "s"} · worth ~{formatMoney(totalValue)} used
                </span>
                {sellValue > 0 && <span className="text-lime">Sell pile ~{formatMoney(sellValue)}</span>}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn flex-none bg-white/15 text-white hover:bg-white/25" onClick={reset}>
                  ↺ Start over
                </button>
                <button type="button" className="btn flex-1 bg-lime text-ink hover:brightness-95" disabled={!chosen.length || saving} onClick={() => void save()}>
                  {saving ? "Saving…" : `Add ${chosen.length} to ${roomName || ROOM_TYPE_LABELS[roomType]}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
