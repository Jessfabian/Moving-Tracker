[README.md](https://github.com/user-attachments/files/34032972/README.md)
# Moving Tracker

Everything for a long-distance move in one place — a responsive website plus a phone app tuned for dual-screen (Duo) phones. Data is stored offline-first on the device and can optionally sync between family members through Supabase.

## What's inside

| Area | Highlights |
| --- | --- |
| Dashboard | Bento overview: countdown, route, task progress, next 60 days, cash flow after the move, apartment shortlist, family, keep/sell/donate split |
| Calendar & appointments | Month grid + agenda combining appointments, task deadlines, move days, tours, paperwork expirations, utility switch-overs, bills and birthdays |
| Checklist & timeline | Plan generated from your move date and tailored to each family member and pet |
| Move details | ZIP → city/state autofill and street-address autocomplete for both addresses |
| Family & pets | Ages, schools, jobs, medical, insurance — drives tailored tasks |
| Quick scan / inventory | Photograph or scan items; UPC barcodes auto-fill name, brand, image and price; organised by room |
| Books | Scan ISBNs to pull title, author and cover; sort into keep / sell / donate |
| Boxes & QR label maker | Room-coloured printable labels (Avery sheets, thermal, full page) with QR codes that open the box contents |
| Sell & donate | Listing prices, sold tracking, donation list |
| Mover quotes, utilities, address changes, contacts | Detailed trackers with checklists |
| Mover quote kit | Move size (weight, cu ft, truck, containers, by room), cost ranges per method, ready-to-send quote request (copy / email / BCC all requested movers), printable quote packet, mover directory with FMCSA checks, questions checklist, red-flag chips and "Best value" in the comparison; choosing a mover sets the Movers budget line |
| Instant online mover quote | One-click indicative tariff price from Next Generation Movers' free public API (ZIPs, date and size only; no contact info, so no sales lead). Options for packing, unpacking, stairs, storage and guaranteed delivery; full breakdown, FMCSA status, comparison with our ballpark; save to quotes as an "Indicative" quote |
| Sales toward budget | Sold / pending / listed / not-listed sale money (incl. book orders net of fees) with a setting for how much counts toward the moving budget |
| Moving budget & funding | Expenses plus funding sources (relocation stipend, 401k, savings, settlement…) with an itemized tax estimate: 22% federal supplemental + 6.2% Social Security + 1.45% Medicare + state (none in TN/TX); type the actual deposit to override |
| Work trip (optional) | Turned on under Move details → Logistics, or from the Work trip page. Tracks flights and hotel stays as separate items (plus rental car and meals) with confirmation numbers and receipts, and shows what you're fronting and which stipend paycheck pays it back. Miles/points are valued at the airline's typical ¢/mile (or your own value) and can be paid back from the stipend. |
| Flights | Type the flight (e.g. DL1520) and the airline and route fill in automatically (adsbdb.com); each flight card is a live tracker with a route map, the plane's live position while airborne (refreshes every minute) and status. Paste the confirmation e-mail to import every flight at once. "Trip lookup" opens the airline's site with the confirmation # copied. The tracker shows a countdown, live position (adsb.lol via `/api/flight-live`) and FlightAware/Flightradar24 links. |
| Paperwork files | Household / new job / apartment files with checklists, PDF attachments and one-click combined PDF packet |
| Books selling | Market-based used-book prices, Pango / Half Price Books / eBay net comparison, USPS Media Mail rates & packaging, buyer log and printable shipping label |
| Apartments & rentals | Map with price pins, distance/drive time to your places (e.g. "Sharp offices, Memphis"), listing-link import (photos, address, rent, beds/baths, sq ft, map pin; unwraps urldefense/Safe Links; falls back to the address in the link + pasted page text when a site blocks us), affordability, side-by-side comparison |
| Schools (Memphis / Shelby County) | On the Apartments map: school pins colored by TN 2024-25 A–F letter grade, filtered by Elementary / Middle / High, municipal districts only and minimum grade. Each rental's address is checked against the Shelby County School Site Locator (via `/api/school-zones`) to show its zoned schools, the district (MSCS vs. Germantown, Collierville, Bartlett, Arlington, Lakeland, Millington), the distance and top-rated options nearby, with links to Niche, GreatSchools, US News and TN report cards. School list from NCES; grades from the TN Department of Education (both bundled in `packages/shared/src/data/shelbySchools.ts`). Defaults to your child's level from Family ages. |
| Bills & income | Monthly cash flow before vs. after the move, what to cancel/transfer, max affordable rent |
| Reports | Printable summaries and CSV export |

## Layout

```
apps/web        Next.js 16 + Tailwind v4 website (installable PWA)
apps/mobile     Expo SDK 58 phone app (bottom tabs → side rail → two-pane across the Duo hinge)
packages/shared Types, schemas, tailoring rules, calendar/cash-flow/geo logic, label rendering (with tests)
supabase        Database schema with row-level security (optional sync)
```

## Running

```powershell
npm install
npm run dev:web          # http://localhost:3000
npm run dev:mobile       # Expo dev server; open in Expo Go or an emulator
npm test                 # shared logic tests
```

Optional sync: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (web) and apply `supabase/migrations`.

## External services (free, no keys)

- Address search: Photon (komoot) and Nominatim (OpenStreetMap), proxied through `/api/geocode`
- ZIP lookup: zippopotam.us
- Map tiles: OpenStreetMap
- Book data: Open Library; product data: UPCitemdb (`/api/upc`)
- Listings: fetched server-side (`/api/listing`) from meta tags, JSON-LD and inline app data; address pins use the US Census geocoder first, then OpenStreetMap, never pinning outside the listing's state
