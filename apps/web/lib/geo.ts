import type { AddressSuggestion, ListingInfo } from "@moving/shared";

export async function searchAddress(q: string, bias?: { lat: number; lng: number } | null, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const u = new URLSearchParams({ q });
  if (bias) {
    u.set("lat", String(bias.lat));
    u.set("lng", String(bias.lng));
  }
  const res = await fetch(`/api/geocode?${u}`, { signal });
  if (!res.ok) return [];
  return ((await res.json()) as { results: AddressSuggestion[] }).results ?? [];
}

/** Best match for an address. When it ends in ", ST" or ", ST 12345" only that state counts (Lakeland TN ≠ Lakeland FL). */
export async function geocodeOne(q: string): Promise<AddressSuggestion | null> {
  const results = await searchAddress(q).catch(() => [] as AddressSuggestion[]);
  const st = /,\s*([A-Z]{2})(?:\s+\d{5})?\s*$/.exec(q.trim())?.[1];
  const zip = /\b(\d{5})\s*$/.exec(q.trim())?.[1];
  if (!st) return results[0] ?? null;
  const parts = q.split(/\s*,\s*/);
  const city = (parts.length >= 3 ? parts[parts.length - 2] : "")?.toLowerCase();
  const num = /^(\d+)\s/.exec(q)?.[1];
  const inState = results.filter((r) => r.state === st);
  const exact = inState.find((r) => num && r.street.startsWith(`${num} `) && (!city || r.city.toLowerCase() === city));
  if (exact) return exact;
  // Brand-new streets aren't in any map yet — drop the pin on the ZIP (or town) instead of a random match.
  if (zip) {
    const z = await lookupZip(zip).catch(() => null);
    if (z) return { label: `${z.city}, ${z.state} ${zip}`, street: "", city: z.city, state: z.state, zip, lat: z.lat, lng: z.lng };
  }
  if (city) {
    const town = (await searchAddress(`${parts[parts.length - 2]}, ${st}`).catch(() => [] as AddressSuggestion[])).find((r) => r.state === st && r.city.toLowerCase() === city);
    if (town) return town;
  }
  return inState.find((r) => !city || r.city.toLowerCase() === city) ?? null;
}

export async function lookupZip(zip: string): Promise<{ city: string; state: string; lat: number; lng: number } | null> {
  const res = await fetch(`/api/geocode?zip=${encodeURIComponent(zip)}`);
  return res.ok ? res.json() : null;
}

export async function fetchListing(url: string): Promise<ListingInfo | { error: string }> {
  const res = await fetch(`/api/listing?url=${encodeURIComponent(url)}`);
  return res.json();
}
