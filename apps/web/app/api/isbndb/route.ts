import { normalizeIsbn, parseIsbndb } from "@moving/shared";

/**
 * GET /api/isbndb?isbn=… → book details from ISBNdb (https://api2.isbndb.com).
 * Uses the ISBNDB_API_KEY server variable, or a key the user saved in Settings (sent as x-isbndb-key).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const isbn = normalizeIsbn(params.get("isbn") ?? "");
  if (!isbn) return Response.json({ error: "Not a valid ISBN" }, { status: 400 });
  const key = (request.headers.get("x-isbndb-key") || process.env.ISBNDB_API_KEY || "").trim();
  if (!key) return Response.json({ error: "No ISBNdb key", configured: false }, { status: 501 });
  const prices = params.get("prices") === "1";
  try {
    const res = await fetch(`https://api2.isbndb.com/book/${isbn}${prices ? "?with_prices=1" : ""}`, {
      headers: { Authorization: key, Accept: "application/json" },
      signal: AbortSignal.timeout(prices ? 15000 : 8000),
    });
    const body = (await res.json().catch(() => ({}))) as { errorMessage?: string; message?: string };
    if (!res.ok) return Response.json({ error: body.errorMessage || body.message || `ISBNdb error ${res.status}` }, { status: res.status });
    const info = parseIsbndb(body);
    if (!info) return Response.json({ error: "Book not found" }, { status: 404 });
    return Response.json(info, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return Response.json({ error: "ISBNdb did not answer" }, { status: 504 });
  }
}
