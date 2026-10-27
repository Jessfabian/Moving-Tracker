import { parseZoneResponse } from "@moving/shared";

// The Shelby County School Site Locator doesn't send CORS headers, so zone lookups go through here.
// Only a lat/lng leaves the app; the response is trimmed to the zoned school names.
const BASE = "https://www.schoolsitelocator.com/server/rest/services/ssl_SS/MapServer/729/query";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 34.8 || lat > 35.6 || lng < -90.4 || lng > -89.3) {
    return Response.json({ error: "Zone lookup covers Shelby County, TN only." }, { status: 400 });
  }
  const url = `${BASE}?f=json&geometry=${lng.toFixed(6)},${lat.toFixed(6)}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=ELEM_DESC,MID_DESC,INT_DESC,HIGH_DESC&returnGeometry=false`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, next: { revalidate: 86400 } });
    if (!res.ok) return Response.json({ error: `Zone service returned ${res.status}` }, { status: 502 });
    return Response.json(parseZoneResponse(await res.json()));
  } catch {
    return Response.json({ error: "Zone service unreachable" }, { status: 502 });
  }
}
