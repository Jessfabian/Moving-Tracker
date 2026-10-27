// UPCitemdb only allows its own origin via CORS, so browsers reach it through this proxy.
export async function GET(request: Request) {
  const upc = new URL(request.url).searchParams.get("upc")?.replace(/\D/g, "") ?? "";
  if (upc.length < 8 || upc.length > 14) return Response.json({ items: [] }, { status: 400 });
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, { headers: { accept: "application/json" } });
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ items: [] }, { status: 502 });
  }
}
