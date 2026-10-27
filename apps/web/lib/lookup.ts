import { lookupProduct as sharedLookupProduct } from "@moving/shared";

const UPCITEMDB = "https://api.upcitemdb.com/prod/trial/lookup?upc=";

const proxiedFetch = (url: string) =>
  fetch(url.startsWith(UPCITEMDB) ? `/api/upc?upc=${encodeURIComponent(url.slice(UPCITEMDB.length))}` : url);

/** Product lookup routed through the same-origin /api/upc proxy (UPCitemdb blocks browser CORS). */
export const lookupProduct = (barcode: string) => sharedLookupProduct(barcode, proxiedFetch);
