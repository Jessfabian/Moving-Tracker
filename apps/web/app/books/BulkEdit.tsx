"use client";

import { BOOK_FORMATS, BOOK_GENRES, DISPOSITIONS, SCHEMAS, type Book, type Option } from "@moving/shared";
import { useState } from "react";
import { useDb, useStore } from "@/lib/store-context";

const KEEP = "__keep__";
const CONDITIONS: Option[] = SCHEMAS.books.fields.find((f) => f.key === "condition")?.options ?? [];

type Patch = Partial<Pick<Book, "disposition" | "genre" | "owner_member_id" | "room_id" | "box_id" | "condition" | "format" | "published" | "publisher">> & { authors?: string[] };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-4 py-1.5 text-[15px]">
      <span className="flex-none">{label}</span>
      {children}
    </label>
  );
}

const sel = "ios-popup min-h-9 w-[58%] min-w-0 flex-none truncate text-right [text-align-last:right]";
const txt = "min-h-9 w-[58%] min-w-0 flex-none rounded-lg bg-ink/[0.06] px-3 text-right text-[15px] outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-ink/20";

/** Change plan, genre, author… on many books at once. Blank / "No change" fields are left alone. */
export function BulkEdit({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const db = useDb();
  const store = useStore();
  const [p, setP] = useState<Record<string, string>>({});
  const pick = (k: string) => p[k] ?? KEEP;
  const set = (k: string, v: string) => setP((x) => ({ ...x, [k]: v }));
  const text = (k: string) => (pick(k) === KEEP ? "" : pick(k));

  const patch: Patch = {};
  if (pick("disposition") !== KEEP) patch.disposition = pick("disposition") as Book["disposition"];
  if (pick("genre") !== KEEP) patch.genre = pick("genre");
  if (pick("condition") !== KEEP) patch.condition = pick("condition") as Book["condition"];
  if (pick("format") !== KEEP) patch.format = pick("format");
  for (const k of ["owner_member_id", "room_id", "box_id"] as const) if (pick(k) !== KEEP) patch[k] = pick(k) || null;
  if (text("authors").trim()) patch.authors = text("authors").split(/\s*[,;&]\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  if (/^\d{4}$/.test(text("published").trim())) patch.published = text("published").trim();
  if (text("publisher").trim()) patch.publisher = text("publisher").trim();
  const changes = Object.keys(patch).length;

  const apply = () => {
    for (const id of ids) store.update("books", id, patch);
    onDone();
  };

  const keepOpt = <option value={KEEP}>No change</option>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Changes apply to all <b>{ids.length}</b> selected books. Anything left on <i>No change</i> or blank stays as it is.
      </p>
      <div className="ios-list divide-y divide-gray-200/70">
        <Row label="Plan">
          <select className={sel} value={pick("disposition")} onChange={(e) => set("disposition", e.target.value)}>
            {keepOpt}
            {DISPOSITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Genre">
          <select className={sel} value={pick("genre")} onChange={(e) => set("genre", e.target.value)}>
            {keepOpt}
            {BOOK_GENRES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Belongs to">
          <select className={sel} value={pick("owner_member_id")} onChange={(e) => set("owner_member_id", e.target.value)}>
            {keepOpt}
            <option value="">Shared</option>
            {db.family_members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Room">
          <select className={sel} value={pick("room_id")} onChange={(e) => set("room_id", e.target.value)}>
            {keepOpt}
            <option value="">None</option>
            {db.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Box">
          <select className={sel} value={pick("box_id")} onChange={(e) => set("box_id", e.target.value)}>
            {keepOpt}
            <option value="">None</option>
            {[...db.boxes]
              .sort((a, b) => a.number - b.number)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.number} {b.label}
                </option>
              ))}
          </select>
        </Row>
        <Row label="Condition">
          <select className={sel} value={pick("condition")} onChange={(e) => set("condition", e.target.value)}>
            {keepOpt}
            {CONDITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Format">
          <select className={sel} value={pick("format")} onChange={(e) => set("format", e.target.value)}>
            {keepOpt}
            {BOOK_FORMATS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Row>
      </div>
      <div className="ios-list divide-y divide-gray-200/70">
        <Row label="Author(s)">
          <input className={txt} placeholder="No change" value={text("authors")} onChange={(e) => set("authors", e.target.value)} />
        </Row>
        <Row label="Publisher">
          <input className={txt} placeholder="No change" value={text("publisher")} onChange={(e) => set("publisher", e.target.value)} />
        </Row>
        <Row label="Year">
          <input className={txt} placeholder="No change" inputMode="numeric" maxLength={4} value={text("published")} onChange={(e) => set("published", e.target.value.replace(/\D/g, ""))} />
        </Row>
      </div>
      <div className="sheet-footer flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn-primary flex-1" disabled={!changes} onClick={apply}>
          {changes ? `Update ${ids.length} book${ids.length === 1 ? "" : "s"}` : "Choose a change"}
        </button>
      </div>
    </div>
  );
}
