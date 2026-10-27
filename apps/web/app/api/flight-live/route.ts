// adsb.lol doesn't send CORS headers, so the browser asks for live positions through this proxy.
export async function GET(request: Request) {
  const callsign = (new URL(request.url).searchParams.get("callsign") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (callsign.length < 3 || callsign.length > 8) return Response.json({ ac: [] }, { status: 400 });
  try {
    const res = await fetch(`https://api.adsb.lol/v2/callsign/${callsign}`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return Response.json({ ac: [] }, { status: 502 });
    return new Response(await res.text(), { headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ ac: [] }, { status: 502 });
  }
}