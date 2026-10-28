"use client";

import { buildReport, DISPOSITION_COLORS, formatMoney, ITEM_CATEGORIES, optionLabel, SALE_STATUSES, SALES_TO_BUDGET, salesForBudget, salesProceeds, sum, type Book, type Item } from "@moving/shared";
import { useMemo, useState } from "react";
import { LivePrices } from "@/components/LivePrices";
import { MediaThumb } from "@/components/Media";
import { PageHeader, Segmented, Stat } from "@/components/ui";
import { printHtml } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

type Tab = "sell" | "donate" | "give" | "trash";
type Entry = { kind: "items"; row: Item } | { kind: "books"; row: Book };

function BookLivePrices({ book, onPrice }: { book: Book; onPrice: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="mt-1 min-h-8 text-[12px] font-semibold text-emerald-700" onClick={() => setOpen(true)}>
        💲 Live prices
      </button>
    );
  return (
    <LivePrices
      auto
      className="mt-2"
      kind="book"
      isbn={book.isbn}
      actions={(r) => (r.summary.suggested != null ? [{ label: `Price it at ${formatMoney(r.summary.suggested)}`, onClick: () => onPrice(r.summary.suggested!) }] : [])}
    />
  );
}

const MARKETPLACES = [
  { label: "Facebook Marketplace", url: "https://www.facebook.com/marketplace/create/item" },
  { label: "Craigslist", url: "https://post.craigslist.org/" },
  { label: "OfferUp", url: "https://offerup.com/" },
  { label: "Nextdoor", url: "https://nextdoor.com/for_sale_and_free/" },
  { label: "eBay", url: "https://www.ebay.com/sl/sell" },
];

function listingText(e: Entry, city: string) {
  if (e.kind === "books") {
    const b = e.row;
    return `${b.title}${b.authors.length ? ` by ${b.authors.join(", ")}` : ""}\nCondition: ${b.condition.replace("_", " ")}\nISBN ${b.isbn}\n${b.sale_price ? `$${b.sale_price}` : ""}\nMoving sale — pickup in ${city || "town"}.`;
  }
  const i = e.row;
  return `${i.brand ? `${i.brand} ` : ""}${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}\nCondition: ${i.condition.replace("_", " ")}\n${i.sale_price ? `Asking $${i.sale_price}` : ""}\n${i.notes}\nMoving sale — must go by our move date! Pickup in ${city || "town"}.`.replace(/\n{2,}/g, "\n");
}

export default function SellPage() {
  const db = useDb();
  const store = useStore();
  const [tab, setTab] = useState<Tab>("sell");
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const move = db.moves[0];

  const entries = useMemo<Entry[]>(
    () => [
      ...db.items.filter((i) => i.disposition === tab).map((row) => ({ kind: "items" as const, row })),
      ...db.books.filter((b) => b.disposition === tab).map((row) => ({ kind: "books" as const, row })),
    ].filter((e) => !status || e.row.sale_status === status),
    [db.items, db.books, tab, status],
  );

  const sellables = [...db.items.filter((i) => i.disposition === "sell"), ...db.books.filter((b) => b.disposition === "sell")];
  const sold = sellables.filter((s) => s.sale_status === "sold");
  const count = (d: string) => db.items.filter((i) => i.disposition === d).length + db.books.filter((b) => b.disposition === d).length;
  const donateValue = sum([...db.items, ...db.books].filter((x) => x.disposition === "donate").map((x) => x.est_value));
  const proceeds = salesProceeds(db);

  const patch = (e: Entry, p: Partial<Item & Book>) => store.update(e.kind, e.row.id, p as never);

  return (
    <div>
      <PageHeader
        title="Sell & donate"
        icon="🏷️"
        subtitle="Everything you've decided not to move. Price it, list it, and track what's sold or dropped off."
        actions={
          <button className="btn-secondary" onClick={() => void buildReport("sell", db).then(printHtml)}>
            🖨️ Print sale & donation list
          </button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To sell" icon="🏷️" value={sellables.length} sub={`${formatMoney(sum(sellables.map((s) => s.sale_price ?? s.est_value)))} potential`} />
        <Stat label="Sold" icon="💰" value={sold.length} sub={`${formatMoney(sum(sold.map((s) => s.sale_price ?? s.est_value)))} earned`} />
        <Stat label="Donate" icon="🎁" value={count("donate")} sub={`${formatMoney(donateValue)} est. — keep receipts for taxes`} />
        <Stat label="Give / Trash" icon="♻️" value={`${count("give")} / ${count("trash")}`} sub="to family & friends / dispose" />
      </div>
      {(() => {
        const mode = move?.sales_to_budget ?? "sold";
        const counted = salesForBudget(proceeds, mode);
        return (
          <a href="/budget" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-lime/50 p-4 text-sm hover:bg-lime/70">
            <span>
              💰 <b>{formatMoney(counted)}</b> {mode === "none" ? "— sale money is kept separate from the moving budget" : "counts toward the moving budget"}
              <span className="text-ink/60"> · {optionLabel(SALES_TO_BUDGET, mode)}</span>
              {proceeds.pending ? <span className="text-ink/60"> · {formatMoney(proceeds.pending)} pending</span> : null}
            </span>
            <span className="font-semibold">Budget →</span>
          </a>
        );
      })()}
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "sell", label: `Sell (${count("sell")})` },
            { value: "donate", label: `Donate (${count("donate")})` },
            { value: "give", label: `Give away (${count("give")})` },
            { value: "trash", label: `Trash (${count("trash")})` },
          ]}
        />
        {tab === "sell" && (
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {SALE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {tab === "sell" && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-gray-500">List on:</span>
          {MARKETPLACES.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
              {m.label}
            </a>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {entries.map((e) => {
          const name = e.kind === "items" ? e.row.name : e.row.title;
          const sub = e.kind === "items" ? optionLabel(ITEM_CATEGORIES, e.row.category) : `📚 ${e.row.authors.join(", ")}`;
          return (
            <div key={e.row.id} className={`card flex flex-wrap items-center gap-3 p-3 ${e.row.sale_status === "sold" ? "opacity-60" : ""}`}>
              {e.kind === "items" && e.row.photos[0] ? (
                <MediaThumb media={e.row.photos[0]} className="h-14 w-14" />
              ) : e.kind === "books" && e.row.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.row.cover_url} alt="" className="h-14 w-10 rounded object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-2xl">{e.kind === "books" ? "📚" : "🏷️"}</div>
              )}
              <div className="min-w-40 flex-1">
                <div className={`font-semibold ${e.row.sale_status === "sold" ? "line-through" : ""}`}>{name}</div>
                <div className="text-xs text-gray-500">
                  {sub}
                  {e.row.est_value ? ` · est. ${formatMoney(e.row.est_value)}` : ""}
                </div>
                {e.kind === "books" && tab === "sell" && e.row.isbn && <BookLivePrices book={e.row} onPrice={(v) => patch(e, { sale_price: v })} />}
              </div>
              {tab === "sell" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-2 text-sm text-gray-400">$</span>
                    <input
                      className="input pl-5"
                      type="number"
                      inputMode="decimal"
                      aria-label="Price"
                      placeholder="Price"
                      value={e.row.sale_price ?? ""}
                      onChange={(ev) => patch(e, { sale_price: ev.target.value === "" ? null : Number(ev.target.value) })}
                    />
                  </div>
                  <select className="input w-auto" value={e.row.sale_status} onChange={(ev) => patch(e, { sale_status: ev.target.value as Item["sale_status"] })} aria-label="Sale status">
                    {SALE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(listingText(e, move?.from_city ?? ""));
                      setCopied(e.row.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === e.row.id ? "✓ Copied" : "📋 Copy listing"}
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" style={{ accentColor: DISPOSITION_COLORS[tab] }} checked={e.row.sale_status === "sold"} onChange={(ev) => patch(e, { sale_status: ev.target.checked ? "sold" : "not_listed" })} />
                  {tab === "donate" ? "Dropped off" : tab === "give" ? "Given" : "Disposed"}
                </label>
              )}
              <select className="input w-auto text-xs" value={e.row.disposition} onChange={(ev) => patch(e, { disposition: ev.target.value as Item["disposition"] })} aria-label="Change plan">
                <option value="sell">Sell</option>
                <option value="donate">Donate</option>
                <option value="give">Give</option>
                <option value="trash">Trash</option>
                <option value="move">Keep / move</option>
                <option value="undecided">Undecided</option>
              </select>
            </div>
          );
        })}
        {!entries.length && (
          <p className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
            Nothing here yet. Mark items in <a className="text-indigo-700 underline" href="/inventory">Inventory</a> or <a className="text-indigo-700 underline" href="/books">Books</a> as {tab}.
          </p>
        )}
      </div>
    </div>
  );
}
