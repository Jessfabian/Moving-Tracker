"use client";

import { DISPOSITION_COLORS, DISPOSITIONS, formatMoney, guessItemCategory, ITEM_CATEGORIES, itemPriceIdea, itemPriceQuery, optionLabel, productToItemPatch, sum, type Item, type Room } from "@moving/shared";
import { useMemo, useRef, useState } from "react";
import { lookupProduct } from "@/lib/lookup";
import { EntityForm } from "@/components/EntityForm";
import { LivePrices } from "@/components/LivePrices";
import { MediaThumb } from "@/components/Media";
import { RoomScan } from "@/components/RoomScan";
import { Scanner } from "@/components/Scanner";
import { Drawer, Empty, PageHeader } from "@/components/ui";
import { compressImage } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";
import { SwipeRow, showUndo, useDeleteWithUndo, useHiddenRows, type SwipeAction } from "@/components/Swipe";
import { SelectActions, SelectBar, SelectCircle, useBulkDelete, useBulkUpdate, useSelection } from "@/components/Selection";

type Editing = { row: Item | null; initial?: Partial<Item> } | null;

const SHORT_DISPOSITION: Record<string, string> = { undecided: "Decide", move: "Keep", give: "Give", store: "Store", trash: "Trash" };

export default function InventoryPage() {
  const db = useDb();
  const store = useStore();
  const [roomId, setRoomId] = useState<string>("");
  const [disp, setDisp] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [editRoom, setEditRoom] = useState<Room | "new" | null>(null);
  const [scan, setScan] = useState(false);
  const [roomScan, setRoomScan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  const rooms = useMemo(() => [...db.rooms].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), [db.rooms]);
  const room = rooms.find((r) => r.id === roomId);
  const hiddenRows = useHiddenRows();
  const del = useDeleteWithUndo();
  const rowActions = (i: Item): SwipeAction[] => [
    { label: "Hide", icon: "🙈", onClick: () => { hiddenRows.hide({ table: "items", id: i.id, label: i.name }); showUndo(`Hid “${i.name}” · find it in Settings`, () => hiddenRows.unhide("items", i.id)); } },
    { label: "Delete", icon: "🗑", tone: "danger", onClick: () => del("items", i.id, `“${i.name}”`) },
  ];
  const items = useMemo(() => {
    const needle = q.toLowerCase();
    const hidden = new Set(hiddenRows.rows.filter((h) => h.table === "items").map((h) => h.id));
    return db.items
      .filter((i) => !hidden.has(i.id))
      .filter((i) => !roomId || (roomId === "none" ? !i.room_id : i.room_id === roomId))
      .filter((i) => !disp || (disp === "car" ? i.in_car : i.disposition === disp))
      .filter((i) => !cat || i.category === cat)
      .filter((i) => !needle || `${i.name} ${i.brand} ${i.notes} ${i.barcode}`.toLowerCase().includes(needle))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [db.items, roomId, disp, cat, q, hiddenRows.rows]);
  const sel = useSelection(items.map((i) => i.id));
  const bulk = useBulkUpdate<Item>("items", sel);
  const bulkDelete = useBulkDelete("items", sel);
  const tapItem = (i: Item) => (sel.active ? sel.toggle(i.id) : setEditing({ row: i }));

  const defaults = (): Partial<Item> => ({ room_id: roomId && roomId !== "none" ? roomId : null });

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("Saving photo…");
    const photos = await Promise.all([...files].map((f) => compressImage(f)));
    setBusy(null);
    setEditing({ row: null, initial: { ...defaults(), photos } });
  };

  const onScan = async (code: string) => {
    setBusy(`Looking up ${code}…`);
    const existing = db.items.find((i) => i.barcode === code);
    if (existing) {
      setBusy(null);
      if (confirm(`“${existing.name}” is already in your inventory. Add another one (quantity +1)?`)) store.update("items", existing.id, { quantity: (existing.quantity || 1) + 1 });
      else setEditing({ row: existing });
      return;
    }
    const p = await lookupProduct(code).catch(() => null);
    setBusy(null);
    setEditing({ row: null, initial: { ...defaults(), ...(p ? productToItemPatch(p, {}) : {}), barcode: code, name: p?.name ?? "" } });
  };

  const quickAdd = () => {
    const names = quick
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    store.insertMany(
      "items",
      names.map((name) => {
        const m = name.match(/^(\d+)\s*x\s+(.+)$/i);
        const itemName = m ? m[2]! : name;
        return { ...defaults(), name: itemName, quantity: m ? Number(m[1]) : 1, category: guessItemCategory(itemName) };
      }),
    );
    setQuick("");
  };

  const roomStats = (id: string | null) => {
    const its = db.items.filter((i) => (id ? i.room_id === id : !i.room_id));
    return { count: its.length, value: sum(its.map((i) => (i.est_value ?? 0) * (i.quantity || 1))), decided: its.filter((i) => i.disposition !== "undecided").length };
  };

  return (
    <div>
      <PageHeader
        title="Inventory by room"
        icon="🛋️"
        subtitle="Photograph or scan everything, room by room, then decide what to move, sell, donate or toss."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setEditRoom("new")}>
              + Room
            </button>
            <button className="btn-secondary" onClick={() => setRoomScan(true)}>
              📸 Scan room
            </button>
            <button className="btn-secondary" onClick={() => setScan(true)}>
              ▦ Scan barcode
            </button>
            <button className="btn-secondary" onClick={() => photoRef.current?.click()}>
              📷 Photo item
            </button>
            <button className="btn-primary" onClick={() => setEditing({ row: null, initial: defaults() })}>
              + Add item
            </button>
          </>
        }
      />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhotos(e.target.files).then(() => (e.target.value = ""))} />
      {busy && <p className="mb-3 rounded-lg bg-indigo-50 p-2 text-sm text-indigo-800">{busy}</p>}

      <div className="no-scrollbar -mx-4 mb-5 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
        <button onClick={() => setRoomId("")} className={`card min-w-36 flex-none py-3 text-left ${roomId === "" ? "ring-2 ring-indigo-500" : ""}`}>
          <div className="font-bold">🏠 Whole house</div>
          <div className="text-xs text-gray-500">
            {db.items.length} items · {formatMoney(sum(db.items.map((i) => (i.est_value ?? 0) * (i.quantity || 1))))}
          </div>
        </button>
        {rooms.map((r) => {
          const s = roomStats(r.id);
          return (
            <button key={r.id} onClick={() => setRoomId(r.id)} className={`card min-w-36 flex-none py-3 text-left ${roomId === r.id ? "ring-2 ring-indigo-500" : ""}`} style={{ borderLeft: `6px solid ${r.color || "#e5e7eb"}` }}>
              <div className="truncate font-bold">{r.name}</div>
              <div className="text-xs text-gray-500">
                {s.count} items{s.value ? ` · ${formatMoney(s.value)}` : ""}
              </div>
              {s.count > 0 && <div className="mt-1 text-[11px] text-gray-400">{Math.round((s.decided / s.count) * 100)}% decided</div>}
            </button>
          );
        })}
        {roomStats(null).count > 0 && (
          <button onClick={() => setRoomId("none")} className={`card min-w-36 flex-none py-3 text-left ${roomId === "none" ? "ring-2 ring-indigo-500" : ""}`}>
            <div className="font-bold">❔ No room</div>
            <div className="text-xs text-gray-500">{roomStats(null).count} items</div>
          </button>
        )}
      </div>

      {room && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{room.name}</h2>
            <p className="text-sm text-gray-500">
              {[room.level, room.destination_room && `→ ${room.destination_room} in new home`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button className="btn-ghost" onClick={() => setEditRoom(room)}>
            ✏️ Edit room
          </button>
        </div>
      )}

      <div className="card mb-4">
        <label className="label" htmlFor="quick">
          ⚡ Quick add{room ? ` to ${room.name}` : ""}
        </label>
        <div className="flex items-start gap-2">
          <textarea id="quick" rows={1} className="input min-w-0 flex-1 resize-none" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), quickAdd())} placeholder="Sofa, 2x lamp" />
          <button className="btn-primary shrink-0" onClick={quickAdd} disabled={!quick.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <select
          className="input sm:w-auto"
          aria-label="Room"
          value={roomId}
          onChange={(e) => (e.target.value === "__new" ? setEditRoom("new") : setRoomId(e.target.value))}
        >
          <option value="">🏠 All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({roomStats(r.id).count})
            </option>
          ))}
          <option value="none">❔ No room</option>
          <option value="__new">+ New room…</option>
        </select>
        <input type="search" className="input order-first col-span-2 sm:order-none sm:max-w-xs sm:flex-1" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input sm:w-auto" value={disp} onChange={(e) => setDisp(e.target.value)}>
          <option value="">Any plan</option>
          <option value="car">🚗 Coming in our car</option>
          {DISPOSITIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select className="input sm:w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Any category</option>
          {ITEM_CATEGORIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {!sel.active && <SelectBar sel={sel} />}
      </div>

      {sel.active && <SelectBar sel={sel} className="mb-3" />}

      {items.length > 0 && (
        <div className="ios-list md:grid md:grid-cols-2 lg:hidden" style={{ ["--ios-sep" as string]: "6.25rem" }}>
          {items.map((i) => {
            const box = db.boxes.find((b) => b.id === i.box_id);
            const r = !roomId ? rooms.find((x) => x.id === i.room_id) : null;
            const color = DISPOSITION_COLORS[i.disposition];
            return (
              <SwipeRow key={i.id} radius="rounded-none" actions={sel.active ? [] : rowActions(i)}>
              <div className={`flex min-h-[4.5rem] items-center pr-3 transition-colors ${sel.has(i.id) ? "bg-accent/[0.07]" : "bg-white"} ${sel.active ? "" : "pl-3"}`}>
                {sel.active && (
                  <button type="button" role="checkbox" aria-checked={sel.has(i.id)} aria-label={`Select ${i.name}`} className="flex w-11 shrink-0 items-center justify-center self-stretch" onClick={() => sel.toggle(i.id)}>
                    <SelectCircle on={sel.has(i.id)} />
                  </button>
                )}
                <button className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left" onClick={() => tapItem(i)}>
                  {i.photos[0] ? (
                    <MediaThumb media={i.photos[0]} className="pointer-events-none h-12 w-12 shrink-0 rounded-xl border-0" />
                  ) : i.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.image_url} alt="" className="pointer-events-none h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-gray-100" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl text-gray-400">{i.barcode ? "▦" : "🛋️"}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] leading-snug">
                      {i.quantity > 1 && <span className="text-gray-500">{i.quantity}× </span>}
                      {i.name}
                    </div>
                    <div className="truncate text-[13px] text-gray-500">
                      {[i.in_car && "🚗 In our car", r?.name, optionLabel(ITEM_CATEGORIES, i.category), box && `📦 #${box.number}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1 pl-2">
                  <select
                    aria-label={`What to do with ${i.name}`}
                    className="ios-popup"
                    style={{ backgroundColor: `${color}1a`, color }}
                    value={i.disposition}
                    onChange={(e) => store.update("items", i.id, { disposition: e.target.value as Item["disposition"] })}
                  >
                    {DISPOSITIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {SHORT_DISPOSITION[d.value] ?? d.label}
                      </option>
                    ))}
                  </select>
                  <span className={`text-[13px] ${i.est_value ? "font-semibold" : "text-gray-400"}`}>
                    {i.est_value ? formatMoney(i.est_value) : `~${formatMoney(itemPriceIdea(i).likely)}`}
                  </span>
                </div>
              </div>
              </SwipeRow>
            );
          })}
        </div>
      )}

      {items.length ? (
        <div className="duo-even hidden gap-3 lg:grid lg:grid-cols-4 xl:grid-cols-6">
          {items.map((i) => {
            const box = db.boxes.find((b) => b.id === i.box_id);
            const r = !roomId ? rooms.find((x) => x.id === i.room_id) : null;
            return (
              <div key={i.id} className={`card relative flex flex-col overflow-hidden p-0 ${sel.has(i.id) ? "ring-2 ring-accent" : ""}`}>
                {sel.active && <SelectCircle on={sel.has(i.id)} className="pointer-events-none absolute left-2 top-2 z-10" />}
                <button className="flex flex-1 flex-col text-left" role={sel.active ? "checkbox" : undefined} aria-checked={sel.active ? sel.has(i.id) : undefined} onClick={() => tapItem(i)}>
                  {i.photos[0] ? (
                    <MediaThumb media={i.photos[0]} className="pointer-events-none aspect-square h-auto w-full rounded-none border-0" />
                  ) : i.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.image_url} alt="" className="pointer-events-none aspect-square w-full bg-white object-contain p-3" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-gray-50 text-4xl text-gray-300">{i.barcode ? "▦" : "🛋️"}</div>
                  )}
                  <div className="space-y-1 p-3">
                    <div className="line-clamp-2 text-sm font-semibold">
                      {i.quantity > 1 && <span className="text-gray-500">{i.quantity}× </span>}
                      {i.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {[i.in_car && "🚗 In our car", r?.name, optionLabel(ITEM_CATEGORIES, i.category), box && `📦 #${box.number}`].filter(Boolean).join(" · ")}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="chip" style={{ background: `${DISPOSITION_COLORS[i.disposition]}1a`, color: DISPOSITION_COLORS[i.disposition] }}>
                        {optionLabel(DISPOSITIONS, i.disposition)}
                      </span>
                      {i.est_value ? (
                        <span className="text-xs font-semibold">{formatMoney(i.est_value)}</span>
                      ) : (
                        <span className="text-xs text-gray-400" title="Price idea for a used one">
                          ~{formatMoney(itemPriceIdea(i).likely)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex border-t border-gray-100 text-[11px]">
                  {(["move", "sell", "donate", "trash"] as const).map((d) => (
                    <button
                      key={d}
                      className="flex-1 py-1.5 font-semibold hover:bg-gray-50"
                      style={{ color: i.disposition === d ? "white" : DISPOSITION_COLORS[d], background: i.disposition === d ? DISPOSITION_COLORS[d] : undefined }}
                      onClick={() => store.update("items", i.id, { disposition: d })}
                    >
                      {d === "move" ? "Keep" : d[0]!.toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon="📷" title={db.items.length ? "No items match" : "Start your inventory"}>
          Walk through each room and tap <b>📷 Photo item</b> or <b>▦ Scan barcode</b>, or type a quick list above.
        </Empty>
      )}

      <SelectActions sel={sel}>
        <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-5">
          <select
            className="min-h-11 min-w-0 truncate rounded-xl bg-white px-3 font-semibold text-ink"
            aria-label="Set plan"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === "car") bulk({ in_car: true, disposition: "move" }, "In our car");
              else if (v === "movers") bulk({ in_car: false }, "Movers take it");
              else if (v) bulk({ disposition: v as Item["disposition"] }, optionLabel(DISPOSITIONS, v));
            }}
          >
            <option value="">Plan…</option>
            {DISPOSITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
            <option value="car">🚗 Coming in our car</option>
            <option value="movers">🚚 Movers take it</option>
          </select>
          <select className="min-h-11 min-w-0 truncate rounded-xl bg-white/15 px-3" aria-label="Move to room" value="" onChange={(e) => e.target.value && bulk({ room_id: e.target.value }, `Moved to ${rooms.find((r) => r.id === e.target.value)?.name ?? "room"}`)}>
            <option value="">Room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select className="min-h-11 min-w-0 truncate rounded-xl bg-white/15 px-3" aria-label="Pack in box" value="" onChange={(e) => e.target.value && bulk({ box_id: e.target.value }, "Packed")}>
            <option value="">Box…</option>
            {[...db.boxes]
              .sort((a, b) => a.number - b.number)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.number} {b.label}
                </option>
              ))}
          </select>
          <button className="min-h-11 rounded-xl bg-red-600 px-3 font-semibold" onClick={bulkDelete}>
            🗑 Delete
          </button>
        </div>
      </SelectActions>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.row ? editing.row.name : "New item"}>
        {editing?.row && <PriceIdea item={editing.row} onUse={(row) => setEditing({ row })} />}
        {editing && (
          <EntityForm
            key={editing.row ? `${editing.row.id}:${editing.row.est_value}` : JSON.stringify(editing.initial?.barcode ?? editing.initial?.photos?.[0]?.id ?? "new")}
            table="items"
            row={editing.row}
            initial={editing.initial}
            onDone={() => {
              if (editing.row) sel.release([editing.row.id]);
              setEditing(null);
            }}
          />
        )}
      </Drawer>
      <Drawer open={!!editRoom} onClose={() => setEditRoom(null)} title={editRoom === "new" ? "New room" : "Edit room"}>
        {editRoom && (
          <EntityForm
            table="rooms"
            row={editRoom === "new" ? null : editRoom}
            initial={{ sort: rooms.length }}
            onDone={(r) => {
              setEditRoom(null);
              if (r) setRoomId(r.id);
              else setRoomId("");
            }}
          />
        )}
      </Drawer>
      <RoomScan
        key={roomScan ? `scan-${roomId}` : "closed"}
        open={roomScan}
        onClose={() => setRoomScan(false)}
        initialRoomId={roomId && roomId !== "none" ? roomId : ""}
        onSaved={(n, rid) => {
          setRoomId(rid);
          setBusy(`Added ${n} item${n === 1 ? "" : "s"} from your room photos.`);
          setTimeout(() => setBusy(null), 4000);
        }}
      />
      <Scanner open={scan} onClose={() => setScan(false)} onScan={(c) => void onScan(c)} title="Scan a product barcode" />
    </div>
  );
}

function PriceIdea({ item, onUse }: { item: Item; onUse: (row: Item) => void }) {
  const store = useStore();
  const idea = itemPriceIdea(item);
  const verdict = { sell: "💰 Worth selling", keep: "🚚 Worth moving", donate: "🎁 Donate it", either: "🤷 Your call" }[idea.verdict];
  return (
    <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">
          Price idea: {formatMoney(idea.likely)}
          {item.quantity > 1 ? " each" : ""} <span className="font-normal text-gray-500">({formatMoney(idea.low)}–{formatMoney(idea.high)} used)</span>
        </span>
        <span className="chip bg-white">{verdict}</span>
      </div>
      <p className="mt-1 text-gray-600">{idea.why}</p>
      {idea.tip && <p className="mt-1 text-gray-500">Tip: {idea.tip}</p>}
      <details className="mt-2 rounded-xl bg-white/70 px-3 py-1">
        <summary className="min-h-11 cursor-pointer content-center text-[13px] font-semibold text-indigo-700">How is this calculated?</summary>
        <ol className="list-decimal space-y-1 pb-2 pl-5 text-[13px] text-gray-600">
          {idea.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li>
            Keep or sell: it weighs ~{idea.lbs} lb, so moving it costs ~{formatMoney(idea.moveCost)} at ~$0.75/lb. If that&apos;s close to what it sells for, selling here and re-buying is cheaper.
          </li>
        </ol>
        {!item.purchase_date && <p className="pb-2 text-[12px] text-gray-500">Tip: add a purchase date — a 1-year-old TV and a 7-year-old TV are priced very differently.</p>}
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.est_value !== idea.likely && (
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => {
              const row = store.update("items", item.id, { est_value: idea.likely });
              if (row) onUse(row);
            }}>
            Use {formatMoney(idea.likely)} as value
          </button>
        )}
        {idea.links.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-700 underline">
            {l.label}
          </a>
        ))}
      </div>
      <LivePrices
        className="mt-3"
        kind="item"
        query={itemPriceQuery(item)}
        actions={(r) => {
          const typical = r.summary.newMedian;
          if (typical == null) return [];
          const used = itemPriceIdea({ ...item, retail_price: typical }).likely;
          return [
            {
              label: `Use ${formatMoney(typical)} new → ${formatMoney(used)} used`,
              onClick: () => {
                const row = store.update("items", item.id, { retail_price: typical, est_value: used });
                if (row) onUse(row);
              },
            },
          ];
        }}
      />
    </div>
  );
}