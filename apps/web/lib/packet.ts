import type { MediaRef } from "@moving/shared";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface PacketDoc {
  title: string;
  type: string;
  member?: string;
  status: string;
  expires?: string | null;
  files: MediaRef[];
}

const PAGE: [number, number] = [612, 792];
const INK = rgb(0.05, 0.05, 0.06);
const MUTED = rgb(0.42, 0.42, 0.45);
const LIME = rgb(0.82, 0.96, 0.33);

async function bytesOf(url: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  return { bytes: await blob.arrayBuffer(), mime: blob.type };
}

/** Re-encode any browser-decodable image (webp, gif, heic on Safari…) as JPEG so pdf-lib can embed it. */
async function toJpeg(bytes: ArrayBuffer, mime: string): Promise<ArrayBuffer> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("encode failed");
  return blob.arrayBuffer();
}

const ascii = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of ascii(text).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function stamp(page: PDFPage, font: PDFFont, text: string) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 18, width, height: 18, color: rgb(1, 1, 1), opacity: 0.85 });
  page.drawText(ascii(text).slice(0, 110), { x: 10, y: height - 13, size: 8, font, color: MUTED });
}



interface ContentsRow {
  label: string;
  page: number | null;
  status: string;
  meta: string;
}

/** Draws the cover + contents pages into `pdf`; returns how many pages it used. */
function drawCover(pdf: PDFDocument, fonts: { font: PDFFont; bold: PDFFont }, title: string, sub: string, rows: ContentsRow[], offset: number): number {
  const { font, bold } = fonts;
  let page = pdf.addPage(PAGE);
  let count = 1;
  page.drawRectangle({ x: 0, y: 792 - 120, width: 612, height: 120, color: INK });
  page.drawText(ascii(title), { x: 48, y: 792 - 70, size: 28, font: bold, color: LIME });
  page.drawText(ascii(sub), { x: 48, y: 792 - 96, size: 11, font, color: rgb(1, 1, 1) });
  let y = 792 - 160;
  page.drawText("Contents", { x: 48, y, size: 14, font: bold, color: INK });
  y -= 22;
  for (const c of rows) {
    const lines = wrap(c.label, font, 11, 380);
    const h = lines.length * 13 + 16;
    if (y - h < 60) {
      page = pdf.addPage(PAGE);
      count++;
      y = 792 - 64;
    }
    const ok = c.page != null;
    page.drawRectangle({ x: 48, y: y - 2, width: 10, height: 10, borderColor: INK, borderWidth: 1, color: ok ? LIME : undefined });
    lines.forEach((l, i) => page.drawText(l, { x: 68, y: y - i * 13, size: 11, font: i === 0 ? bold : font, color: INK }));
    page.drawText(ok ? `page ${c.page! + offset}` : c.status === "needed" ? "STILL NEEDED" : "no file attached", { x: 470, y, size: 10, font, color: ok ? MUTED : rgb(0.8, 0.2, 0.15) });
    if (c.meta) page.drawText(ascii(c.meta), { x: 68, y: y - lines.length * 13, size: 8.5, font, color: MUTED });
    y -= h;
  }
  y -= 8;
  for (const l of wrap(`Generated ${new Date().toLocaleDateString()} by moving.tracker. Keep originals of vital records with you - never pack them on the moving truck.`, font, 8.5, 516)) {
    if (y < 36) break;
    page.drawText(l, { x: 48, y, size: 8.5, font, color: MUTED });
    y -= 11;
  }
  return count;
}

/**
 * Compiles a document "file" (e.g. the Apartment application file) into one PDF:
 * a cover sheet with a checklist, then every attached PDF page and photo/scan in order.
 */
export async function buildPacketPdf(opts: {
  title: string;
  subtitle?: string;
  household?: string;
  docs: PacketDoc[];
  resolveUrl: (m: MediaRef) => Promise<string | null>;
}): Promise<{ bytes: Uint8Array; included: number; skipped: string[] }> {
  const body = await PDFDocument.create();
  const bodyFont = await body.embedFont(StandardFonts.Helvetica);
  const skipped: string[] = [];
  const rows: ContentsRow[] = [];
  let included = 0;

  for (const d of opts.docs) {
    const label = `${d.title}${d.member ? ` - ${d.member}` : ""}`;
    const first = body.getPageCount() + 1;
    let added = 0;
    for (const f of d.files ?? []) {
      try {
        const url = await opts.resolveUrl(f);
        if (!url) throw new Error("not on this device");
        const { bytes, mime: fetchedMime } = await bytesOf(url);
        const mime = f.mime || fetchedMime;
        if (mime === "application/pdf" || /\.pdf$/i.test(f.name ?? "")) {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await body.copyPages(src, src.getPageIndices());
          for (const p of pages) {
            body.addPage(p);
            stamp(p, bodyFont, label);
          }
          added += pages.length;
        } else if (mime.startsWith("image/")) {
          const img = mime === "image/png" ? await body.embedPng(bytes) : mime === "image/jpeg" ? await body.embedJpg(bytes) : await body.embedJpg(await toJpeg(bytes, mime));
          const page = body.addPage(PAGE);
          const s = Math.min((612 - 72) / img.width, (792 - 96) / img.height, 1.5);
          const w = img.width * s;
          const h = img.height * s;
          page.drawImage(img, { x: (612 - w) / 2, y: (792 - 30 - h) / 2, width: w, height: h });
          stamp(page, bodyFont, label);
          added++;
        } else {
          skipped.push(`${d.title}: ${f.name ?? "file"} (unsupported type)`);
        }
      } catch (e) {
        skipped.push(`${d.title}: ${f.name ?? "file"} (${e instanceof Error ? e.message : "error"})`);
      }
    }
    if (added) included++;
    rows.push({ label, page: added ? first : null, status: d.status, meta: [d.type, d.expires ? `expires ${d.expires}` : ""].filter(Boolean).join("  |  ") });
  }

  const sub = [opts.household, opts.subtitle].filter(Boolean).join("  |  ");
  // Dry run to learn how many cover pages there will be, so content page numbers are exact.
  const probe = await PDFDocument.create();
  const coverPages = drawCover(probe, { font: await probe.embedFont(StandardFonts.Helvetica), bold: await probe.embedFont(StandardFonts.HelveticaBold) }, opts.title, sub, rows, 0);

  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title);
  pdf.setCreator("moving.tracker");
  drawCover(pdf, { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) }, opts.title, sub, rows, coverPages);
  if (body.getPageCount()) {
    const saved = await PDFDocument.load(await body.save());
    for (const p of await pdf.copyPages(saved, saved.getPageIndices())) pdf.addPage(p);
  }
  return { bytes: await pdf.save(), included, skipped };
}
