"use client";

import {
  DEFAULTS,
  SCHEMAS,
  formatMoney,
  BOOK_FORMATS,
  optionLabel,
  yearOnly,
  itemPriceIdea,
  itemPriceQuery,
  type Item,
  normalizeIsbn,
  productToItemPatch,
  apartmentAddress,
  listingToApartmentPatch,
  parseListingText,
  type ListingInfo,
  type ProductInfo,
  needsGeocode,
  travelForm,
  type Apartment,
  type FieldDef,
  type MediaRef,
  type TableMap,
  type TableName,
} from "@moving/shared";
import { useMemo, useState } from "react";
import { Toggle } from "./ui";
import { bookPatch, lookupBook } from "@/lib/books";
import { fetchListing, geocodeOne } from "@/lib/geo";
import { imageUrlToMedia } from "@/lib/media";
import { lookupProduct } from "@/lib/lookup";
import { useDb, useStore } from "@/lib/store-context";
import { AddressInput, ZipInput } from "./AddressInput";
import { FlightLookup } from "./Flights";
import { ImageUrlsField } from "./Gallery";
import { LivePrices } from "./LivePrices";
import { MediaField } from "./Media";
import { MoveDistance } from "./MoveDistance";
import { Scanner } from "./Scanner";
import { useDeleteWithUndo } from "./Swipe";

type Row = Record<string, unknown>;

export function FieldInput({
  field,
  value,
  onChange,
  onPatch,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Set several sibling fields at once (address & ZIP auto-fill). */
  onPatch?: (patch: Record<string, unknown>) => void;
}) {
  const db = useDb();
  const id = `f-${field.key}`;
  const common = { id, className: "input" };
  switch (field.type) {
    case "textarea":
      return <textarea {...common} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />;
    case "number":
    case "money":
      return (
        <div className="relative">
          {field.type === "money" && <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>}
          <input
            {...common}
            className={`input ${field.type === "money" ? "pl-6" : ""}`}
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            step="any"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      );
    case "date":
      return <input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "time":
      return <input {...common} type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "members": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      if (!db.family_members.length) return <p className="text-sm text-gray-400">Add family members first.</p>;
      return (
        <div className="flex flex-wrap gap-1.5">
          {db.family_members.map((m) => {
            const on = ids.includes(m.id);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => onChange(on ? ids.filter((x) => x !== m.id) : [...ids, m.id])}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? "border-ink bg-ink text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"}`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      );
    }
    case "address":
      return (
        <AddressInput
          id={id}
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={onChange}
          onSelect={(s) => {
            const f = field.fill ?? {};
            const patch: Record<string, unknown> = { [field.key]: s.street || s.label };
            if (f.city && s.city) patch[f.city] = s.city;
            if (f.state && s.state) patch[f.state] = s.state;
            if (f.zip && s.zip) patch[f.zip] = s.zip;
            if (f.lat) patch[f.lat] = s.lat;
            if (f.lng) patch[f.lng] = s.lng;
            if (onPatch) onPatch(patch);
            else onChange(patch[field.key]);
          }}
        />
      );
    case "zip":
      return (
        <ZipInput
          id={id}
          value={(value as string) ?? ""}
          onChange={onChange}
          onResolved={(r) => {
            const f = field.fill ?? {};
            const patch: Record<string, unknown> = {};
            if (f.city) patch[f.city] = r.city;
            if (f.state) patch[f.state] = r.state;
            if (onPatch && Object.keys(patch).length) onPatch(patch);
          }}
        />
      );
    case "images":
      return <ImageUrlsField value={(value as string[]) ?? []} onChange={onChange} />;
    case "select":
      return (
        <select {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return <Toggle label={field.label} checked={!!value} onChange={onChange} />;
    case "member":
    case "pet":
    case "room":
    case "box": {
      const rows =
        field.type === "member"
          ? db.family_members.map((m) => ({ id: m.id, label: m.name }))
          : field.type === "pet"
            ? db.pets.map((p) => ({ id: p.id, label: p.name }))
            : field.type === "room"
              ? [...db.rooms].sort((a, b) => a.sort - b.sort).map((r) => ({ id: r.id, label: r.name }))
              : [...db.boxes].sort((a, b) => a.number - b.number).map((b) => ({ id: b.id, label: `#${b.number} ${b.label}` }));
      return (
        <select {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      );
    }
    case "tags":
      return (
        <input
          {...common}
          value={Array.isArray(value) ? value.join(", ") : ""}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trimStart())
                .filter((s, i, arr) => s || i === arr.length - 1),
            )
          }
          placeholder="Comma separated"
        />
      );
    case "rating":
      return (
        <div className="flex gap-1 text-2xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} onClick={() => onChange(value === n ? null : n)} className={n <= ((value as number) ?? 0) ? "text-amber-400" : "text-gray-300"} aria-label={`${n} stars`}>
              ★
            </button>
          ))}
        </div>
      );
    case "media":
      return <MediaField value={(value as MediaRef[]) ?? []} onChange={onChange} accept="image/*,application/pdf" />;
    default:
      return (
        <input
          {...common}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : "text"}
          // HIG Virtual keyboards / Entering data: the right keyboard, no auto-caps for addresses, and autofill where it helps.
          {...(field.type === "email" || field.type === "url"
            ? { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, autoComplete: field.type === "email" ? "email" : "url" }
            : field.type === "phone"
              ? { autoComplete: "tel" }
              : {})}
          enterKeyHint="next"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}

function listingSummary(info: ListingInfo): string {
  const bits: string[] = [];
  if (info.address || info.title) bits.push(info.address ? [info.address, info.city].filter(Boolean).join(", ") : info.title!);
  if (info.rent) bits.push(`${formatMoney(info.rent)}/mo`);
  if (info.bedrooms != null || info.bathrooms != null) bits.push([info.bedrooms != null && `${info.bedrooms} bd`, info.bathrooms != null && `${info.bathrooms} ba`].filter(Boolean).join(" / "));
  if (info.sqft) bits.push(`${info.sqft.toLocaleString()} sq ft`);
  if (info.images.length) bits.push(`${info.images.length} photo${info.images.length === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

function ListingImport({ draft, setDraft }: { draft: Row; setDraft: (fn: (d: Row) => Row) => void }) {
  const [url, setUrl] = useState(String(draft.listing_url ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const imageUrls = Array.isArray(draft.image_urls) ? (draft.image_urls as string[]) : [];
  const photos = Array.isArray(draft.photos) ? (draft.photos as MediaRef[]) : [];
  const [collapsed, setCollapsed] = useState(() => !!draft.listing_url || imageUrls.length > 0);
  const [saving, setSaving] = useState<string | null>(null);

  const keepPhotos = async () => {
    const urls = imageUrls.slice(0, 20);
    const saved: MediaRef[] = [];
    const done = new Set<string>();
    for (const [i, u] of urls.entries()) {
      setSaving(`Saving photo ${i + 1} of ${urls.length}…`);
      const m = await imageUrlToMedia(u).catch(() => null);
      if (m) {
        saved.push(m);
        done.add(u);
      }
    }
    setDraft((d) => ({ ...d, photos: [...((d.photos as MediaRef[]) ?? []), ...saved], image_urls: ((d.image_urls as string[]) ?? []).filter((u) => !done.has(u)) }));
    setSaving(saved.length ? `Saved ${saved.length} photo${saved.length === 1 ? "" : "s"} into the app${saved.length < urls.length ? ` (${urls.length - saved.length} wouldn’t download)` : ""}.` : "The site wouldn’t let us download its photos.");
  };

  const apply = async (info: ListingInfo, link?: string) => {
    setDraft((d) => ({ ...d, ...(link ? { listing_url: link } : {}), ...listingToApartmentPatch(info, d as Partial<Apartment>) }));
    // Pin it on the map (and the schools overlay) right away when the page had no coordinates.
    const n = { ...draft, ...listingToApartmentPatch(info, draft as Partial<Apartment>) };
    if (n.latitude == null) {
      const addr = apartmentAddress(n as Partial<Apartment>);
      if (addr) {
        const g = await geocodeOne(addr);
        if (g) setDraft((d) => (d.latitude == null ? { ...d, latitude: g.lat, longitude: g.lng, geocoded_address: addr, zip: d.zip || g.zip } : d));
      }
    }
  };

  const run = async (raw = url) => {
    const link = raw.trim();
    if (!/^https?:\/\//i.test(link)) return setMsg("Paste the full link, starting with https://");
    setBusy(true);
    setMsg("Opening the listing…");
    try {
      const info = await fetchListing(link);
      if ("error" in info) {
        setPasteOpen(true);
        return setMsg(info.error);
      }
      if (info.url) setUrl(info.url);
      await apply(info, info.url ?? link);
      const summary = listingSummary(info);
      if (info.partial) {
        setPasteOpen(true);
        setMsg(`${info.note ?? ""}${summary ? ` Got: ${summary}.` : ""}`);
      } else if (summary) {
        setMsg(`Filled in: ${summary}. Review below, then save.`);
        setCollapsed(true);
      } else setMsg("Opened the page but found nothing useful — paste the page text below instead.");
    } catch {
      setPasteOpen(true);
      setMsg("Couldn't open that link — paste the page text below instead.");
    } finally {
      setBusy(false);
    }
  };

  const fromText = async (text = pasted) => {
    const info = parseListingText(text);
    const summary = listingSummary(info);
    if (!summary) {
      setPasted(text);
      setPasteOpen(true);
      return setMsg("Couldn't find rent, beds or an address in that text. Make sure you copied the whole listing page.");
    }
    await apply(info, /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined);
    setMsg(`Filled in: ${summary}. Review below, then save.`);
    setPasted("");
    setPasteOpen(false);
    setCollapsed(true);
  };

  const fromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return setMsg("The clipboard is empty — copy the listing page first.");
      if (/^https?:\/\/\S+$/i.test(text)) {
        setUrl(text);
        return void run(text);
      }
      await fromText(text);
    } catch {
      setPasteOpen(true);
      setMsg("Tap and hold in the box below, then tap Paste.");
    }
  };

  const host = (() => {
    try {
      return new URL(String(draft.listing_url)).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return (
    <div className="space-y-3">
      {collapsed ? (
        <div className="ink-panel flex min-h-14 items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-white">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-lime font-bold text-ink">✓</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{host ? `Imported from ${host}` : "Listing imported"}</div>
            {msg && <div className="truncate text-[12px] text-white/60">{msg.replace(/^Filled in: /, "").replace(/\. Review below, then save\.$/, "")}</div>}
          </div>
          <button type="button" className="min-h-11 flex-none px-2 text-[13px] font-semibold text-lime" onClick={() => setCollapsed(false)}>
            Re-import
          </button>
        </div>
      ) : (
    <div className="ink-panel rounded-3xl bg-ink p-4 text-white">
      <div className="mb-1 font-display text-lg font-bold tracking-tight">Import from a listing link</div>
      <p className="mb-3 text-[13px] text-white/60">Paste a link from Zillow, FirstKey, a building&apos;s own site… We&apos;ll pull the photos, address, rent, beds and size. For Apartments.com, copy the page text instead (steps below).</p>
      <div className="flex gap-2">
        <input
          className="input border-white/10 bg-white/10 text-white placeholder:text-white/40 focus:bg-white/15"
          type="url"
          placeholder="Paste a listing link…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text").trim();
            if (/^https?:\/\/\S+$/i.test(t)) {
              e.preventDefault();
              setUrl(t);
              void run(t);
            } else if (t.includes("\n")) {
              // Whole page text pasted into the link box — read it as listing text.
              e.preventDefault();
              void fromText(t);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <button type="button" className="btn flex-none bg-lime text-ink hover:brightness-95" onClick={() => void run()} disabled={busy}>
          {busy ? "Pulling…" : "Pull info"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-white/80">{msg}</p>}
      <button type="button" className="mt-2 min-h-11 text-[13px] font-semibold text-lime underline-offset-2 hover:underline" onClick={() => setPasteOpen((o) => !o)}>
        {pasteOpen ? "Hide" : "Site blocked? Copy the page instead"}
      </button>
      {pasteOpen && (
        <div className="space-y-2">
          <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-white/70">
            <li>Open the listing in Safari (Apartments.com blocks apps from reading it).</li>
            <li>Tap and hold any text on the page, then tap <b>Select All</b> → <b>Copy</b>. On a computer: Ctrl+A, Ctrl+C.</li>
            <li>Come back here and tap <b>Paste listing</b>.</li>
          </ol>
          <button type="button" className="btn w-full bg-lime text-ink hover:brightness-95" onClick={() => void fromClipboard()}>
            Paste listing
          </button>
          <textarea
            className="input min-h-24 border-white/10 bg-white/10 text-white placeholder:text-white/40"
            placeholder="…or paste the page text here"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text");
              if (t.trim()) {
                e.preventDefault();
                void fromText(t);
              }
            }}
          />
          {pasted.trim() && (
            <button type="button" className="btn bg-white/15 text-white hover:bg-white/25" onClick={() => void fromText()}>
              Fill from text
            </button>
          )}
        </div>
      )}
      {(!!draft.listing_url || imageUrls.length > 0) && (
        <button type="button" className="mt-1 min-h-11 text-[13px] font-semibold text-white/70" onClick={() => setCollapsed(true)}>
          Done
        </button>
      )}
    </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-bold">Photos</span>
          {imageUrls.length > 0 && (
            <button type="button" className="min-h-9 rounded-full bg-ink/[0.06] px-3 text-[12px] font-semibold" disabled={!!saving && saving.startsWith("Saving")} onClick={() => void keepPhotos()}>
              ⬇︎ Save listing photos to app
            </button>
          )}
        </div>
        {saving && <p className="mb-2 text-xs text-slate-500">{saving}</p>}
        {imageUrls.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[12px] font-semibold text-slate-500 uppercase">From the listing</div>
            <ImageUrlsField value={imageUrls} onChange={(v) => setDraft((d) => ({ ...d, image_urls: v }))} />
          </div>
        )}
        <div className="mb-1 text-[12px] font-semibold text-slate-500 uppercase">Your photos</div>
        <MediaField value={photos} onChange={(v) => setDraft((d) => ({ ...d, photos: v }))} />
      </div>
    </div>
  );
}

/** Shows a cover; blank placeholder images (1×1 "no cover" gifs) or broken links fall back to a "Find cover" button. */
function CoverImg({ src, onMissing }: { src: string; onMissing?: () => void }) {
  const [bad, setBad] = useState(false);
  if (bad)
    return (
      <button type="button" onClick={onMissing} disabled={!onMissing} className="flex h-36 w-24 flex-none flex-col items-center justify-center gap-1 rounded-md bg-slate-100 px-1 text-center text-[11px] text-slate-500">
        <span className="text-2xl">📕</span>
        {onMissing ? "Find cover" : "No cover"}
      </button>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-36 w-24 flex-none rounded-md bg-slate-100 object-cover shadow"
      onError={() => setBad(true)}
      onLoad={(e) => e.currentTarget.naturalWidth < 10 && setBad(true)}
    />
  );
}

/** Book summary: cover + the details we found, then live prices (fetched automatically). */
function BookOverview({ draft, onUse, onLookup }: { draft: Row; onUse: (v: number) => void; onLookup: () => void }) {
  const cover = typeof draft.cover_url === "string" ? draft.cover_url : "";
  const isbn = normalizeIsbn(String(draft.isbn ?? "")) ?? "";
  const hasValue = draft.est_value != null && draft.est_value !== "";
  const [showPrices, setShowPrices] = useState(!hasValue);
  const authors = Array.isArray(draft.authors) ? (draft.authors as string[]).filter(Boolean).join(", ") : String(draft.authors ?? "");
  const meta = [
    draft.published ? yearOnly(String(draft.published)) : "",
    String(draft.publisher ?? ""),
    draft.pages ? `${draft.pages} pages` : "",
    draft.format ? optionLabel(BOOK_FORMATS, draft.format) : "",
  ].filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {cover ? (
          <CoverImg key={cover} src={cover} onMissing={isbn ? onLookup : undefined} />
        ) : (
          <button type="button" onClick={onLookup} disabled={!isbn} className="flex h-36 w-24 flex-none flex-col items-center justify-center gap-1 rounded-md bg-slate-100 px-1 text-center text-[11px] text-slate-500">
            <span className="text-2xl">📕</span>
            {isbn ? "Find cover" : "No cover"}
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="leading-snug font-semibold break-words">{String(draft.title || "Untitled")}</div>
          {draft.subtitle ? <div className="text-[13px] leading-snug text-slate-500">{String(draft.subtitle)}</div> : null}
          {authors && <div className="text-[13px] text-slate-700">by {authors}</div>}
          {meta.length > 0 && <div className="text-[12px] text-slate-500">{meta.join(" · ")}</div>}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[12px]">
            {isbn && <span className="text-slate-500">ISBN {isbn}</span>}
            {draft.list_price != null && draft.list_price !== "" && (
              <span>
                Cover price <b>{formatMoney(Number(draft.list_price))}</b>
              </span>
            )}
            {draft.est_value != null && draft.est_value !== "" && (
              <span>
                Resale <b className="text-emerald-700">{formatMoney(Number(draft.est_value))}</b>
              </span>
            )}
          </div>
        </div>
      </div>
      {isbn && (hasValue && !showPrices ? (
        <button type="button" className="min-h-11 text-[13px] font-semibold text-indigo-700" onClick={() => setShowPrices(true)}>
          ↻ Recheck used prices
        </button>
      ) : (
        <LivePrices
          auto
          kind="book"
          isbn={isbn}
          actions={(r) => (r.summary.suggested != null ? [{ label: `Use ${formatMoney(r.summary.suggested)} as resale value`, onClick: () => { onUse(r.summary.suggested!); setShowPrices(false); } }] : [])}
        />
      ))}
    </div>
  );
}

/** Compact "already done" line that replaces a finished helper panel; tap Change to bring it back. */
function DoneRow({ title, detail, action = "Change", onOpen }: { title: string; detail?: string | null; action?: string; onOpen: () => void }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-emerald-50 px-3 py-2">
      <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-500 text-[13px] font-bold text-white">
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-emerald-900">{title}</div>
        {detail && <div className="truncate text-[12px] text-emerald-800/70">{detail}</div>}
      </div>
      <button type="button" className="min-h-11 flex-none px-2 text-[13px] font-semibold text-emerald-700" onClick={onOpen}>
        {action}
      </button>
    </div>
  );
}

function hostOf(link: unknown): string {
  try {
    return new URL(String(link)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function ProductLinkImport({ draft, setDraft, done, onOpen, onClose, onFilled }: { draft: Row; setDraft: (fn: (d: Row) => Row) => void; done?: boolean; onOpen?: () => void; onClose?: () => void; onFilled?: () => void }) {
  const [url, setUrl] = useState(String(draft.product_url ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done && onOpen) {
    return <DoneRow title={`Linked to ${hostOf(draft.product_url) || "store page"}`} detail={msg} onOpen={onOpen} />;
  }
  const run = async (raw = url) => {
    const link = raw.trim();
    if (!/^https?:\/\//i.test(link)) return setMsg("Paste the full link, starting with https://");
    setBusy(true);
    setMsg("Reading the store page…");
    try {
      const res = await fetch(`/api/product?url=${encodeURIComponent(link)}`);
      const p = (await res.json()) as ProductInfo & { error?: string; note?: string };
      if (p.error) {
        setDraft((d) => ({ ...d, product_url: link }));
        return setMsg(p.error);
      }
      setDraft((d) => ({ ...d, product_url: link, ...productToItemPatch(p, d as Parameters<typeof productToItemPatch>[1], true) }));
      const got = [p.brand && "brand", p.model && "model", p.price != null && "price", p.image && "photo"].filter(Boolean).join(", ");
      setMsg(
        `Filled in “${p.name}”${p.price != null ? ` · ${formatMoney(p.price)} new` : " — add the price"}${got ? ` (name, ${got})` : ""} from ${p.source}.${p.note ? ` ${p.note}.` : ""}`,
      );
      onFilled?.();
    } catch {
      setMsg("Couldn't open that link — fill the details in yourself.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <label className="label" htmlFor="product-link">
        🔗 Shopping page link
      </label>
      <div className="flex gap-2">
        <input
          id="product-link"
          className="input"
          type="url"
          placeholder="Paste an Amazon, Target, IKEA… link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            const t = url.trim();
            if (!busy && /^https?:\/\/\S+$/i.test(t) && t !== draft.product_url) void run(t);
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text").trim();
            if (/^https?:\/\/\S+$/i.test(t)) {
              e.preventDefault();
              setUrl(t);
              void run(t);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <button type="button" className="btn-secondary flex-none" onMouseDown={(e) => e.preventDefault()} onClick={() => void run()} disabled={busy}>
          {busy ? "…" : "Fill in"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">{msg ?? "We pull the name, brand, price and picture. Some stores (like Amazon) block this — then we use the name in the link."}</p>
      {onClose && !!draft.product_url && (
        <button type="button" className="mt-1 min-h-11 text-[13px] font-semibold text-indigo-700" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}

export function EntityForm<T extends TableName>({
  table,
  row,
  initial,
  onDone,
  hide = [],
  submitLabel,
}: {
  table: T;
  row?: TableMap[T] | null;
  initial?: Partial<TableMap[T]>;
  onDone: (saved: TableMap[T] | null) => void;
  hide?: string[];
  submitLabel?: string;
}) {
  const store = useStore();
  const schema = SCHEMAS[table];
  const [draft, setDraft] = useState<Row>(() => ({ ...(JSON.parse(JSON.stringify(DEFAULTS[table])) as Row), ...(initial as Row), ...(row as unknown as Row) }));
  const [scan, setScan] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const del = useDeleteWithUndo();
  const set = (k: string, v: unknown) => {
    if (k === missing) setMissing(null);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const isFlight = table === "travel" && draft.kind === "flight";
  const travelKind = table === "travel" ? String(draft.kind ?? "") : null;
  const sections = useMemo(() => {
    const out: { name: string; fields: FieldDef[] }[] = [];
    const kindForm = travelKind != null ? travelForm(travelKind) : null;
    const extra = kindForm?.hidden ?? [];
    // Apartments show their photos inside the import card, and coordinates are filled from the address.
    const aptHidden = table === "apartments" ? ["image_urls", "photos", "latitude", "longitude"] : [];
    for (const raw of schema.fields.filter((f) => !hide.includes(f.key) && !extra.includes(f.key) && !aptHidden.includes(f.key))) {
      const f = kindForm?.labels[raw.key] ? { ...raw, label: kindForm.labels[raw.key]! } : raw;
      const name = f.section ?? "";
      const s = out.find((x) => x.name === name) ?? (out.push({ name, fields: [] }), out[out.length - 1]!);
      s.fields.push(f);
    }
    return out;
  }, [schema, hide, travelKind, table]);
  const collapsible = table === "apartments";

  const scanTarget = table === "books" ? "isbn" : table === "items" ? "barcode" : null;
  const [openScan, setOpenScan] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openPrices, setOpenPrices] = useState(false);
  const has = (k: string) => draft[k] != null && String(draft[k]).trim() !== "";
  const scanDone = !!scanTarget && !openScan && has(scanTarget) && has(schema.titleField);
  const linkDone = table === "items" && !openLink && has("product_url");
  const pricesDone = table === "items" && !openPrices && has("retail_price") && has("est_value");
  // Filled-in lookup fields stay out of the way until their panel is reopened.
  const doneKeys = [...(scanDone && scanTarget ? [scanTarget] : []), ...((scanDone || linkDone) && has("image_url") ? ["image_url"] : [])];

  const runLookup = async (code: string) => {
    setLookupMsg("Looking up…");
    if (table === "books") {
      const info = await lookupBook(code);
      if (!info) {
        setDraft((d) => ({ ...d, isbn: normalizeIsbn(code) ?? code }));
        setLookupMsg("No match found — enter details manually.");
        return;
      }
      const hadCover = !!draft.cover_url && !/covers\.openlibrary\.org\/b\/isbn\/(?!.*default=false)/.test(String(draft.cover_url));
      setDraft((d) => ({ ...d, ...bookPatch(info), cover_url: info.cover_url || d.cover_url || "" }));
      setLookupMsg(`Found “${info.title}”${!hadCover ? (info.cover_url ? " · cover found" : " · no cover anywhere yet") : ""}`);
      setOpenScan(false);
    } else {
      set("barcode", code);
      const p = await lookupProduct(code);
      if (!p) return setLookupMsg("Product not found — add a name and photo.");
      setDraft((d) => ({ ...d, ...productToItemPatch(p, d as Parameters<typeof productToItemPatch>[1]) }));
      setLookupMsg(`Found “${p.name}”${p.price != null ? ` · retail ≈ ${formatMoney(p.price)}` : ""}${p.model ? ` · model ${p.model}` : ""}`);
      setOpenScan(false);
    }
  };

  const save = () => {
    const isEmpty = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
    const need = sections.flatMap((s) => s.fields).find((f) => f.required && f.type !== "boolean" && f.type !== "select" && isEmpty(draft[f.key]));
    if (need) {
      setMissing(need.key);
      const el = document.getElementById(`f-${need.key}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    const clean = { ...draft };
    for (const f of schema.fields) if (f.type === "tags" && Array.isArray(clean[f.key])) clean[f.key] = (clean[f.key] as string[]).map((s) => s.trim()).filter(Boolean);
    if (table === "books" && typeof clean.published === "string") clean.published = yearOnly(clean.published);
    const { id: _id, household_id: _h, created_at: _c, updated_at: _u, ...data } = clean;
    const saved = row ? store.update(table, row.id, data as Partial<TableMap[T]>) : store.insert(table, data as never);
    if (saved && table === "apartments" && needsGeocode(saved as unknown as Apartment)) {
      const apt = saved as unknown as Apartment;
      const addr = apartmentAddress(apt);
      void geocodeOne(addr).then((g) => {
        if (g) store.update("apartments", apt.id, { latitude: g.lat, longitude: g.lng, geocoded_address: addr });
      });
    }
    onDone(saved ?? null);
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {scanTarget && scanDone && (
        <DoneRow
          title={table === "books" ? `ISBN ${String(draft.isbn)}` : `Barcode ${String(draft.barcode)}`}
          detail={lookupMsg ?? (table === "books" ? "Book info filled in" : "Product info filled in")}
          onOpen={() => setOpenScan(true)}
        />
      )}
      {scanTarget && !scanDone && linkDone && !openScan && (
        <button type="button" className="min-h-11 text-[13px] font-semibold text-indigo-700" onClick={() => setScan(true)}>
          ▦ Scan a barcode too
        </button>
      )}
      {scanTarget && !scanDone && !(linkDone && !openScan) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 p-3">
          <button type="button" className="btn-primary" onClick={() => setScan(true)}>
            ▦ Scan {table === "books" ? "ISBN barcode" : "barcode"}
          </button>
          {table === "books" && draft.isbn ? (
            <button type="button" className="btn-secondary" onClick={() => void runLookup(String(draft.isbn))}>
              🔎 Look up ISBN
            </button>
          ) : null}
          {table === "items" && typeof draft.barcode === "string" && draft.barcode.replace(/\D/g, "").length >= 8 ? (
            <button type="button" className="btn-secondary" onClick={() => void runLookup(String(draft.barcode))}>
              🔎 Look up barcode
            </button>
          ) : null}
          {lookupMsg && <span className="text-sm text-indigo-800">{lookupMsg}</span>}
          {openScan && has(scanTarget) && has(schema.titleField) && (
            <button type="button" className="ml-auto min-h-11 px-2 text-[13px] font-semibold text-indigo-700" onClick={() => setOpenScan(false)}>
              Done
            </button>
          )}
        </div>
      )}
      {table === "apartments" && <ListingImport draft={draft} setDraft={setDraft} />}
      {table === "items" && !hide.includes("product_url") && (
        <ProductLinkImport draft={draft} setDraft={setDraft} done={linkDone} onOpen={() => setOpenLink(true)} onClose={() => setOpenLink(false)} onFilled={() => setOpenLink(false)} />
      )}
      {isFlight && <FlightLookup draft={draft} setDraft={setDraft} />}
      {table === "moves" && <MoveDistance fromZip={draft.from_zip} toZip={draft.to_zip} value={draft.distance_miles} onChange={(m) => set("distance_miles", m)} />}
      {table === "items" && (draft.image_url || draft.retail_price != null) ? (
        <div className="flex gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3">
          {typeof draft.image_url === "string" && draft.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.image_url} alt="" className="h-24 w-24 flex-none rounded-xl bg-white object-contain p-1 shadow-sm" />
          )}
          <div className="min-w-0 space-y-1 text-sm">
            <div className="truncate font-semibold">{String(draft.name || "Product")}</div>
            {[draft.brand, draft.model].filter(Boolean).length > 0 && <div className="truncate text-slate-500">{[draft.brand, draft.model].filter(Boolean).join(" · ")}</div>}
            <div className="flex flex-wrap gap-3">
              {draft.retail_price != null && (
                <span>
                  Retail <b>{formatMoney(draft.retail_price as number)}</b>
                </span>
              )}
              {draft.est_value != null && (
                <span>
                  Resale ≈ <b className="text-emerald-600">{formatMoney(draft.est_value as number)}</b>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <a className="text-indigo-700 underline" target="_blank" rel="noreferrer" href={`https://www.ebay.com/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw=${encodeURIComponent(String(draft.barcode || draft.name || ""))}`}>
                eBay sold prices ↗
              </a>
              <a className="text-indigo-700 underline" target="_blank" rel="noreferrer" href={`https://www.facebook.com/marketplace/search?query=${encodeURIComponent(String(draft.name || ""))}`}>
                Marketplace ↗
              </a>
            </div>
          </div>
        </div>
      ) : null}
      {pricesDone ? (
        <button type="button" className="min-h-11 text-[13px] font-semibold text-indigo-700" onClick={() => setOpenPrices(true)}>
          ↻ Recheck live prices
        </button>
      ) : table === "items" && String(draft.name ?? "").trim().length >= 3 ? (
        <LivePrices
          kind="item"
          query={itemPriceQuery(draft)}
          actions={(r) => {
            const typical = r.summary.newMedian;
            if (typical == null) return [];
            const used = itemPriceIdea({ ...(draft as unknown as Item), retail_price: typical }).likely;
            return [
              {
                label: `Use ${formatMoney(typical)} new → ${formatMoney(used)} used`,
                onClick: () => {
                  setDraft((d) => ({ ...d, retail_price: typical, est_value: used }));
                  setOpenPrices(false);
                },
              },
            ];
          }}
        />
      ) : null}
      {table === "books" && (draft.title || draft.isbn) ? (
        <BookOverview draft={draft} onUse={(v) => set("est_value", v)} onLookup={() => void runLookup(String(draft.isbn))} />
      ) : null}
      {sections.map((s0, si) => {
        const s = doneKeys.length ? { ...s0, fields: s0.fields.filter((f) => !doneKeys.includes(f.key)) } : s0;
        if (!s.fields.length) return null;
        const grid = (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            {s.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" || f.type === "media" || f.type === "tags" ? "@md:col-span-2" : ""}>
                {f.type !== "boolean" && (
                  <label className="label" htmlFor={`f-${f.key}`}>
                    {f.label}
                    {f.required && <span aria-hidden> *</span>}
                    {f.required && <span className="sr-only"> (required)</span>}
                  </label>
                )}
                <FieldInput field={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} onPatch={(p) => setDraft((d) => ({ ...d, ...p }))} />
                {missing === f.key && (
                  <p id={`f-${f.key}-err`} className="mt-1 text-[13px] font-medium text-red-600" role="alert">
                    Add {f.label.toLowerCase()} to save.
                  </p>
                )}
                {f.help && <p className="mt-1 text-xs text-gray-400">{f.help}</p>}
              </div>
            ))}
          </div>
        );
        if (collapsible && s.name) {
          const filled = s.fields.filter((f) => {
            const v = draft[f.key];
            return v != null && v !== "" && v !== false && !(Array.isArray(v) && !v.length);
          }).length;
          return (
            <details key={s.name} className="group rounded-2xl border border-gray-200 bg-white open:pb-4" open={si === 0}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{s.name}</span>
                <span className="text-[13px] font-normal text-gray-400">
                  {filled}/{s.fields.length}
                </span>
                <span className="text-gray-400 transition group-open:rotate-90">›</span>
              </summary>
              <div className="px-4 pt-1">{grid}</div>
            </details>
          );
        }
        return (
          <fieldset key={s.name} className="space-y-3">
            {s.name && <legend className="mb-2 text-sm font-bold text-gray-800">{s.name}</legend>}
            {grid}
          </fieldset>
        );
      })}
      <div className="sheet-footer sticky bottom-0 -mx-5 flex gap-2 border-t border-gray-200 bg-white px-5 py-3">
        <button className="btn-primary flex-1" type="submit">
          {submitLabel ?? (row ? "Save changes" : `Add ${schema.singular.toLowerCase()}`)}
        </button>
        {row && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              const name = String(draft[schema.titleField] ?? "").trim();
              del(table, row.id, name ? `“${name}”` : undefined);
              onDone(null);
            }}
          >
            Delete
          </button>
        )}
      </div>
      <Scanner open={scan} onClose={() => setScan(false)} onScan={(c) => void runLookup(c)} title={table === "books" ? "Scan book barcode (ISBN)" : "Scan product barcode"} />
    </form>
  );
}
