"use client";

import { BOX_STATUSES, isBookBarcode, lookupBook, normalizeIsbn, optionLabel, parseBoxQr, productToItemPatch, type Box, type Item } from "@moving/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { RoomScan } from "@/components/RoomScan";
import { Scanner } from "@/components/Scanner";
import { Drawer, PageHeader } from "@/components/ui";
import { lookupProduct } from "@/lib/lookup";
import { compressImage } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

type Result = { id: string; icon: string; title: string; sub: string; kind: "book" | "item" | "box" | "error"; ref?: string };

export default function ScanPage() {
  const db = useDb();
  const store = useStore();
  const [scan, setScan] = useState(false);
  const [roomScan, setRoomScan] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [item, setItem] = useState<Partial<Item> | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const push = (r: Omit<Result, "id">) => setResults((x) => [{ ...r, id: crypto.randomUUID() }, ...x].slice(0, 20));

  const onScan = async (code: string) => {
    const boxId = parseBoxQr(code);
    if (boxId) {
      const b = store.get("boxes", boxId);
      if (b) {
        setBox(b);
        push({ icon: "📦", title: `Box #${b.number} ${b.label}`, sub: optionLabel(BOX_STATUSES, b.status), kind: "box", ref: b.id });
      } else push({ icon: "⚠️", title: "Unknown box label", sub: "This box may belong to another household", kind: "error" });
      return;
    }
    if (isBookBarcode(code)) {
      const isbn = normalizeIsbn(code)!;
      const dup = store.getSnapshot().books.find((b) => b.isbn === isbn);
      if (dup) return push({ icon: "📚", title: dup.title, sub: "Already in your books", kind: "book", ref: dup.id });
      const info = await lookupBook(isbn).catch(() => null);
      const row = info
        ? (() => {
            const { source: _s, ...rest } = info;
            return store.insert("books", { ...rest, room_id: roomId || null });
          })()
        : store.insert("books", { isbn, title: `Unknown book (${isbn})`, room_id: roomId || null });
      push({ icon: "📚", title: row.title, sub: info ? `Added to Books · ${row.authors.join(", ")}` : "Added — fill in details in Books", kind: "book", ref: row.id });
      return;
    }
    const p = await lookupProduct(code).catch(() => null);
    setScan(false);
    setItem({ ...(p ? productToItemPatch(p, {}) : {}), barcode: code, name: p?.name ?? "", room_id: roomId || null });
  };

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const photos = await Promise.all([...files].map((f) => compressImage(f)));
    setItem({ photos, room_id: roomId || null });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Quick scan" icon="▦" subtitle="One place to capture everything: book ISBNs, product barcodes, box labels, or a photo of anything." />
      <div className="card mb-4">
        <label className="label" htmlFor="room">
          I&apos;m working in…
        </label>
        <select id="room" className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">(no specific room)</option>
          {db.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <button className="card mb-3 flex w-full items-center gap-4 bg-gradient-to-br from-indigo-600 to-violet-600 py-6 text-left text-white transition hover:shadow-md" onClick={() => setRoomScan(true)}>
        <span className="text-5xl">📸</span>
        <span>
          <span className="block text-lg font-bold">Scan a whole room with AI</span>
          <span className="block text-sm text-white/80">Take or upload a few photos — it lists the bed, nightstands, vanity… with price ideas. You fix the list, then save it all at once.</span>
        </span>
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button className="card flex flex-col items-center gap-2 py-8 transition hover:shadow-md" onClick={() => setScan(true)}>
          <span className="text-5xl">▦</span>
          <span className="font-bold">Scan barcode / QR</span>
          <span className="text-center text-xs text-gray-500">Books, products and box labels are detected automatically</span>
        </button>
        <button className="card flex flex-col items-center gap-2 py-8 transition hover:shadow-md" onClick={() => photoRef.current?.click()}>
          <span className="text-5xl">📷</span>
          <span className="font-bold">Photo an item</span>
          <span className="text-center text-xs text-gray-500">Furniture, decor, anything without a barcode</span>
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhotos(e.target.files).then(() => (e.target.value = ""))} />

      {results.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">This session</h2>
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl">{r.icon}</span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (r.kind === "box" && r.ref) setBox(store.get("boxes", r.ref) ?? null);
                  }}
                >
                  <div className="truncate font-semibold">{r.title}</div>
                  <div className="text-xs text-gray-500">{r.sub}</div>
                </button>
                {r.kind === "book" && (
                  <Link href="/books" className="text-xs text-indigo-700">
                    Books →
                  </Link>
                )}
                {r.kind === "item" && (
                  <Link href="/inventory" className="text-xs text-indigo-700">
                    Inventory →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <RoomScan
        key={roomScan ? `scan-${roomId}` : "closed"}
        open={roomScan}
        onClose={() => setRoomScan(false)}
        initialRoomId={roomId}
        onSaved={(n, rid) => push({ icon: "📸", title: `${n} item${n === 1 ? "" : "s"} from room photos`, sub: `Added to ${store.get("rooms", rid)?.name ?? "inventory"}`, kind: "item", ref: rid })}
      />
      <Scanner open={scan} onClose={() => setScan(false)} onScan={(c) => void onScan(c)} continuous title="Scan anything" hint="Book ISBNs are added straight to Books. Product barcodes open an item form. Box QR labels show what's inside." />
      <Drawer open={!!item} onClose={() => setItem(null)} title="New inventory item">
        {item && (
          <EntityForm
            key={item.barcode ?? item.photos?.[0]?.id ?? "x"}
            table="items"
            initial={item}
            onDone={(saved) => {
              setItem(null);
              if (saved) push({ icon: "🛋️", title: saved.name, sub: `Added to ${db.rooms.find((r) => r.id === saved.room_id)?.name ?? "inventory"}`, kind: "item", ref: saved.id });
            }}
          />
        )}
      </Drawer>
      <Drawer open={!!box} onClose={() => setBox(null)} title={box ? `Box #${box.number}` : ""}>
        {box && (
          <div className="space-y-3">
            <div className="text-xl font-bold">{box.label}</div>
            <div className="text-sm text-gray-500">
              {db.rooms.find((r) => r.id === box.room_id)?.name ?? "No room"} → {box.destination_room || "?"} · {optionLabel(BOX_STATUSES, box.status)}
            </div>
            <div className="flex flex-wrap gap-1">
              {BOX_STATUSES.map((s) => (
                <button
                  key={s.value}
                  className={box.status === s.value ? "btn-primary px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
                  onClick={() => setBox(store.update("boxes", box.id, { status: s.value as Box["status"] }) ?? null)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {box.contents && <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-sm">{box.contents}</p>}
            <ul className="list-disc pl-5 text-sm">
              {db.items
                .filter((i) => i.box_id === box.id)
                .map((i) => (
                  <li key={i.id}>{i.name}</li>
                ))}
              {db.books
                .filter((b) => b.box_id === box.id)
                .map((b) => (
                  <li key={b.id}>📚 {b.title}</li>
                ))}
            </ul>
            <Link href="/boxes" className="btn-secondary">
              Open in Boxes
            </Link>
          </div>
        )}
      </Drawer>
    </div>
  );
}
