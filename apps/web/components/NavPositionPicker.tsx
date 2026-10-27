"use client";

import { setNavPosition, useNavPosition, type NavPosition } from "@/lib/navPosition";

const OPTIONS: { value: NavPosition; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "side", label: "Right side" },
  { value: "bottom", label: "Bottom" },
];

export function NavPositionPicker({ dark = false }: { dark?: boolean }) {
  const pos = useNavPosition();
  return (
    <div role="radiogroup" aria-label="Navigation bar position" className="space-y-1.5">
      {dark && <div className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">Navigation bar</div>}
      <div className={`grid grid-cols-3 gap-1 rounded-full p-1 ${dark ? "bg-white/10" : "bg-gray-100"}`}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={pos === o.value}
            onClick={() => setNavPosition(o.value)}
            className={`rounded-full px-2 py-1.5 text-xs font-semibold transition ${pos === o.value ? "bg-lime text-ink" : dark ? "text-white/70" : "text-gray-600"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
