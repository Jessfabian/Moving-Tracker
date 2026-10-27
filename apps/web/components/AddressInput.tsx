"use client";

import { normalizeZip, type AddressSuggestion } from "@moving/shared";
import { useEffect, useId, useRef, useState } from "react";
import { lookupZip, searchAddress } from "@/lib/geo";

/** Free-text address box with live suggestions (streets, buildings and places like "Sharp offices Memphis"). */
export function AddressInput({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address or place…",
  bias,
  id,
  className = "input",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: AddressSuggestion) => void;
  placeholder?: string;
  bias?: { lat: number; lng: number } | null;
  id?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const typed = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchAddress(q, bias, ctl.signal);
        setResults(r);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [value, bias]);

  const pick = (s: AddressSuggestion) => {
    typed.current = false;
    setOpen(false);
    setResults([]);
    onSelect(s);
  };

  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
        </span>
        <input
          id={id}
          className={`${className} pl-9`}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          onChange={(e) => {
            typed.current = true;
            if (e.target.value.trim().length < 3) setResults([]);
            onChange(e.target.value);
          }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[active]!);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {loading && <span className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-gray-300 border-t-ink" />}
      </div>
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_20px_50px_-20px_rgba(13,13,15,0.35)]">
          {results.map((s, i) => (
            <li key={s.label + i} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${i === active ? "bg-gray-100" : ""}`}
              >
                <span className="mt-0.5 text-gray-400">{s.name ? "◆" : "⌖"}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name ?? s.street ?? s.city}</span>
                  <span className="block truncate text-xs text-gray-500">{[s.name ? s.street : null, s.city, [s.state, s.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 pt-1 pb-0.5 text-[10px] text-gray-400">Results © OpenStreetMap contributors</li>
        </ul>
      )}
    </div>
  );
}

/** ZIP box that fills city & state as soon as 5 digits are typed. */
export function ZipInput({
  value,
  onChange,
  onResolved,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved: (r: { city: string; state: string; lat: number; lng: number }) => void;
  id?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [found, setFound] = useState("");
  const last = useRef<string | null>(normalizeZip(value ?? ""));
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-28"
        inputMode="numeric"
        maxLength={10}
        placeholder="e.g. 38103"
        value={value ?? ""}
        onChange={async (e) => {
          const v = e.target.value.replace(/[^\d-]/g, "");
          onChange(v);
          const z = normalizeZip(v);
          if (!z || z === last.current) return;
          last.current = z;
          setStatus("loading");
          const r = await lookupZip(z).catch(() => null);
          if (!r || !r.city) {
            setStatus("error");
            return;
          }
          setFound(`${r.city}, ${r.state}`);
          setStatus("ok");
          onResolved(r);
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 max-w-[6.5rem] -translate-y-1/2 truncate text-xs font-medium">
        {status === "loading" && <span className="text-gray-400">Looking up…</span>}
        {status === "ok" && <span className="text-emerald-600">✓ {found}</span>}
        {status === "error" && <span className="text-red-500">Not found</span>}
      </span>
    </div>
  );
}
