"use client";

/* eslint-disable @next/next/no-img-element -- rental photos come from the listing site's CDN */
import {
  APARTMENT_MUST_HAVES,
  apartmentSearchLinks,
  distanceToPlace,
  filterRentals,
  formatMiles,
  formatMoney,
  maxAffordableRent,
  mustHaveScore,
  primaryPlace,
  rentalBestPlan,
  rentalToApartment,
  type ApartmentSearch,
  type MediaRef,
  type RentalResult,
} from "@moving/shared";
import { useMemo, useState } from "react";
import type { CrudApi } from "@/components/CrudPage";
import { useLocalState } from "@/lib/hooks";
import { imageUrlToMedia } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

type Found = { at: string; key: string; results: RentalResult[] };
const PAGE = 10;
const KEEP_PHOTOS = 12;

const range = (a: number | null, b: number | null, unit = "") => (a == null ? "" : b != null && b !== a ? `${a}–${b}${unit}` : `${a}${unit}`);

export function FindRentals({ api }: { api: CrudApi<"apartments"> }) {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const place = primaryPlace(move?.places);
  const budget = maxAffordableRent(db);
  const fallback: ApartmentSearch = { city: move?.to_city || "", state: move?.to_state || "", zip: move?.to_zip || "", beds: null, baths: null, maxRent: budget || null, homeType: "any", mustHaves: [] };
  const [saved, setSaved] = useLocalState<ApartmentSearch | null>("apt:search", null);
  const [open, setOpen] = useLocalState("apt:searchOpen", true);
  const [found, setFound] = useLocalState<Found | null>("apt:found", null);
  const [hidden, setHidden] = useLocalState<string[]>("apt:foundHidden", []);
  const [sortBy, setSortBy] = useLocalState("apt:foundSort", "match");
  const [cityOnly, setCityOnly] = useLocalState("apt:foundCityOnly", true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, string>>({});
  const s = { ...fallback, ...(saved ?? {}) };
  const set = (patch: Partial<ApartmentSearch>) => setSaved({ ...s, ...patch });
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)) || null);
  const areaKey = [s.city.trim().toLowerCase(), s.state.trim().toUpperCase(), s.zip.trim(), s.homeType].join("|");

  const savedUrls = useMemo(() => new Map(db.apartments.filter((a) => a.listing_url).map((a) => [a.listing_url, a.id])), [db.apartments]);
  const results = (() => {
    if (!found) return [];
    const want = s.homeType === "apartment" ? ["apartment", "condo"] : s.homeType === "townhome" ? ["townhouse"] : s.homeType === "house" ? ["house"] : null;
    const list = filterRentals(found.results, s).filter((r) => !hidden.includes(r.id) && (!want || want.includes(r.homeType)) && (!cityOnly || !s.city.trim() || r.city.toLowerCase() === s.city.trim().toLowerCase()));
    const price = (r: RentalResult) => rentalBestPlan(r, s)?.priceMin ?? r.priceMin ?? 9e9;
    const miles = (r: RentalResult) => distanceToPlace({ latitude: r.lat, longitude: r.lng }, place)?.miles ?? 9e9;
    const score = (r: RentalResult) => mustHaveScore(r, s.mustHaves);
    return [...list].sort((a, b) =>
      sortBy === "price" ? price(a) - price(b) : sortBy === "distance" ? miles(a) - miles(b) : sortBy === "size" ? (b.sqftMax ?? 0) - (a.sqftMax ?? 0) : score(b) - score(a) || price(a) - price(b),
    );
  })();

  const search = async () => {
    setBusy(true);
    setError("");
    setShown(PAGE);
    try {
      const q = new URLSearchParams({ city: s.city, state: s.state, zip: s.zip, type: s.homeType });
      const res = await fetch(`/api/rentals?${q}`);
      const body = (await res.json()) as { results?: RentalResult[]; error?: string };
      if (!res.ok || !body.results) throw new Error(body.error || "Search failed — try again.");
      setFound({ at: new Date().toISOString(), key: areaKey, results: body.results });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (r: RentalResult) => {
    const row = store.insert("apartments", rentalToApartment(r, s));
    setSaving((m) => ({ ...m, [r.id]: "Saving photos…" }));
    const images = r.images;
    // Copy the photos into our own storage so the place keeps them even after the listing comes down.
    const photos: MediaRef[] = [];
    const kept = new Set<string>();
    for (const u of images.slice(0, KEEP_PHOTOS)) {
      const m = await imageUrlToMedia(u).catch(() => null);
      if (m) {
        photos.push(m);
        kept.add(u);
      }
    }
    if (photos.length) store.update("apartments", row.id, { photos, image_urls: images.filter((u) => !kept.has(u)) });
    setSaving((m) => {
      const { [r.id]: _, ...rest } = m;
      return rest;
    });
  };

  const links = apartmentSearchLinks(s);
  const summary = [s.city ? `${s.city}${s.state ? `, ${s.state}` : ""}` : s.zip, s.beds ? `${s.beds}+ bd` : "", s.maxRent ? `≤ ${formatMoney(s.maxRent)}` : "", s.homeType !== "any" ? s.homeType : ""].filter(Boolean).join(" · ");
  const stale = found && found.key !== areaKey;

  return (
    <section className="card mb-6 p-0">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold">🔎 Find apartments</span>
          <span className="block truncate text-xs text-gray-500">{summary || "Tell us what you're looking for"}</span>
        </span>
        <span className="flex-none text-sm font-semibold text-accent">{open ? "Done" : "Edit"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 px-5 py-4">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="text-xs font-semibold text-gray-500">
              City
              <input className="input mt-1" value={s.city} onChange={(e) => set({ city: e.target.value })} placeholder="Germantown" />
            </label>
            <label className="text-xs font-semibold text-gray-500">
              State
              <input className="input mt-1 uppercase" maxLength={2} value={s.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} placeholder="TN" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-gray-500">
              or ZIP
              <input className="input mt-1" inputMode="numeric" maxLength={5} value={s.zip} onChange={(e) => set({ zip: e.target.value.replace(/\D/g, "") })} placeholder="38138" />
            </label>
            <label className="text-xs font-semibold text-gray-500">
              Max rent / mo
              <input className="input mt-1" inputMode="numeric" value={s.maxRent ?? ""} onChange={(e) => set({ maxRent: num(e.target.value.replace(/\D/g, "")) })} placeholder="2000" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-gray-500">
              Bedrooms
              <select className="input mt-1" value={s.beds ?? ""} onChange={(e) => set({ beds: num(e.target.value) })}>
                <option value="">Any</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-500">
              Bathrooms
              <select className="input mt-1" value={s.baths ?? ""} onChange={(e) => set({ baths: num(e.target.value) })}>
                <option value="">Any</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-4 gap-0.5 rounded-full bg-ink/[0.06] p-0.5" role="radiogroup" aria-label="Home type">
            {(
              [
                ["any", "Any"],
                ["apartment", "Apt"],
                ["townhome", "Town"],
                ["house", "House"],
              ] as const
            ).map(([h, label]) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={s.homeType === h}
                className={`seg-btn min-h-9 min-w-0 truncate rounded-full px-1 text-[13px] font-semibold transition ${s.homeType === h ? "bg-white text-ink shadow-sm" : "text-gray-600"}`}
                onClick={() => set({ homeType: h })}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-gray-500">Nice to have (best matches first)</div>
            <div className="flex flex-wrap gap-1.5">
              {APARTMENT_MUST_HAVES.map((m) => {
                const on = s.mustHaves.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    className={`min-h-9 rounded-full px-3 text-xs font-semibold ${on ? "bg-ink text-white" : "bg-gray-100 text-gray-600"}`}
                    onClick={() => set({ mustHaves: on ? s.mustHaves.filter((x) => x !== m) : [...s.mustHaves, m] })}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-gray-500">🐾 No pet filter needed — your ESA is allowed everywhere with no pet fees.{budget ? ` Your budget tops out around ${formatMoney(budget)}/mo.` : ""}</p>
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-4">
        <button type="button" className="btn-primary w-full" disabled={busy || (!s.city.trim() && !s.zip.trim())} onClick={search}>
          {busy ? "Searching rentals…" : found && !stale ? "↻ Search again" : "🔎 Search rentals"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {found && stale && !busy && <p className="mt-2 text-xs text-gray-500">You changed the area — search again to update the results.</p>}
      </div>

      {found && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <b>{results.length}</b> <span className="text-gray-500">match{results.length === 1 ? "" : "es"} of {found.results.length} on Rent.com</span>
            </div>
            {s.city.trim() && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-ink" checked={cityOnly} onChange={(e) => setCityOnly(e.target.checked)} />
                Only in {s.city.trim()}
              </label>
            )}
            <label className="flex items-center gap-1.5 text-sm text-gray-500">
              Sort
              <select className="ios-popup font-semibold text-ink" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort results">
                <option value="match">Best match</option>
                <option value="price">Lowest rent</option>
                {place && <option value="distance">Closest</option>}
                <option value="size">Biggest</option>
              </select>
            </label>
          </div>
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Nothing matches — try a higher max rent or fewer bedrooms.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {results.slice(0, shown).map((r) => (
                <Result
                  key={r.id}
                  r={r}
                  s={s}
                  miles={place ? (distanceToPlace({ latitude: r.lat, longitude: r.lng }, place)?.miles ?? null) : null}
                  placeLabel={place?.label ?? ""}
                  savedId={savedUrls.get(r.url) ?? null}
                  saving={saving[r.id] ?? ""}
                  expanded={expanded === r.id}
                  onExpand={() => setExpanded(expanded === r.id ? null : r.id)}
                  onSave={() => void save(r)}
                  onOpen={(id) => api.open(id)}
                  onHide={() => setHidden([...hidden, r.id])}
                />
              ))}
            </ul>
          )}
          {results.length > shown && (
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, results.length - shown)} more
            </button>
          )}
          {hidden.length > 0 && (
            <button type="button" className="mt-2 min-h-11 w-full text-xs text-gray-500" onClick={() => setHidden([])}>
              Show {hidden.length} hidden
            </button>
          )}
        </div>
      )}

      {links.length > 0 && (
        <details className="border-t border-gray-100">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-5 text-sm font-semibold">
            Search other sites <span className="text-xs font-normal text-gray-400">Apartments.com, Zillow…</span>
          </summary>
          <div className="px-5 pb-4">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {links.map((l) => (
                <li key={l.site}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-2 hover:bg-gray-100">
                    <span className="min-w-0">
                      <b className="block text-sm">{l.site}</b>
                      <span className="block text-xs text-gray-500">{l.note}</span>
                    </span>
                    <span className="flex-none text-accent" aria-hidden>
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500">Found one there? Tap below and paste its link (or copy the whole page) — we fill in the rest, photos included.</p>
            <button type="button" className="btn-secondary mt-2" onClick={() => api.add()}>
              + Add from a link
            </button>
          </div>
        </details>
      )}
    </section>
  );
}

function Result(props: {
  r: RentalResult;
  s: ApartmentSearch;
  miles: number | null;
  placeLabel: string;
  savedId: string | null;
  saving: string;
  expanded: boolean;
  onExpand: () => void;
  onSave: () => void;
  onOpen: (id: string) => void;
  onHide: () => void;
}) {
  const { r, s, miles, placeLabel, savedId, saving, expanded, onExpand, onSave, onOpen, onHide } = props;
  const plan = rentalBestPlan(r, s);
  const price = plan?.priceMin ?? r.priceMin;
  const beds = plan ? `${plan.beds === 0 ? "Studio" : `${plan.beds} bd`} · ${plan.baths ?? "?"} ba` : `${range(r.bedsMin, r.bedsMax)} bd · ${range(r.bathsMin, r.bathsMax)} ba`;
  const sqft = plan?.sqftMin ?? r.sqftMin;
  const [photo, setPhoto] = useState(0);
  return (
    <li className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="relative aspect-[3/2] bg-gray-100">
        {r.images.length > 0 ? (
          <img src={r.images[photo]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">🏢</div>
        )}
        {r.images.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" className="absolute top-1/2 left-1 h-11 w-11 -translate-y-1/2 rounded-full bg-black/35 text-white" onClick={() => setPhoto((photo - 1 + r.images.length) % r.images.length)}>
              ‹
            </button>
            <button type="button" aria-label="Next photo" className="absolute top-1/2 right-1 h-11 w-11 -translate-y-1/2 rounded-full bg-black/35 text-white" onClick={() => setPhoto((photo + 1) % r.images.length)}>
              ›
            </button>
            <span className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
              {photo + 1}/{r.images.length}
            </span>
          </>
        )}
        {savedId && <span className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">✓ Saved</span>}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <b className="min-w-0 text-[15px] leading-snug">{r.name}</b>
          {price != null && (
            <span className="flex-none text-right font-display text-lg leading-none font-bold">
              {formatMoney(price)}
              <span className="text-xs font-medium text-gray-500">/mo</span>
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">{[r.address, r.city].filter(Boolean).join(", ")}</div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-gray-100 px-2 py-1">{beds}</span>
          {sqft ? <span className="rounded-full bg-gray-100 px-2 py-1">{sqft.toLocaleString()} ft²</span> : null}
          {miles != null && <span className="rounded-full bg-gray-100 px-2 py-1">{formatMiles(miles)} to {placeLabel}</span>}
          {r.special && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Special</span>}
        </div>
        {r.amenities.length > 0 && <div className="line-clamp-1 text-xs text-gray-500">{r.amenities.slice(0, 5).join(" · ")}</div>}
        {expanded && (
          <div className="space-y-1 rounded-xl bg-gray-50 p-2.5 text-xs">
            {r.floorPlans.length > 0 && (
              <ul className="space-y-0.5">
                {r.floorPlans.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {p.beds === 0 ? "Studio" : `${p.beds ?? "?"} bd`} / {p.baths ?? "?"} ba{p.sqftMin ? ` · ${range(p.sqftMin, p.sqftMax)} ft²` : ""}
                    </span>
                    <b>{p.priceMin != null ? formatMoney(p.priceMin) : "Call"}</b>
                  </li>
                ))}
              </ul>
            )}
            {r.special && <p className="text-amber-800">🎉 {r.special}</p>}
            {r.available && <p className="text-gray-500">{r.available}</p>}
            {r.phone && (
              <a className="block font-semibold text-accent" href={`tel:${r.phone.replace(/\D/g, "")}`}>
                📞 {r.phone}
              </a>
            )}
            <a className="block font-semibold text-accent" href={r.url} target="_blank" rel="noreferrer">
              View on Rent.com ↗
            </a>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          {savedId ? (
            <button type="button" className="min-h-11 flex-1 rounded-full bg-gray-100 px-3 text-sm font-semibold text-ink" onClick={() => onOpen(savedId)}>
              {saving || "Open"}
            </button>
          ) : (
            <button type="button" className="min-h-11 flex-1 rounded-full bg-ink px-3 text-sm font-semibold whitespace-nowrap text-white" onClick={onSave}>
              ＋ Save
            </button>
          )}
          <button type="button" className="min-h-11 rounded-full bg-gray-100 px-4 text-sm font-semibold text-ink" onClick={onExpand} aria-expanded={expanded}>
            {expanded ? "Less" : "More"}
          </button>
          {!savedId && (
            <button type="button" className="min-h-11 w-11 flex-none rounded-full bg-gray-100 text-sm text-gray-500" onClick={onHide} aria-label={`Hide ${r.name}`}>
              ✕
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
