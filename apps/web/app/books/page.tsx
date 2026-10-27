"use client";

import { BOOK_GENRES, DISPOSITION_COLORS, DISPOSITIONS, estimateMoveSize, formatMoney, guessGenre, lookupBook, normalizeIsbn, optionLabel, sum, type Book } from "@moving/shared";
import { useMemo, useState } from "react";
import { PriceHint, SalesLog, SellDrawer, bookAskPrice } from "@/components/BookSelling";
import { EntityForm } from "@/components/EntityForm";
import { Scanner } from "@/components/Scanner";
import { Drawer, Empty, PageHeader, Segmented } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

type GroupKey = "genre" | "disposition" | "owner" | "none";
const QUICK = ["move", "sell", "donate", "give"] as const;
const QUICK_LABEL: Record<string, string> = { move: "Keep", sell: "Sell", donate: "Donate", give: "Give" };

function Cover({ book, className = "h-28 w-20" }: { book: Book; className?: string }) {
  return book.cover_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={book.cover_url} alt="" className={`${className} flex-none rounded object-cover shadow`} loading="lazy" />
  ) : (
    <div className={`${className} flex flex-none items-center justify-center rounded bg-gradient-to-br from-amber-100 to-amber-200 p-1 text-center text-[10px] font-semibold text-amber-900 shadow`}>{book.title.slice(0, 40)}</div>
  );
}

function DispButtons({ book }: { book: Book }) {
  const store = useStore();
  return (
    <div className="grid grid-cols-4 gap-0.5 rounded-full bg-ink/[0.06] p-0.5" role="radiogroup" aria-label="Plan for this book">
      {QUICK.map((d) => {
        const on = book.disposition === d;
        return (
          <button
            type="button"
            key={d}
            role="radio"
            aria-checked={on}
            onClick={() => store.update("books", book.id, { disposition: d })}
            className={`seg-btn min-h-9 min-w-0 truncate rounded-full px-1 text-[13px] font-semibold transition ${on ? "text-white shadow-sm" : "text-gray-600"}`}
            style={on ? { background: DISPOSITION_COLORS[d] } : undefined}
          >
            {QUICK_LABEL[d]}
          </button>
        );
      })}
    </div>
  );
}

export default function BooksPage() {
  const db = useDb();
  const store = useStore();
  const [scan, setScan] = useState(false);
  const [log, setLog] = useState<{ code: string; msg: string; id?: string; ok: boolean }[]>([]);
  const [editing, setEditing] = useState<Book | "new" | null>(null);
  const [group, setGroup] = useState<GroupKey>("genre");
  const [disp, setDisp] = useState("");
  const [genre, setGenre] = useState("");
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"library" | "sales">("library");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [selling, setSelling] = useState(false);
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const [defaults, setDefaults] = useState<{ disposition: Book["disposition"]; room_id: string | null; box_id: string | null; owner_member_id: string | null }>({ disposition: "undecided", room_id: null, box_id: null, owner_member_id: null });

  const onScan = async (raw: string) => {
    const isbn = normalizeIsbn(raw);
    if (!isbn) {
      setLog((l) => [{ code: raw, msg: "Not a book ISBN barcode", ok: false }, ...l]);
      return;
    }
    const dup = store.getSnapshot().books.find((b) => b.isbn === isbn);
    if (dup) {
      setLog((l) => [{ code: isbn, msg: `Already catalogued: ${dup.title}`, id: dup.id, ok: false }, ...l]);
      return;
    }
    setLog((l) => [{ code: isbn, msg: "Looking up…", ok: true }, ...l]);
    const info = await lookupBook(isbn).catch(() => null);
    const row = info
      ? (() => {
          const { source: _s, ...rest } = info;
          return store.insert("books", { ...rest, ...defaults });
        })()
      : store.insert("books", { isbn, title: `Unknown book (${isbn})`, genre: guessGenre([], ""), ...defaults });
    setLog((l) => l.map((e) => (e.code === isbn && e.msg === "Looking up…" ? { code: isbn, msg: info ? info.title : "Not found — tap to add details", id: row.id, ok: !!info } : e)));
  };

  const books = useMemo(() => {
    const needle = q.toLowerCase();
    return db.books
      .filter((b) => (!disp || b.disposition === disp) && (!genre || b.genre === genre) && (!owner || b.owner_member_id === owner))
      .filter((b) => !needle || `${b.title} ${b.subtitle} ${b.authors.join(" ")} ${b.isbn} ${b.publisher}`.toLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [db.books, disp, genre, owner, q]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "", label: "", rows: books }];
    const map = new Map<string, Book[]>();
    for (const b of books) {
      const k = group === "genre" ? b.genre : group === "disposition" ? b.disposition : (b.owner_member_id ?? "");
      map.set(k, [...(map.get(k) ?? []), b]);
    }
    return [...map.entries()]
      .map(([key, rows]) => ({
        key,
        rows,
        label: group === "genre" ? optionLabel(BOOK_GENRES, key) || "Uncategorized" : group === "disposition" ? optionLabel(DISPOSITIONS, key) : db.family_members.find((m) => m.id === key)?.name || "Shared / unassigned",
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [books, group, db.family_members]);

  const sellValue = sum(db.books.filter((b) => b.disposition === "sell").map((b) => b.sale_price ?? b.est_value));
  const moveSize = estimateMoveSize(db);
  const current = editing && editing !== "new" ? (db.books.find((b) => b.id === editing.id) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Books"
        icon="📚"
        subtitle={`${db.books.length} books · ${db.books.filter((b) => b.disposition === "sell").length} to sell (${formatMoney(sellValue)}) · ${db.books.filter((b) => b.disposition === "donate").length} to donate · ${db.books.filter((b) => b.disposition === "move").length} keeping${moveSize.bookLbs ? ` · ≈ ${moveSize.bookLbs.toLocaleString()} lbs to move (in your mover quote)` : ""}`}
        actions={
          <>
            <button
              className={selecting ? "btn-accent" : "btn-secondary"}
              onClick={() => {
                setTab("library");
                setSelecting((s) => !s);
                setPicked([]);
              }}
            >
              {selecting ? "✕ Cancel selling" : "💲 Select to sell"}
            </button>
            <button className="btn-secondary" onClick={() => setEditing("new")}>
              + Add manually
            </button>
            <button className="btn-primary" onClick={() => setScan(true)}>
              ▦ Scan books
            </button>
          </>
        }
      />

      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "library", label: `Library (${db.books.length})` },
            { value: "sales", label: `Sales log (${db.book_sales.length})` },
          ]}
        />
      </div>

      {tab === "sales" ? (
        <SalesLog />
      ) : (
      <>
      <div className="card mb-5 grid grid-cols-1 gap-x-6 gap-y-1 bg-indigo-50/50 lg:grid-cols-2">
        <div className="mb-1 text-sm font-semibold text-indigo-900 lg:col-span-2">Scanning defaults — applied to every new book you scan:</div>
        <label className="flex min-h-11 min-w-0 items-center justify-between gap-3 text-[15px]">
          Plan
          <select className="ios-popup min-h-9 min-w-0 max-w-[60%] truncate bg-white/80" value={defaults.disposition} onChange={(e) => setDefaults({ ...defaults, disposition: e.target.value as Book["disposition"] })}>
            {DISPOSITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 min-w-0 items-center justify-between gap-3 text-[15px]">
          Belongs to
          <select className="ios-popup min-h-9 min-w-0 max-w-[60%] truncate bg-white/80" value={defaults.owner_member_id ?? ""} onChange={(e) => setDefaults({ ...defaults, owner_member_id: e.target.value || null })}>
            <option value="">Shared</option>
            {db.family_members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 min-w-0 items-center justify-between gap-3 text-[15px]">
          Room
          <select className="ios-popup min-h-9 min-w-0 max-w-[60%] truncate bg-white/80" value={defaults.room_id ?? ""} onChange={(e) => setDefaults({ ...defaults, room_id: e.target.value || null })}>
            <option value="">—</option>
            {db.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 min-w-0 items-center justify-between gap-3 text-[15px]">
          Packing into box
          <select className="ios-popup min-h-9 min-w-0 max-w-[60%] truncate bg-white/80" value={defaults.box_id ?? ""} onChange={(e) => setDefaults({ ...defaults, box_id: e.target.value || null })}>
            <option value="">—</option>
            {[...db.boxes]
              .sort((a, b) => a.number - b.number)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.number} {b.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      {log.length > 0 && (
        <section className="card mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Just scanned</h2>
            <button className="text-xs text-gray-500" onClick={() => setLog([])}>
              Clear
            </button>
          </div>
          <ul className="space-y-3">
            {log.slice(0, 8).map((e, i) => {
              const b = e.id ? db.books.find((x) => x.id === e.id) : null;
              return (
                <li key={`${e.code}-${i}`} className="space-y-2">
                  <div className="flex items-center gap-3">
                    {b ? <Cover book={b} className="h-14 w-10" /> : <span className="w-10 flex-none text-center">{e.ok ? "⏳" : "⚠️"}</span>}
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => b && setEditing(b)}>
                      <div className="truncate text-[15px] font-semibold">{e.msg}</div>
                      <div className="truncate text-[13px] text-gray-500">{b ? b.authors.join(", ") || e.code : e.code}</div>
                    </button>
                  </div>
                  {b && <DispButtons book={b} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="@container mb-4 space-y-2">
        <div className="grid grid-cols-1 items-center gap-2 @lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <input className="input w-full min-w-0" type="search" placeholder="Search title, author, ISBN…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid min-w-0 grid-cols-3 gap-2 @lg:contents">
            <select className="ios-popup min-h-9 w-full min-w-0 truncate bg-ink/[0.06] @lg:w-auto" aria-label="Plan" value={disp} onChange={(e) => setDisp(e.target.value)}>
              <option value="">Plan</option>
              {DISPOSITIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select className="ios-popup min-h-9 w-full min-w-0 truncate bg-ink/[0.06] @lg:w-auto" aria-label="Genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Genre</option>
              {BOOK_GENRES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select className="ios-popup min-h-9 w-full min-w-0 truncate bg-ink/[0.06] @lg:w-auto" aria-label="Belongs to" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Owner</option>
              {db.family_members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[13px] text-gray-500 @sm:inline">Group by</span>
          <div className="grid flex-1 grid-cols-4 gap-0.5 rounded-full bg-ink/[0.06] p-0.5" role="radiogroup" aria-label="Group by">
            {(
              [
                { value: "genre", label: "Genre" },
                { value: "disposition", label: "Plan" },
                { value: "owner", label: "Owner" },
                { value: "none", label: "A–Z" },
              ] as { value: GroupKey; label: string }[]
            ).map((o) => (
              <button
                type="button"
                key={o.value}
                role="radio"
                aria-checked={group === o.value}
                onClick={() => setGroup(o.value)}
                className={`seg-btn min-h-9 min-w-0 truncate rounded-full px-1 text-[13px] font-semibold transition ${group === o.value ? "bg-white text-ink shadow-sm" : "text-gray-600"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {books.length ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              {g.label && (
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                  {g.label} <span className="font-normal">({g.rows.length})</span>
                </h2>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((b) => {
                  const on = picked.includes(b.id);
                  const sold = b.sale_status === "sold" || b.sale_status === "pending";
                  return (
                  <div key={b.id} className={`card relative flex flex-col gap-3 p-3 ${selecting && on ? "ring-2 ring-ink" : ""}`}>
                    {selecting && (
                      <button
                        type="button"
                        aria-label={on ? "Unselect" : "Select"}
                        disabled={sold}
                        onClick={() => togglePick(b.id)}
                        className={`absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${on ? "border-ink bg-ink text-lime" : "border-gray-300 bg-white"} ${sold ? "opacity-30" : ""}`}
                      >
                        {on ? "✓" : ""}
                      </button>
                    )}
                    <div className="flex min-w-0 gap-3">
                    <button type="button" className="flex-none" onClick={() => (selecting && !sold ? togglePick(b.id) : setEditing(b))}>
                      <Cover book={b} className="h-24 w-16" />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <button type="button" className="pr-6 text-left" onClick={() => (selecting && !sold ? togglePick(b.id) : setEditing(b))}>
                        <div className="line-clamp-2 text-[15px] font-semibold leading-tight">{b.title}</div>
                        <div className="truncate text-[13px] text-gray-500">{b.authors.join(", ")}</div>
                        <div className="mt-1 line-clamp-2 text-[12px] text-gray-400">
                          {[optionLabel(BOOK_GENRES, b.genre), b.published, b.est_value ? formatMoney(b.est_value) : null].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                      {sold ? (
                        <div className="mt-1 text-[12px] font-semibold text-emerald-700">{b.sale_status === "sold" ? "✓ Sold" : "⏳ Sale pending"}</div>
                      ) : (
                        b.disposition === "sell" && <PriceHint book={b} />
                      )}
                    </div>
                    </div>
                    <DispButtons book={b} />
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty icon="📚" title={db.books.length ? "No books match" : "Catalogue your books"}>
          Tap <b>▦ Scan books</b> and scan the barcodes on the back covers one after another. Title, author, cover and genre are filled in automatically.
        </Empty>
      )}
      </>
      )}

      {selecting && tab === "library" && (
        <div className="sticky bottom-20 z-30 mt-6 flex flex-wrap items-center gap-3 rounded-3xl bg-ink p-3 pl-5 text-white shadow-2xl lg:bottom-4">
          <div className="flex-1 text-sm">
            <b>{picked.length}</b> selected · asking {formatMoney(sum(db.books.filter((b) => picked.includes(b.id)).map(bookAskPrice)))}
          </div>
          <button
            className="btn-ghost !text-white"
            onClick={() => setPicked(books.filter((b) => b.disposition === "sell" && b.sale_status !== "sold" && b.sale_status !== "pending").map((b) => b.id))}
          >
            All “Sell”
          </button>
          <button className="btn-accent" disabled={!picked.length} onClick={() => setSelling(true)}>
            Sell {picked.length || ""} together →
          </button>
        </div>
      )}
      <SellDrawer
        open={selling}
        books={db.books.filter((b) => picked.includes(b.id))}
        onClose={() => {
          setSelling(false);
          const left = picked.filter((id) => {
            const b = db.books.find((x) => x.id === id);
            return b && b.sale_status !== "sold" && b.sale_status !== "pending";
          });
          setPicked(left);
          if (!left.length) setSelecting(false);
        }}
        onSold={() => undefined}
      />

      <Scanner open={scan} onClose={() => setScan(false)} onScan={(c) => void onScan(c)} continuous title="Scan book barcodes" hint="Scan the ISBN barcode on each back cover. Keep going — each book is added automatically." />
      <Drawer open={!!editing} onClose={() => setEditing(null)} title={current ? current.title : "Add book"}>
        {editing && <EntityForm key={current?.id ?? "new"} table="books" row={current} initial={defaults} onDone={() => setEditing(null)} />}
      </Drawer>
    </div>
  );
}
