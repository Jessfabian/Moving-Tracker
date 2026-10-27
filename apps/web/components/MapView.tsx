"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title?: string;
  kind?: "apartment" | "place" | "school" | "plane" | "airport";
  color?: string;
  active?: boolean;
  /** Plane heading in degrees. */
  heading?: number;
}

export interface MapLine {
  id: string;
  from: [number, number];
  to: [number, number];
  color?: string;
  dashed?: boolean;
  label?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type L = typeof import("leaflet");
interface MapState {
  map: import("leaflet").Map;
  layer: import("leaflet").LayerGroup;
  fitKey: string;
}

function pinHtml(p: MapPin) {
  switch (p.kind) {
    case "place":
      return `<div class="mt-pin mt-place"><span>★</span>${esc(p.label)}</div>`;
    case "school":
      return `<div class="mt-school${p.active ? " mt-active" : ""}" style="--pc:${p.color ?? "#6b7280"}">${esc(p.label)}</div>`;
    case "plane":
      return `<div class="mt-plane" style="transform:translate(-50%,-50%) rotate(${(p.heading ?? 0) - 45}deg)">✈</div>`;
    case "airport":
      return `<div class="mt-pin" style="--pc:#0d0d0f">🛫 ${esc(p.label)}</div>`;
    default:
      return `<div class="mt-pin${p.active ? " mt-active" : ""}" style="--pc:${p.color ?? "#0d0d0f"}">${esc(p.label)}</div>`;
  }
}

function draw(L: L, s: MapState, pins: MapPin[], lines: MapLine[], fitTo: string[] | undefined, onClick: (id: string) => void) {
  s.layer.clearLayers();
  for (const l of lines) {
    const pl = L.polyline([l.from, l.to], { color: l.color ?? "#0d0d0f", weight: 3, opacity: 0.8, dashArray: l.dashed ? "6 8" : undefined });
    if (l.label) pl.bindTooltip(l.label, { sticky: true });
    pl.addTo(s.layer);
  }
  for (const p of pins) {
    const icon = L.divIcon({ html: pinHtml(p), className: "mt-pin-wrap", iconSize: [0, 0], iconAnchor: [0, 0] });
    const z = p.kind === "place" ? 1000 : p.active ? 800 : p.kind === "school" ? -100 : 0;
    const m = L.marker([p.lat, p.lng], { icon, title: p.title ?? p.label, zIndexOffset: z });
    m.on("click", () => onClick(p.id));
    m.addTo(s.layer);
  }
  const fitPins = fitTo ? pins.filter((p) => fitTo.includes(p.id)) : pins;
  const key = fitPins.map((p) => `${p.id}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  if (key !== s.fitKey && fitPins.length) {
    s.fitKey = key;
    if (fitPins.length === 1) s.map.setView([fitPins[0]!.lat, fitPins[0]!.lng], 13);
    else s.map.fitBounds(L.latLngBounds(fitPins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 14 });
  }
}

/** Leaflet + OpenStreetMap map with price-tag pins for rentals, star pins for your places, school dots and plane markers. */
export function MapView({
  pins,
  lines = [],
  fitTo,
  onPinClick,
  className = "h-[420px]",
}: {
  pins: MapPin[];
  lines?: MapLine[];
  /** Only these pin ids decide the zoom (so hundreds of school dots don't zoom the map out). */
  fitTo?: string[];
  onPinClick?: (id: string) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const state = useRef<MapState | null>(null);
  const latest = useRef({ pins, lines, fitTo });
  const clickRef = useRef(onPinClick);

  useEffect(() => {
    clickRef.current = onPinClick;
  }, [onPinClick]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current || state.current) return;
      const map = L.map(el.current, { zoomControl: false, scrollWheelZoom: false }).setView([39.5, -96], 4);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "mt-tiles",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on("click", () => map.scrollWheelZoom.enable());
      state.current = { map, layer: L.layerGroup().addTo(map), fitKey: "" };
      const l = latest.current;
      draw(L, state.current, l.pins, l.lines, l.fitTo, (id) => clickRef.current?.(id));
    });
    return () => {
      cancelled = true;
      state.current?.map.remove();
      state.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = { pins, lines, fitTo };
    if (!state.current) return;
    void import("leaflet").then((L) => state.current && draw(L, state.current, pins, lines, fitTo, (id) => clickRef.current?.(id)));
  }, [pins, lines, fitTo]);

  return <div ref={el} className={`relative z-0 overflow-hidden rounded-[1.75rem] bg-[#e9e6df] ${className}`} />;
}