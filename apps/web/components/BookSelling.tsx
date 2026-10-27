"use client";

import {
  BOOK_SALE_STATUSES,
  MEDIA_MAIL_RULES,
  SELL_CHANNELS,
  buildShippingLabelHtml,
  channelById,
  estimateBookPrice,
  formatMoney,
  optionLabel,
  packagingAdvice,
  quoteChannel,
  returnAddress,
  saleShipTo,
  type Book,
  type BookSale,
  type ChannelId,
  type Snapshot,
} from "@moving/shared";
import { useMemo, useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { StatusPill } from "@/components/CrudPage";
import { Drawer, Empty } from "@/components/ui";
import { printHtml } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

export function bookAskPrice(b: Book): number {
  return b.sale_price ?? b.est_value ?? estimateBookPrice(b).mid;
}

export function saleNet(s: BookSale): number {
  return (s.price ?? 0) + (s.shipping_charged ?? 0) - (s.fees ?? 0) - (s.postage ?? 0);
}

function sellerName(db: Snapshot) {
  const adults = db.family_members.filter((m) => m.relationship !== "child");
  return (adults[0] ?? db.family_members[0])?.name ?? "";
}

export function printSaleLabel(db: Snapshot, sale: BookSale) {
  const books = db.books.filter((b) => sale.book_ids.includes(b.id));
  const html = buildShippingLabelHtml({
    from: returnAddress(db.moves[0], sellerName(db)),
    to: saleShipTo(sale),
    books,
    weightOz: sale.weight_oz ?? packagingAdvice(books).totalWeightOz,
    orderRef: sale.order_ref,
    channel: sale.channel,
    tracking: sale.tracking,
    packageName: sale.packaging,
    price: sale.price,
    shipping: sale.shipping_charged,
  });
  printHtml(html);
}

/** Market price estimate + comps links shown inside a book card. */
export function PriceHint({ book }: { book: Book }) {
  const store = useStore();
  const est = useMemo(() => estimateBookPrice(book), [book]);
  const [open, setOpen] = useState(false);
  const current = book.sale_price ?? book.est_value;
  return (
    <div className="mt-1 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="chip !py-0.5 !text-[11px]" onClick={() => setOpen((o) => !o)} title="How this was estimated">
          💲 {formatMoney(est.low)}–{formatMoney(est.high)}
        </button>
        {current !== est.mid && (
          <button className="font-semibold text-emerald-700 hover:underline" onClick={() => store.update("books", book.id, { est_value: est.mid })}>
            Use {formatMoney(est.mid)}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1.5 rounded-lg bg-gray-50 p-2 text-gray-600">
          <ul className="list-disc pl-4">
            {est.basis.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {book.isbn && (
            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-gray-400">Check comps:</span>
              {SELL_CHANNELS.filter((c) => c.searchUrl(book.isbn)).map((c) => (
                <a key={c.id} href={c.searchUrl(book.isbn)} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 hover:underline">
                  {c.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Drawer for selling one or more books together: packaging, Media Mail postage, channel comparison, buyer + label. */
export function SellDrawer({ books, open, onClose, onSold }: { books: Book[]; open: boolean; onClose: () => void; onSold: () => void }) {
  const store = useStore();
  const [channel, setChannel] = useState<ChannelId>("pango");
  const [saved, setSaved] = useState<BookSale | null>(null);
  const advice = useMemo(() => packagingAdvice(books), [books]);
  const prices = useMemo(() => books.map(bookAskPrice), [books]);
  const pkgCost = advice.package?.cost ?? 0;
  const quotes = useMemo(
    () => SELL_CHANNELS.filter((c) => c.id !== "other").map((c) => ({ ch: c, q: quoteChannel(c.id, prices, advice.totalWeightOz, c.shipping === "seller" ? pkgCost : 0) })).sort((a, b) => b.q.net - a.q.net),
    [prices, advice.totalWeightOz, pkgCost],
  );
  const best = quotes[0]?.ch.id;
  const sel = quotes.find((x) => x.ch.id === channel)?.q;
  const selCh = channelById(channel);
  const shipsByMail = selCh?.shipping !== "none";
  const lbs = Math.floor(advice.totalWeightOz / 16);
  const oz = Math.ceil(advice.totalWeightOz % 16);

  const close = () => {
    setSaved(null);
    onClose();
  };

  return (
    <Drawer open={open} onClose={close} wide title={`Sell ${books.length} book${books.length === 1 ? "" : "s"} together`}>
      {saved ? (
        <div className="space-y-4">
          <div className="card-ink rounded-3xl p-5">
            <div className="eyebrow text-lime">Sale logged</div>
            <div className="mt-1 text-2xl font-bold">
              {saved.buyer_name || "Buyer"} · {formatMoney(saleNet(saved))} net
            </div>
            <p className="mt-1 text-sm text-white/70">
              {books.length} book{books.length === 1 ? "" : "s"} marked {saved.status === "pending" ? "pending" : "sold"} on {channelById(saved.channel)?.label ?? saved.channel}.
            </p>
          </div>
          {channelById(saved.channel)?.shipping !== "none" && (
            <button className="btn-primary w-full" onClick={() => printSaleLabel(store.getSnapshot(), saved)}>
              🖨️ Print Media Mail label + packing slip
            </button>
          )}
          {saved.channel === "pango" && <p className="text-xs text-gray-500">Pango emails you a prepaid label — use our printout as the packing slip, or as a backup address label.</p>}
          <button className="btn-secondary w-full" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {books.map((b, i) => (
              <div key={b.id} className="w-20 flex-none text-center">
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.cover_url} alt="" className="mx-auto h-24 w-16 rounded object-cover shadow" />
                ) : (
                  <div className="mx-auto flex h-24 w-16 items-center justify-center rounded bg-amber-100 p-1 text-[9px] font-semibold text-amber-900">{b.title.slice(0, 30)}</div>
                )}
                <div className="mt-1 truncate text-[10px] text-gray-600">{b.title}</div>
                <div className="text-xs font-bold">{formatMoney(prices[i])}</div>
              </div>
            ))}
          </div>

          <section className="grid gap-3 @md:grid-cols-2">
            <div className="tile bg-sand">
              <div className="eyebrow">📦 Pack it in</div>
              <div className="mt-1 font-bold leading-tight">{advice.package?.name ?? "Split into several boxes"}</div>
              <div className="mt-1 text-xs text-gray-600">
                {advice.count} book{advice.count === 1 ? "" : "s"} ≈ {Math.round(advice.bookWeightOz)} oz · stack {advice.stack.map((d) => `${d}″`).join(" × ")}
                {advice.piles > 1 ? ` in ${advice.piles} piles` : ""}
              </div>
              {advice.alternatives.length > 0 && <div className="mt-1 text-xs text-gray-500">Also fits: {advice.alternatives.map((a) => a.name).join(" · ")}</div>}
            </div>
            <div className="tile bg-sky">
              <div className="eyebrow">✉️ USPS Media Mail</div>
              <div className="mt-1 text-2xl font-bold">{advice.postage !== null ? formatMoney(advice.postage) : "Too heavy"}</div>
              <div className="text-xs text-gray-600">
                Packed weight {lbs} lb {oz} oz → billed {advice.billedLbs} lb
              </div>
              <div className="text-xs text-gray-500">Retail counter price; Pirate Ship / eBay labels are a bit cheaper.</div>
            </div>
          </section>

          {(advice.tips.length > 0 || advice.warnings.length > 0) && (
            <ul className="space-y-1 text-sm">
              {advice.warnings.map((w) => (
                <li key={w} className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-900">
                  ⚠️ {w}
                </li>
              ))}
              {advice.tips.map((t) => (
                <li key={t} className="text-gray-600">
                  • {t}
                </li>
              ))}
            </ul>
          )}

          <section>
            <h3 className="mb-2 font-bold">Where to sell — what you&apos;d take home</h3>
            <div className="grid gap-2 @md:grid-cols-2">
              {quotes.map(({ ch, q }) => (
                <button
                  key={ch.id}
                  onClick={() => setChannel(ch.id)}
                  className={`rounded-2xl border p-3 text-left transition ${channel === ch.id ? "border-ink bg-ink text-white" : "border-gray-200 bg-white hover:border-gray-400"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {ch.emoji} {ch.label}
                    </span>
                    <span className="text-lg font-bold">{formatMoney(q.net)}</span>
                  </div>
                  <div className={`mt-0.5 text-[11px] ${channel === ch.id ? "text-white/70" : "text-gray-500"}`}>
                    {ch.id === best && <span className="mr-1 rounded bg-lime px-1 font-bold text-ink">BEST</span>}
                    {(ch.id === "pango" || ch.id === "half_price_books") && <span className="mr-1 rounded bg-lilac px-1 font-bold text-ink">PICK</span>}
                    {q.note}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {sel && selCh && (
            <section className="card space-y-2 p-4 text-sm">
              <div className="font-semibold">
                {selCh.emoji} {selCh.label}
              </div>
              <p className="text-gray-600">{selCh.summary}</p>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td>Book price{books.length > 1 ? "s" : ""}</td>
                    <td className="text-right">{formatMoney(sel.price)}</td>
                  </tr>
                  {sel.buyerShipping > 0 && (
                    <tr>
                      <td>+ Shipping paid by buyer</td>
                      <td className="text-right">{formatMoney(sel.buyerShipping)}</td>
                    </tr>
                  )}
                  {sel.fees > 0 && (
                    <tr>
                      <td>− Fees</td>
                      <td className="text-right">{formatMoney(sel.fees)}</td>
                    </tr>
                  )}
                  {sel.postage > 0 && (
                    <tr>
                      <td>− Media Mail postage</td>
                      <td className="text-right">{formatMoney(sel.postage)}</td>
                    </tr>
                  )}
                  {sel.packaging > 0 && (
                    <tr>
                      <td>− Packaging</td>
                      <td className="text-right">{formatMoney(sel.packaging)}</td>
                    </tr>
                  )}
                  <tr className="border-t font-bold">
                    <td className="pt-1">You keep</td>
                    <td className="pt-1 text-right">{formatMoney(sel.net)}</td>
                  </tr>
                </tbody>
              </table>
              {selCh.tips.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-gray-500">
                  {selCh.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              {selCh.sellUrl && (
                <a href={selCh.sellUrl} target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-indigo-700 hover:underline">
                  Open {selCh.label} ↗
                </a>
              )}
            </section>
          )}

          {shipsByMail && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer font-semibold">Media Mail rules</summary>
              <ul className="mt-1 list-disc pl-5">
                {MEDIA_MAIL_RULES.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          )}

          <section>
            <h3 className="mb-2 font-bold">Buyer &amp; order</h3>
            {sel && (
              <EntityForm
                key={channel}
                table="book_sales"
                row={null}
                initial={{
                  channel,
                  book_ids: books.map((b) => b.id),
                  price: sel.price,
                  shipping_charged: sel.buyerShipping,
                  fees: sel.fees,
                  postage: sel.postage,
                  packaging: shipsByMail ? (advice.package?.name ?? "") : "",
                  weight_oz: Math.round(advice.totalWeightOz * 10) / 10,
                  status: shipsByMail ? "pending" : "picked_up",
                  sale_date: new Date().toISOString().slice(0, 10),
                }}
                onDone={(s) => {
                  if (!s) return close();
                  const done = s.status !== "pending" && s.status !== "cancelled";
                  books.forEach((b, i) =>
                    store.update("books", b.id, { sale_id: s.id, sale_channel: s.channel, sale_status: done ? "sold" : "pending", sale_price: b.sale_price ?? prices[i], disposition: "sell" }),
                  );
                  setSaved(s);
                  onSold();
                }}
              />
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

/** List of book sales with status, buyer, net and label reprint. */
export function SalesLog() {
  const db = useDb();
  const store = useStore();
  const [editing, setEditing] = useState<BookSale | null>(null);
  const sales = [...db.book_sales].sort((a, b) => (b.sale_date ?? b.created_at).localeCompare(a.sale_date ?? a.created_at));
  const live = sales.filter((s) => s.status !== "cancelled");
  const toShip = live.filter((s) => s.status === "paid" || s.status === "packed").length;
  const current = editing ? (db.book_sales.find((s) => s.id === editing.id) ?? null) : null;

  if (!sales.length)
    return (
      <Empty icon="🧾" title="No book sales yet">
        Tap <b>Select to sell</b> in the Library tab, pick one or more books and log the buyer — you&apos;ll get packaging advice, Media Mail postage and a printable label.
      </Empty>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="tile bg-sage">
          <div className="eyebrow">Net earned</div>
          <div className="text-2xl font-bold">{formatMoney(live.reduce((a, s) => a + saleNet(s), 0))}</div>
        </div>
        <div className="tile bg-sand">
          <div className="eyebrow">Books sold</div>
          <div className="text-2xl font-bold">{live.reduce((a, s) => a + s.book_ids.length, 0)}</div>
        </div>
        <div className="tile bg-sky">
          <div className="eyebrow">To ship</div>
          <div className="text-2xl font-bold">{toShip}</div>
        </div>
        <div className="tile bg-lilac">
          <div className="eyebrow">Postage spent</div>
          <div className="text-2xl font-bold">{formatMoney(live.reduce((a, s) => a + (s.postage ?? 0), 0))}</div>
        </div>
      </div>
      <ul className="space-y-2">
        {sales.map((s) => {
          const books = db.books.filter((b) => s.book_ids.includes(b.id));
          const ch = channelById(s.channel);
          return (
            <li key={s.id} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="flex -space-x-3">
                {books.slice(0, 4).map((b) =>
                  b.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={b.id} src={b.cover_url} alt="" className="h-14 w-10 rounded border-2 border-white object-cover shadow" />
                  ) : (
                    <div key={b.id} className="h-14 w-10 rounded border-2 border-white bg-amber-100 shadow" />
                  ),
                )}
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(s)}>
                <div className="font-semibold">
                  {s.buyer_name || "Buyer"} · {books.length} book{books.length === 1 ? "" : "s"}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {[ch ? `${ch.emoji} ${ch.label}` : s.channel, s.sale_date, s.ship_city && `${s.ship_city}, ${s.ship_state}`, s.tracking && `Tracking ${s.tracking}`].filter(Boolean).join(" · ")}
                </div>
              </button>
              <StatusPill value={s.status} options={BOOK_SALE_STATUSES} />
              <div className="w-20 text-right font-bold">{formatMoney(saleNet(s))}</div>
              <div className="flex gap-1">
                {ch?.shipping !== "none" && (
                  <button className="btn-ghost !px-2 text-xs" onClick={() => printSaleLabel(db, s)} title="Print label">
                    🖨️ Label
                  </button>
                )}
                {(s.status === "paid" || s.status === "packed") && (
                  <button
                    className="btn-ghost !px-2 text-xs"
                    onClick={() => store.update("book_sales", s.id, { status: "shipped", ship_date: s.ship_date ?? new Date().toISOString().slice(0, 10) })}
                  >
                    ✓ Shipped
                  </button>
                )}
                {s.status === "pending" && (
                  <button className="btn-ghost !px-2 text-xs" onClick={() => store.update("book_sales", s.id, { status: "paid" })}>
                    ✓ Paid
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Drawer open={!!current} onClose={() => setEditing(null)} title={`Sale — ${optionLabel(BOOK_SALE_STATUSES, current?.status ?? "")}`}>
        {current && (
          <EntityForm
            key={current.id}
            table="book_sales"
            row={current}
            onDone={(s) => {
              if (s) {
                const sold = s.status !== "pending" && s.status !== "cancelled";
                for (const id of s.book_ids)
                  store.update("books", id, s.status === "cancelled" ? { sale_id: null, sale_status: "not_listed" } : { sale_status: sold ? "sold" : "pending", sale_channel: s.channel });
              }
              setEditing(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
