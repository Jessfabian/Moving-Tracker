import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ascii, wrap } from "./packet";

export interface InventoryPdfRow {
  name: string;
  detail: string;
  qty: number;
  /** Total weight for the row, e.g. "180" or "~40" when it's a typical weight rather than weighed. */
  lbs: string;
  /** e.g. "$350" or "~$120" (estimated). */
  value?: string;
  /** Small JPEG thumbnail of the item (null = item with no photo, undefined = not an item row). */
  thumb?: Uint8Array | null;
  notes: string;
}

export interface InventoryPdfRoom {
  room: string;
  rows: InventoryPdfRow[];
  /** e.g. "3 boxes" */
  boxes: string;
  lbs: number;
  /** Room total value, e.g. "$1,240". */
  value?: string;
}

const W = 612;
const H = 792;
const M = 40;
const INK = rgb(0.05, 0.05, 0.06);
const MUTED = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.88, 0.88, 0.9);
const LIME = rgb(0.82, 0.96, 0.33);
const SAND = rgb(0.96, 0.95, 0.92);
const THUMB = 30;
const columns = (photos: boolean, values: boolean) => {
  const item = M + 24 + (photos ? THUMB + 6 : 0);
  return values
    ? { n: M, thumb: M + 22, item, qty: 300, lbs: 328, value: 368, notes: 418, check: W - M - 14 }
    : { n: M, thumb: M + 22, item, qty: 318, lbs: 350, value: 0, notes: 398, check: W - M - 14 };
};
const clean = (s: string) => ascii(s.replace(/×/g, "x").replace(/→/g, "->").replace(/≈/g, "~").replace(/•/g, "-"));

/** An itemized, room-by-room inventory movers can quote from — saved as a real PDF to attach to the email. */
export async function buildInventoryPdf(opts: {
  title: string;
  subtitle: string;
  summary: [string, string][];
  notes: string[];
  rooms: InventoryPdfRoom[];
  footnote: string;
  /** Show the item photo column. */
  photos?: boolean;
  /** Show the value column. */
  values?: boolean;
}): Promise<Uint8Array> {
  const COLS = columns(!!opts.photos, !!opts.values);
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(opts.title));
  pdf.setCreator("moving.tracker");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color = INK) => p.drawText(clean(s), { x, y, size, font: f, color });

  let page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: INK });
  text(page, opts.title, M, H - 56, 24, bold, LIME);
  wrap(clean(opts.subtitle), font, 10.5, W - 2 * M)
    .slice(0, 2)
    .forEach((l, i) => text(page, l, M, H - 78 - i * 13, 10.5, font, rgb(1, 1, 1)));
  let y = H - 128;

  // Summary tiles
  const tileW = (W - 2 * M - 12) / 4;
  opts.summary.slice(0, 8).forEach(([k, v], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = M + col * (tileW + 4);
    const ty = y - row * 44;
    page.drawRectangle({ x, y: ty - 36, width: tileW, height: 40, color: SAND });
    text(page, k.toUpperCase(), x + 8, ty - 8, 7, font, MUTED);
    text(page, v, x + 8, ty - 26, 12, bold);
  });
  y -= Math.ceil(Math.min(opts.summary.length, 8) / 4) * 44 + 8;

  if (opts.notes.length) {
    text(page, "Please note", M, y, 11, bold);
    y -= 14;
    for (const n of opts.notes) {
      const lines = wrap(clean(n), font, 9.5, W - 2 * M - 12);
      lines.forEach((l, i) => {
        if (i === 0) text(page, "-", M, y, 9.5);
        text(page, l, M + 12, y, 9.5);
        y -= 12;
      });
      y -= 2;
    }
    y -= 6;
  }

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 16, color: SAND });
    text(page, "#", COLS.n + 4, y, 7.5, bold, MUTED);
    text(page, "ITEM", COLS.item, y, 7.5, bold, MUTED);
    text(page, "QTY", COLS.qty, y, 7.5, bold, MUTED);
    text(page, "LBS", COLS.lbs, y, 7.5, bold, MUTED);
    if (opts.values) text(page, "VALUE", COLS.value, y, 7.5, bold, MUTED);
    text(page, "NOTES", COLS.notes, y, 7.5, bold, MUTED);
    y -= 18;
  };

  let n = 0;
  for (const r of opts.rooms) {
    if (y < 130) newPage();
    y -= 6;
    text(page, r.room, M, y, 13, bold);
    const meta = [`${r.rows.reduce((a, x) => a + x.qty, 0)} items`, r.boxes, r.lbs ? `${r.lbs.toLocaleString()} lbs` : "", opts.values && r.value ? r.value : ""].filter(Boolean).join("  |  ");
    text(page, meta, M + bold.widthOfTextAtSize(clean(r.room), 13) + 10, y + 1, 9, font, MUTED);
    y -= 18;
    if (!r.rows.length) {
      text(page, "Boxes only — no loose items logged.", M, y, 9, font, MUTED);
      y -= 16;
      continue;
    }
    header();
    for (const row of r.rows) {
      const nameLines = wrap(clean(row.name), bold, 9.5, COLS.qty - COLS.item - 8);
      const detailLines = row.detail ? wrap(clean(row.detail), font, 8, COLS.qty - COLS.item - 8) : [];
      const noteLines = row.notes ? wrap(clean(row.notes), font, 8.5, COLS.check - COLS.notes - 8) : [];
      const h = Math.max(nameLines.length * 11.5 + detailLines.length * 10, noteLines.length * 10.5, opts.photos ? THUMB - 4 : 0) + 6;
      if (y - h < 50) {
        newPage();
        text(page, `${r.room} (continued)`, M, y, 10, bold, MUTED);
        y -= 16;
        header();
      }
      n++;
      text(page, String(n), COLS.n + 4, y, 8.5, font, MUTED);
      nameLines.forEach((l, i) => text(page, l, COLS.item, y - i * 11.5, 9.5, bold));
      detailLines.forEach((l, i) => text(page, l, COLS.item, y - nameLines.length * 11.5 - i * 10, 8, font, MUTED));
      text(page, String(row.qty), COLS.qty + 4, y, 9.5);
      if (row.lbs) text(page, row.lbs, COLS.lbs, y, 9.5);
      if (opts.values && row.value) text(page, row.value, COLS.value, y, 9.5);
      if (opts.photos) {
        const img = row.thumb ? await pdf.embedJpg(row.thumb).catch(() => null) : null;
        if (img) page.drawImage(img, { x: COLS.thumb, y: y - THUMB + 9, width: THUMB, height: THUMB });
        else if (row.thumb === null) page.drawRectangle({ x: COLS.thumb, y: y - THUMB + 9, width: THUMB, height: THUMB, color: SAND });
      }
      noteLines.forEach((l, i) => text(page, l, COLS.notes, y - i * 10.5, 8.5));
      page.drawRectangle({ x: COLS.check, y: y - 2, width: 9, height: 9, borderColor: MUTED, borderWidth: 0.75 });
      y -= h;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE });
      y -= 4;
    }
    y -= 6;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    text(p, opts.footnote, M, 24, 7.5, font, MUTED);
    const label = `Page ${i + 1} of ${pages.length}`;
    text(p, label, W - M - font.widthOfTextAtSize(label, 7.5), 24, 7.5, font, MUTED);
  });
  return pdf.save();
}
