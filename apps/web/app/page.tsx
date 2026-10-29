"use client";

import {
  CATEGORY_ICONS,
  DISPOSITION_COLORS,
  DISPOSITIONS,
  RELATIONSHIPS,
  TASK_CATEGORIES,
  addDays,
  apartmentCosts,
  apartmentFit,
  calendarEvents,
  cashflow,
  computeInsights,
  distanceToPlace,
  formatDate,
  formatMiles,
  formatMoney,
  formatTime,
  maxAffordableRent,
  memberAge,
  optionLabel,
  personName,
  primaryPlace,
  today,
} from "@moving/shared";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { TaskList } from "@/components/TaskList";
import { useDb } from "@/lib/store-context";

function timeAgo(iso: string, now: number) {
  const s = (now - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const AVATAR_BG = ["bg-lime", "bg-sky", "bg-blush", "bg-sand", "bg-lilac", "bg-sage"];

function Ring({ pct, size = 112 }: { pct: number; size?: number }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.12)" strokeWidth="10" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--lime)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

function Bar({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function TileLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <Link href={href} className={`tile group relative flex flex-col justify-between overflow-hidden ${className}`}>
      {children}
      <span className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-ink/5 text-sm transition group-hover:bg-ink group-hover:text-white">↗</span>
    </Link>
  );
}

function CardHead({ eyebrow, title, href, cta }: { eyebrow: string; title: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="mt-1 font-display text-xl font-bold tracking-tight">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="btn-ghost shrink-0 text-xs">
          {cta ?? "Open"} →
        </Link>
      )}
    </div>
  );
}

export default function Dashboard() {
  const db = useDb();
  const ins = useMemo(() => computeInsights(db), [db]);
  const now = today();
  const events = useMemo(() => calendarEvents(db, { from: now, to: addDays(now, 60) }).filter((e) => !e.done), [db, now]);
  const move = db.moves[0];
  if (!move) return null;

  const d = ins.daysToMove;
  const nowMs = Date.parse(`${now}T12:00:00`);
  const activity = [...db.activity].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
  const dispCount = (k: string) =>
    (ins.inventory.byDisposition[k as keyof typeof ins.inventory.byDisposition] ?? 0) + (ins.books.byDisposition[k as keyof typeof ins.books.byDisposition] ?? 0);
  const totalDisp = DISPOSITIONS.reduce((a, o) => a + dispCount(o.value), 0);
  const after = cashflow(db, "after");
  const maxRent = maxAffordableRent(db);
  const place = primaryPlace(move.places ?? []);
  const shortlist = db.apartments
    .filter((a) => a.status !== "rejected")
    .sort((a, b) => (a.status === "signed" ? -1 : b.status === "signed" ? 1 : (a.rent ?? 9e9) - (b.rent ?? 9e9)))
    .slice(0, 4);
  const from = [move.from_city, move.from_state].filter(Boolean).join(", ") || "Where from?";
  const to = [move.to_city, move.to_state].filter(Boolean).join(", ") || "Where to?";
  const greeting = new Date(nowMs).getHours() < 12 ? "Good morning" : "Hello";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">
            {greeting} · {formatDate(now, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 className="h1 mt-2">
            Your move, <span className="highlight">at a glance.</span>
          </h1>
        </div>
        <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          <Link href="/scan" className="btn-secondary">
            ▦ Quick scan
          </Link>
          <Link href="/calendar" className="btn-primary">
            + Appointment
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-6 xl:grid-cols-12 max-md:[&>*:not(.half)]:col-span-2">
        {/* Hero */}
        <section className="card-ink relative overflow-hidden p-5 sm:p-8 short:p-5 md:col-span-6 xl:col-span-8">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-[0.07]" />
          <div className="relative flex flex-row flex-wrap items-end justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <div className="eyebrow text-white/50">{move.title}</div>
              <div className="mt-3 flex items-end gap-3">
                <span className="display text-[4.5rem] leading-[0.8] text-lime sm:text-[8rem] short:text-[4.5rem]">{d === null ? "—" : Math.abs(d)}</span>
                <span className="pb-2 font-display text-xl leading-tight font-semibold text-white/80 sm:text-2xl">
                  {d === null ? (
                    "set your date"
                  ) : d > 0 ? (
                    <>
                      days
                      <br />
                      to go
                    </>
                  ) : d === 0 ? (
                    "moving day!"
                  ) : (
                    <>
                      days since
                      <br />
                      the move
                    </>
                  )}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm sm:mt-6 sm:gap-3 short:mt-4">
                <span className="rounded-full bg-white/10 px-3 py-1.5 font-semibold">{from}</span>
                <span className="flex items-center gap-1 text-white/40">
                  <span className="hidden h-px w-10 border-t border-dashed border-white/40 sm:block" />✈
                  <span className="hidden h-px w-10 border-t border-dashed border-white/40 sm:block" />
                </span>
                <span className="rounded-full bg-lime px-3 py-1.5 font-semibold text-ink">{to}</span>
              </div>
              <div className="mt-3 text-sm text-white/60">
                {move.move_date ? formatDate(move.move_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : <Link href="/move" className="underline">Add your move date</Link>}
                {move.distance_miles ? ` · ${move.distance_miles.toLocaleString()} miles` : ""}
              </div>
            </div>
            <Link href="/tasks" className="relative grid shrink-0 place-items-center self-start sm:self-end">
              <Ring pct={ins.tasks.pct} />
              <div className="absolute text-center">
                <div className="font-display text-2xl font-bold">{ins.tasks.pct}%</div>
                <div className="text-[10px] tracking-widest text-white/50 uppercase">done</div>
              </div>
              <div className="mt-2 text-center text-xs text-white/50">
                {ins.tasks.done}/{ins.tasks.total} tasks
              </div>
            </Link>
          </div>
        </section>

        {/* Agenda */}
        <section className="card flex flex-col md:col-span-6 xl:col-span-4">
          <CardHead eyebrow="Next 60 days" title="Coming up" href="/calendar" cta="Calendar" />
          {events.length ? (
            <ul className="-mx-1 flex-1 space-y-1">
              {events.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={e.href} className="flex items-center gap-3 rounded-2xl px-1 py-1.5 transition hover:bg-paper">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paper text-center leading-none">
                      <div>
                        <div className="text-[9px] font-semibold text-gray-500 uppercase">{formatDate(e.date, { month: "short" })}</div>
                        <div className="font-display text-base font-bold">{Number(e.date.slice(8))}</div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{e.title}</div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                        {e.kind}
                        {e.time ? ` · ${formatTime(e.time)}` : ""}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 text-sm text-gray-500">Nothing dated yet — add appointments, tours or a move date.</p>
          )}
        </section>

        {/* Pastel stat tiles */}
        <TileLink href="/tasks" className={`half min-h-28 sm:min-h-36 md:col-span-3 ${ins.tasks.overdue.length ? "bg-blush" : "bg-sage"}`}>
          <div className="eyebrow text-ink/60">Overdue</div>
          <div>
            <div className="display text-4xl sm:text-5xl">{ins.tasks.overdue.length}</div>
            <div className="text-sm text-ink/70">{ins.tasks.upcoming.length} due in the next 2 weeks</div>
          </div>
        </TileLink>
        <TileLink href="/inventory" className="half min-h-28 sm:min-h-36 bg-sky md:col-span-3">
          <div className="eyebrow text-ink/60">Inventory</div>
          <div>
            <div className="display text-4xl sm:text-5xl">{ins.inventory.items}</div>
            <div className="text-sm text-ink/70">
              {formatMoney(ins.inventory.value)} est. · {ins.inventory.photos} photos
            </div>
          </div>
        </TileLink>
        <TileLink href="/boxes" className="half min-h-28 sm:min-h-36 bg-sand md:col-span-3">
          <div className="eyebrow text-ink/60">Boxes</div>
          <div>
            <div className="display text-4xl sm:text-5xl">{ins.boxes.total}</div>
            <div className="text-sm text-ink/70">
              {ins.boxes.byStatus.packed ?? 0} packed · {ins.boxes.byStatus.delivered ?? 0} delivered
            </div>
          </div>
        </TileLink>
        <TileLink href="/budget" className="half min-h-28 sm:min-h-36 bg-lilac md:col-span-3">
          <div className="eyebrow text-ink/60">Moving budget</div>
          <div>
            <div className="display text-[1.75rem] sm:text-4xl">{formatMoney(ins.budget.actual || ins.budget.estimated)}</div>
            <div className="text-sm text-ink/70">
              {ins.budget.quotedMovers ? `best mover quote ${formatMoney(ins.budget.quotedMovers)}` : `${db.quotes.length} mover quotes · get 3+`}
            </div>
          </div>
        </TileLink>

        {/* Tasks */}
        <section className="card md:col-span-6 xl:col-span-7">
          <CardHead eyebrow={ins.tasks.overdue.length ? `${ins.tasks.overdue.length} overdue` : "Next 14 days"} title="To do next" href="/tasks" cta="Checklist" />
          <TaskList
            tasks={[...ins.tasks.overdue, ...ins.tasks.upcoming].slice(0, 7)}
            empty={move.move_date ? "Nothing due in the next two weeks. 🎉" : "Set your move date to schedule tasks."}
          />
          <div className="mt-5 grid gap-x-6 gap-y-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
            {ins.byCategory.slice(0, 8).map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">
                    {CATEGORY_ICONS[c.category]} {optionLabel(TASK_CATEGORIES, c.category)}
                  </span>
                  <span className="text-gray-500">
                    {c.done}/{c.total}
                  </span>
                </div>
                <Bar value={(c.done / c.total) * 100} color={c.done === c.total ? "#16a34a" : "var(--ink)"} />
              </div>
            ))}
          </div>
        </section>

        {/* Money */}
        <div className="flex flex-col gap-4 md:col-span-6 xl:col-span-5">
          <Link href="/bills" className="tile group bg-lime">
            <div className="flex items-start justify-between">
              <div className="eyebrow text-ink/60">Left each month after the move</div>
              <span className="text-sm">↗</span>
            </div>
            <div className="display mt-3 text-5xl">{after.incomeNet ? formatMoney(after.leftover) : "—"}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-ink/60">Take-home</div>
                <div className="font-semibold">{formatMoney(after.incomeNet)}</div>
              </div>
              <div>
                <div className="text-ink/60">Bills</div>
                <div className="font-semibold">{formatMoney(after.bills)}</div>
              </div>
              <div>
                <div className="text-ink/60">Max rent</div>
                <div className="font-semibold">{maxRent ? formatMoney(maxRent) : "—"}</div>
              </div>
            </div>
          </Link>

          <section className="card flex-1">
            <CardHead eyebrow="Keep · sell · donate" title={totalDisp ? `${totalDisp} things decided` : "Decide what goes"} href="/sell" cta="Sell list" />
            {totalDisp ? (
              <>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                  {DISPOSITIONS.map((o) => {
                    const n = dispCount(o.value);
                    return n ? <div key={o.value} style={{ width: `${(n / totalDisp) * 100}%`, background: DISPOSITION_COLORS[o.value] }} title={`${o.label}: ${n}`} /> : null;
                  })}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {DISPOSITIONS.map((o) => {
                    const n = dispCount(o.value);
                    return n ? (
                      <div key={o.value} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: DISPOSITION_COLORS[o.value] }} />
                        <span className="flex-1">{o.label}</span>
                        <span className="font-semibold">{n}</span>
                      </div>
                    ) : null;
                  })}
                </div>
                {ins.sales.potential > 0 && (
                  <div className="mt-3 text-xs text-gray-500">
                    {formatMoney(ins.sales.soldValue)} sold of {formatMoney(ins.sales.potential)} potential
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                <Link href="/scan" className="font-semibold text-ink underline">
                  Scan or photograph items
                </Link>{" "}
                to start deciding what to move, sell or donate.
              </p>
            )}
          </section>
        </div>

        {/* Apartments */}
        <section className="card md:col-span-6 xl:col-span-7">
          <CardHead
            eyebrow={place ? `Distances to ${place.label}` : "Apartments & rentals"}
            title={db.apartments.length ? `${db.apartments.length} ${db.apartments.length === 1 ? "place" : "places"} on the list` : "Find your next home"}
            href="/apartments"
            cta="Map"
          />
          {shortlist.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {shortlist.map((a) => {
                const cover = (a.image_urls ?? [])[0];
                const dist = distanceToPlace(a, place);
                const fit = apartmentFit(a, db);
                return (
                  <Link key={a.id} href={`/apartments?open=${a.id}`} className="group flex gap-3 rounded-2xl border border-gray-100 p-2 transition hover:border-ink/20">
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-paper">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full place-items-center text-2xl">🏢</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="truncate text-sm font-semibold">{a.name || a.address || "Untitled"}</div>
                      <div className="font-display text-lg font-bold">
                        {a.rent ? formatMoney(apartmentCosts(a).monthly) : "—"}
                        <span className="text-xs font-normal text-gray-500">/mo</span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 text-xs text-gray-500">
                        {dist && <span>{formatMiles(dist.miles)}</span>}
                        {fit.verdict !== "unknown" && <span className={fit.verdict === "over" ? "text-red-600" : fit.verdict === "stretch" ? "text-amber-600" : "text-green-700"}>{fit.verdict}</span>}
                        {a.status === "signed" && <span className="font-semibold text-ink">signed ✓</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Add rentals with their listing links — photos, prices and distance to work fill in automatically.</p>
          )}
        </section>

        {/* Family */}
        <section className="card md:col-span-6 xl:col-span-5">
          <CardHead eyebrow="Family" title={db.family_members.length ? `${db.family_members.length} moving` : "Who's moving?"} href="/family" cta="Profiles" />
          {db.family_members.length ? (
            <ul className="space-y-2.5">
              {db.family_members.slice(0, 6).map((m, i) => {
                const age = memberAge(m);
                const stats = ins.perMember.find((p) => p.id === m.id);
                const total = (stats?.open ?? 0) + (stats?.done ?? 0);
                return (
                  <li key={m.id}>
                    <Link href={`/family?open=${m.id}`} className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-display font-bold ${AVATAR_BG[i % AVATAR_BG.length]}`}>
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="truncate font-semibold">{m.name}</span>
                          <span className="text-xs text-gray-500">{stats ? `${stats.open} open` : ""}</span>
                        </div>
                        <div className="mb-1 text-xs text-gray-500">
                          {optionLabel(RELATIONSHIPS, m.relationship)}
                          {age !== null ? ` · ${age}` : ""}
                          {m.school_name ? ` · ${m.school_name}` : m.employer ? ` · ${m.employer}` : ""}
                        </div>
                        <Bar value={total ? ((stats?.done ?? 0) / total) * 100 : 0} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Add each person to get tasks tailored to them — schools, doctors, jobs, pets.</p>
          )}
        </section>

        {/* Checklists */}
        <section className="card md:col-span-3 xl:col-span-4">
          <CardHead eyebrow="Admin" title="Switch-overs" />
          <div className="space-y-4 text-sm">
            {[
              { href: "/utilities", label: "💡 Utilities", ...ins.utilitiesDone },
              { href: "/addresses", label: "📮 Address changes", ...ins.addressDone },
            ].map((x) => (
              <Link key={x.href} href={x.href} className="block">
                <div className="mb-1.5 flex justify-between">
                  <span className="font-medium">{x.label}</span>
                  <span className="text-gray-500">
                    {x.done}/{x.total}
                  </span>
                </div>
                <Bar value={x.total ? (x.done / x.total) * 100 : 0} />
              </Link>
            ))}
            <Link href="/documents" className="flex items-center justify-between rounded-2xl bg-paper px-3 py-2.5">
              <span className="font-medium">📄 Paperwork still needed</span>
              <span className={`font-display text-lg font-bold ${ins.documents.needed ? "text-accent" : ""}`}>{ins.documents.needed}</span>
            </Link>
          </div>
        </section>

        {/* Books */}
        <TileLink href="/books" className="min-h-40 bg-ink text-white md:col-span-3 xl:col-span-3">
          <div className="eyebrow text-white/50">Books</div>
          <div>
            <div className="display text-5xl text-lime">{ins.books.total}</div>
            <div className="text-sm text-white/70">
              {ins.books.byDisposition.sell} to sell · {ins.books.byDisposition.donate} to donate
            </div>
          </div>
        </TileLink>

        {/* Activity */}
        <section className="card md:col-span-6 xl:col-span-5">
          <CardHead eyebrow="Shared with family" title="Recent activity" />
          {activity.length ? (
            <ul className="space-y-2 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{personName(a.actor, db.family_members)}</span>{" "}
                    <span className="text-gray-600">{a.action === "created" && a.entity_id ? "added" : a.action === "deleted" ? "removed" : a.entity_id ? "updated" : ""}</span> {a.label}
                  </span>
                  <span className="flex-none text-xs text-gray-400">{timeAgo(a.updated_at, Date.parse(new Date().toISOString()))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Changes made by anyone in your family show up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}