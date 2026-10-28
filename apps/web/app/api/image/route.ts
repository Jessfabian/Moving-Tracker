import { fetchImage, safeUrl } from "@/lib/serverFetch";

/** GET /api/image?url=… → the image bytes, so listing / product photos can be saved into the app. */
export async function GET(request: Request) {
  const target = await safeUrl(new URL(request.url).searchParams.get("url") ?? "");
  if (!target) return new Response("Bad image link", { status: 400 });
  const img = await fetchImage(target);
  if (!img) return new Response("Couldn't download that image", { status: 502 });
  return new Response(img.body, { headers: { "content-type": img.type, "cache-control": "public, max-age=86400" } });
}
