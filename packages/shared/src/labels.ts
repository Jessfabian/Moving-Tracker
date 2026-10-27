import type { Snapshot } from './csv';
import { boxQrValue } from './products';
import { qrSvg } from './reports';
import type { Box, Room } from './types';

export type LabelSize = 'avery5164' | 'avery5163' | 'thermal4x6' | 'half' | 'full';

export const LABEL_SIZES: { value: LabelSize; label: string; perPage: number; description: string }[] = [
  { value: 'avery5164', label: '3⅓″ × 4″ (6 per sheet)', perPage: 6, description: 'Avery 5164 / 8164 shipping labels' },
  { value: 'avery5163', label: '2″ × 4″ (10 per sheet)', perPage: 10, description: 'Avery 5163 / 8163 — compact' },
  { value: 'thermal4x6', label: '4″ × 6″ thermal', perPage: 1, description: 'Rollo / Zebra / DYMO 4XL label printers' },
  { value: 'half', label: 'Half page (2 per sheet)', perPage: 2, description: 'Plain paper, tape to box' },
  { value: 'full', label: 'Full page (1 per sheet)', perPage: 1, description: 'Huge — readable from across the truck' },
];

export interface LabelOptions {
  size: LabelSize;
  /** Copies per box (e.g. 2 = top + side). */
  copies: number;
  numbering: 'global' | 'room';
  showContents: boolean;
  showFromRoom: boolean;
  showFlags: boolean;
  colorBand: boolean;
  householdName?: string;
}

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  size: 'avery5164',
  copies: 1,
  numbering: 'global',
  showContents: true,
  showFromRoom: true,
  showFlags: true,
  colorBand: true,
  householdName: '',
};

/** Short room code, e.g. "Master Bedroom" → "MBR", "Kitchen" → "KIT". */
export function roomCode(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^room$/i.test(w));
  if (!words.length) return 'BOX';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
/** Display code shown on the label: "#12" (global) or "KIT-3" (per room). */
export function boxDisplayCode(box: Box, boxes: Box[], rooms: Room[], numbering: LabelOptions['numbering']): string {
  if (numbering === 'global') return `#${box.number}`;
  const room = rooms.find((r) => r.id === box.room_id);
  const sameRoom = boxes.filter((b) => !b.deleted && b.room_id === box.room_id).sort((a, b) => a.number - b.number);
  const idx = sameRoom.findIndex((b) => b.id === box.id) + 1;
  return `${roomCode(room?.name ?? 'Box')}-${idx || box.number}`;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Black or white text for readability on a colored band. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111827' : '#ffffff';
}

interface SheetGeometry {
  /** Paper size in inches. */
  page: [number, number];
  /** Paper margins in inches: top, side. */
  margin: [number, number];
  cols: number;
  /** Label size in inches. */
  label: [number, number];
  gap: [number, number];
}

const GEOMETRY: Record<LabelSize, SheetGeometry> = {
  // Avery 5164: 2 × 3 of 4″ × 3⅓″, 0.5″ top margin, 0.16″ side margin, 0.19″ gutter
  avery5164: { page: [8.5, 11], margin: [0.5, 0.16], cols: 2, label: [4, 3.33], gap: [0.19, 0] },
  // Avery 5163: 2 × 5 of 4″ × 2″
  avery5163: { page: [8.5, 11], margin: [0.5, 0.16], cols: 2, label: [4, 2], gap: [0.19, 0] },
  thermal4x6: { page: [4, 6], margin: [0, 0], cols: 1, label: [4, 6], gap: [0, 0] },
  half: { page: [8.5, 11], margin: [0.4, 0.4], cols: 1, label: [7.7, 4.95], gap: [0, 0.3] },
  full: { page: [8.5, 11], margin: [0.4, 0.4], cols: 1, label: [7.7, 10.2], gap: [0, 0] },
};

function sheetCss(size: LabelSize): string {
  const g = GEOMETRY[size];
  return `@page{size:${g.page[0]}in ${g.page[1]}in;margin:0}
.page{width:${g.page[0]}in;height:${g.page[1]}in;padding:${g.margin[0]}in ${g.margin[1]}in;display:grid;grid-template-columns:repeat(${g.cols},${g.label[0]}in);grid-auto-rows:${g.label[1]}in;column-gap:${g.gap[0]}in;row-gap:${g.gap[1]}in;align-content:start}`;
}

/*
 * Every size is driven by container-query units (cqw/cqh = % of the label's own width/height),
 * so the same design fills a 2″ × 4″ sticker, a 4″ × 6″ thermal label or a full sheet.
 */
const BASE_CSS = `
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0}
body{font-family:Inter,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0d0d0f;background:#e7e4dc}
.toolbar{position:sticky;top:0;background:#0d0d0f;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:13px;z-index:2}
.toolbar .hint{opacity:.6}
.toolbar button{margin-left:auto;background:#ff5a1f;color:#fff;border:0;border-radius:999px;padding:8px 18px;font-weight:700;cursor:pointer}
.pages{display:flex;flex-direction:column;align-items:center;gap:24px;padding:20px 16px 40px;transform-origin:top left}
.page{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08),0 12px 32px -12px rgba(0,0,0,.25);flex:none}
.lbl{container-type:size;position:relative;overflow:hidden;border-radius:.12in;display:flex;flex-direction:column;background:#fff;outline:1px dashed #c9c4b8;outline-offset:-1px;break-inside:avoid}
.lbl .head{flex:none;display:flex;align-items:center;gap:3cqw;padding:min(3.2cqh,3cqw) min(5cqw,6cqh);background:var(--c);color:var(--fg)}
.lbl.plain .head{background:#fff;color:#0d0d0f;border-bottom:max(2px,.8cqh) solid #0d0d0f}
.lbl .dest{flex:1;min-width:0;font-size:min(15cqh,9.5cqw);font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl .arrow{flex:none;font-size:min(9cqh,6cqw);font-weight:900;opacity:.8}
.lbl .main{flex:1;min-height:0;display:flex;gap:min(4cqw,5cqh);padding:min(3.5cqh,3.5cqw) min(5cqw,6cqh) 0}
.lbl .qr{flex:none;height:100%;aspect-ratio:1;max-width:46cqw;display:flex;align-items:center;justify-content:center}
.lbl .qr svg{width:100%;height:100%;display:block}
.lbl .body{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:min(1.8cqh,1.4cqw);overflow:hidden}
.lbl .code{font-size:min(24cqh,15cqw);font-weight:900;letter-spacing:-.04em;line-height:.85;white-space:nowrap}
.lbl .title{font-size:min(7.5cqh,5.2cqw);font-weight:800;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.lbl .from{font-size:min(5cqh,3.4cqw);font-weight:600;color:#57534e}
.lbl .flags{display:flex;gap:min(1.5cqh,1.2cqw);flex-wrap:wrap}
.lbl .flag{font-size:min(5cqh,3.3cqw);font-weight:900;padding:.15em .45em;border-radius:.3em;border:max(1.5px,.5cqh) solid currentColor;line-height:1.1;white-space:nowrap}
.lbl .contents{flex:1;min-height:0;font-size:min(4.6cqh,3.1cqw);line-height:1.3;color:#3f3f46;overflow:hidden;-webkit-mask-image:linear-gradient(#000 75%,transparent)}
.lbl .contents.blank{-webkit-mask-image:none;display:flex;flex-direction:column}
.lbl .contents.blank .lines{flex:1;height:auto}
.lbl .contents .lines{height:100%;min-height:2.6em;background:repeating-linear-gradient(transparent 0 calc(1.6em - 1px),#d6d3d1 calc(1.6em - 1px) 1.6em)}
.lbl .seq{font-size:min(4.4cqh,3cqw);font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#a8a29e}
.lbl .contents b{display:block;font-size:.8em;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e}
.lbl .foot{flex:none;display:flex;justify-content:space-between;gap:2cqw;padding:min(1.6cqh,2cqw) min(5cqw,6cqh) min(2.2cqh,2.4cqw);font-size:min(3.6cqh,2.5cqw);color:#78716c}
.lbl .foot .side{font-weight:800;color:#0d0d0f;text-transform:uppercase;letter-spacing:.06em}
.lbl .stripe{position:absolute;left:0;right:0;bottom:0;height:max(3px,1.1cqh);background:var(--c)}
.lbl.plain .stripe{display:none}
.portrait .lbl .dest{font-size:min(9cqh,12cqw);white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.portrait .lbl .main{flex-direction:column;align-items:center}
.portrait .lbl .qr{height:auto;width:min(66cqw,44cqh);max-width:none}
.portrait .lbl .body{align-self:stretch;align-items:center;text-align:center}
.portrait .lbl .code{font-size:min(13cqh,22cqw)}
.portrait .lbl .title{font-size:min(4.5cqh,6.5cqw)}
.portrait .lbl .from{font-size:min(3cqh,4.4cqw)}
.portrait .lbl .flag{font-size:min(3.2cqh,4.4cqw)}
.portrait .lbl .flags{justify-content:center}
.portrait .lbl .contents{font-size:min(2.7cqh,3.9cqw)}
.portrait .lbl .foot{font-size:min(2.2cqh,3cqw)}
@media print{body{background:#fff}.toolbar{display:none}.pages{display:block;padding:0;zoom:1!important}.page{box-shadow:none;break-after:page}.page:last-child{break-after:auto}.lbl{outline:none}}
`;

export interface LabelInput {
  box: Box;
  code: string;
  roomName: string;
  destination: string;
  color: string;
  contents: string;
  qr: string;
  /** e.g. "Box 2 of 5 for this room". */
  seq?: string;
}

/** Builds per-box label data (QR svg, room color, contents summary). */
export async function buildLabelData(db: Snapshot, boxIds: string[], opts: Pick<LabelOptions, 'numbering'>): Promise<LabelInput[]> {
  const rooms = db.rooms.filter((r) => !r.deleted);
  const boxes = db.boxes.filter((b) => !b.deleted);
  const items = db.items.filter((i) => !i.deleted);
  const books = db.books.filter((b) => !b.deleted);
  const selected = boxes.filter((b) => boxIds.includes(b.id)).sort((a, b) => a.number - b.number);
  return Promise.all(
    selected.map(async (box) => {
      const room = rooms.find((r) => r.id === box.room_id);
      const inBox = [...items.filter((i) => i.box_id === box.id).map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)), ...books.filter((b) => b.box_id === box.id).map((b) => b.title)];
      const contents = [box.contents, inBox.slice(0, 10).join(', ') + (inBox.length > 10 ? ` +${inBox.length - 10} more` : '')].filter(Boolean).join(' · ');
      return {
        box,
        code: boxDisplayCode(box, boxes, rooms, opts.numbering),
        roomName: room?.name ?? '',
        destination: box.destination_room || room?.destination_room || room?.name || 'Unassigned',
        color: room?.color || '#334155',
        contents,
        qr: await qrSvg(boxQrValue(box.id)),
        seq: (() => {
          const same = boxes.filter((b) => b.room_id === box.room_id).sort((a, b) => a.number - b.number);
          return same.length > 1 ? `Box ${same.findIndex((b) => b.id === box.id) + 1} of ${same.length}` : '';
        })(),
      };
    }),
  );
}

export function renderLabelHtml(label: LabelInput, opts: LabelOptions, copyIndex = 0): string {
  const { box } = label;
  const fg = contrastText(label.color);
  const flags = opts.showFlags
    ? [box.fragile ? '<span class="flag" style="color:#dc2626">⚠ FRAGILE</span>' : '', box.open_first ? '<span class="flag" style="color:#16a34a">★ OPEN FIRST</span>' : '', box.fragile ? '<span class="flag" style="color:#0d0d0f">↑ THIS SIDE UP</span>' : '']
        .filter(Boolean)
        .join('')
    : '';
  const sides = ['Top', 'Side', 'Side', 'End'];
  const copyNote = opts.copies > 1 ? `<span class="side">${sides[copyIndex % sides.length] || `Copy ${copyIndex + 1}`}</span>` : '';
  const from = opts.showFromRoom && label.roomName && label.roomName !== label.destination ? `<div class="from">From: ${esc(label.roomName)}</div>` : '';
  const contents = opts.showContents ? (label.contents ? `<div class="contents"><b>Contents</b>${esc(label.contents)}</div>` : `<div class="contents blank"><b>Contents</b><div class="lines"></div></div>`) : '';
  return (
    `<div class="lbl${opts.colorBand ? '' : ' plain'}" style="--c:${esc(label.color)};--fg:${fg}">` +
    `<div class="head"><div class="dest">${esc(label.destination)}</div><div class="arrow">→</div></div>` +
    `<div class="main"><div class="qr">${label.qr}</div><div class="body">${label.seq ? `<div class="seq">${esc(label.seq)}</div>` : ''}<div class="code">${esc(label.code)}</div>` +
    `${box.label ? `<div class="title">${esc(box.label)}</div>` : ''}${from}${flags ? `<div class="flags">${flags}</div>` : ''}${contents}</div></div>` +
    `<div class="foot"><span>${esc(opts.householdName || 'Moving Tracker')} · scan for contents</span>${copyNote}${box.weight_lbs ? `<span>${box.weight_lbs} lb</span>` : ''}</div>` +
    `<div class="stripe"></div></div>`
  );
}

/** Full printable HTML document of QR box labels laid out page-by-page for the chosen label stock. */
export async function buildLabelSheet(db: Snapshot, boxIds: string[], options: Partial<LabelOptions> = {}): Promise<string> {
  const opts = { ...DEFAULT_LABEL_OPTIONS, ...options };
  const data = await buildLabelData(db, boxIds, opts);
  const copies = Math.max(1, Math.min(4, Math.round(opts.copies || 1)));
  const labels = data.flatMap((d) => Array.from({ length: copies }, (_, i) => renderLabelHtml(d, opts, i)));
  const size = LABEL_SIZES.find((s) => s.value === opts.size);
  const per = size?.perPage ?? 1;
  const pages: string[] = [];
  for (let i = 0; i < labels.length; i += per) pages.push(`<div class="page">${labels.slice(i, i + per).join('')}</div>`);
  const g = GEOMETRY[opts.size];
  const portrait = g.label[1] > g.label[0];
  // Shrink whole pages to fit narrow previews/phones; printing always uses 100%.
  const fit = `<script>(function(){var p=document.querySelector('.pages');function f(){var w=document.documentElement.clientWidth-32;var z=Math.min(1,w/(${g.page[0]}*96));p.style.zoom=z}addEventListener('resize',f);f()})()</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Box labels</title><style>${BASE_CSS}${sheetCss(opts.size)}</style></head><body><div class="toolbar"><b>${labels.length} label${labels.length === 1 ? '' : 's'} · ${pages.length} page${pages.length === 1 ? '' : 's'}</b><span class="hint">${esc(size?.description ?? '')} — print at 100% scale</span><button onclick="window.print()">Print</button></div><div class="pages${portrait ? ' portrait' : ''}">${pages.join('') || '<p style="padding:20px">No boxes selected.</p>'}</div>${fit}</body></html>`;
}
