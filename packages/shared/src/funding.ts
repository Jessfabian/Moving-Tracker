import type { DocumentRow, Expense, FamilyMember, Fund } from './types';

/**
 * Take-home rules for common moving-money sources. Taxes are itemized (see {@link fundTax}) so you can
 * see exactly where every dollar goes. Planning estimates only — confirm with HR / a tax professional.
 */
export interface FundRule {
  kind: string;
  icon: string;
  /** How tax is figured: supplemental wages, a retirement distribution, or not taxed. */
  tax: 'wages' | 'retirement' | 'none';
  note: string;
}

export const FUND_RULES: Record<string, FundRule> = {
  relocation_stipend: {
    kind: 'relocation_stipend',
    icon: '💼',
    tax: 'wages',
    note: 'A cash relocation stipend is taxable “supplemental wages”. Most payroll systems withhold a flat 22% federal (the W-4 doesn’t change this flat rate) plus Social Security 6.2% and Medicare 1.45%, plus state tax — $0 in TN and TX. If Sharp grosses it up, tick “Employer grossed-up”. Watch for a repayment clause if he leaves within 12–24 months.',
  },
  signing_bonus: {
    kind: 'signing_bonus',
    icon: '✍️',
    tax: 'wages',
    note: 'Bonuses are supplemental wages: 22% federal flat + 6.2% Social Security + 1.45% Medicare + state (none in TN/TX). Check any clawback period.',
  },
  savings: { kind: 'savings', icon: '🐖', tax: 'none', note: 'Already-taxed money. Keep 3+ months of new-city expenses in reserve.' },
  retirement_401k: {
    kind: 'retirement_401k',
    icon: '🧓',
    tax: 'retirement',
    note: 'Plans must withhold 20% federal up front. Before age 59½ there’s also a 10% early-withdrawal penalty (owed when you file), and the withdrawal is added to your income for the year. Compare a 401k loan or hardship options first.',
  },
  settlement: {
    kind: 'settlement',
    icon: '⚖️',
    tax: 'none',
    note: 'Personal-injury settlements are generally not taxable; employment, lost-wage or punitive portions usually are. Confirm with your attorney and set aside tax if needed.',
  },
  home_sale: { kind: 'home_sale', icon: '🏡', tax: 'none', note: 'Primary-home gains up to $250k ($500k married) are usually excluded. Item sales at a loss are not taxable.' },
  deposit_refund: { kind: 'deposit_refund', icon: '🔑', tax: 'none', note: 'Landlords usually have 14–45 days to return a deposit (by state). Leave a forwarding address in writing.' },
  tax_refund: { kind: 'tax_refund', icon: '🧾', tax: 'none', note: 'Not taxable federally. Update your address with the IRS (Form 8822) so the refund finds you.' },
  loan: { kind: 'loan', icon: '🏦', tax: 'none', note: 'Borrowed money — budget the repayments into your after-move bills.' },
  gift: { kind: 'gift', icon: '🎁', tax: 'none', note: 'Gifts aren’t taxable to the recipient (the giver files if over the annual exclusion).' },
  other: { kind: 'other', icon: '💰', tax: 'none', note: '' },
};

export const fundRule = (kind: string): FundRule => FUND_RULES[kind] ?? FUND_RULES.other!;

// ── Taxes ──────────────────────────────────────────────────────────────────

export const FEDERAL_SUPPLEMENTAL_RATE = 0.22;
export const SOCIAL_SECURITY_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const RETIREMENT_WITHHOLDING_RATE = 0.2;
export const EARLY_WITHDRAWAL_PENALTY = 0.1;

/** States with no tax on wages. */
export const NO_WAGE_TAX_STATES = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'] as const;

/** Approximate flat / supplemental state rates. Anything not listed falls back to {@link DEFAULT_STATE_RATE}. */
export const STATE_RATES: Record<string, number> = {
  AZ: 0.025, CA: 0.066, CO: 0.044, GA: 0.0539, ID: 0.058, IL: 0.0495, IN: 0.0305, IA: 0.038, KY: 0.04,
  LA: 0.03, MA: 0.05, MI: 0.0425, MS: 0.044, NC: 0.0425, NY: 0.0962, PA: 0.0307, UT: 0.0455,
};
export const DEFAULT_STATE_RATE = 0.05;

export function stateTaxRate(state: string | null | undefined): { rate: number; estimated: boolean } {
  const st = (state ?? '').trim().toUpperCase();
  if (!st) return { rate: 0, estimated: true };
  if ((NO_WAGE_TAX_STATES as readonly string[]).includes(st)) return { rate: 0, estimated: false };
  if (st in STATE_RATES) return { rate: STATE_RATES[st]!, estimated: true };
  return { rate: DEFAULT_STATE_RATE, estimated: true };
}

export interface TaxLine {
  label: string;
  rate: number;
  amount: number;
  /** Withheld from the check now vs owed later when you file. */
  when: 'withheld' | 'at_filing';
  estimated?: boolean;
}

export interface FundTax {
  gross: number;
  lines: TaxLine[];
  /** Taken out of the check before it lands. */
  withheld: number;
  /** Extra owed at tax time (e.g. 401k early-withdrawal penalty). */
  owedLater: number;
  /** Net you keep after everything above (or the actual deposit if entered). */
  net: number;
  /** Estimated net deposit = gross − withheld. */
  deposit: number;
  /** True when the user typed the real deposit. */
  manual: boolean;
  state: string;
  summary: string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Itemized tax estimate for a funding source. */
export function fundTax(
  f: Pick<Fund, 'amount' | 'net_amount' | 'kind'> & Partial<Pick<Fund, 'tax_state' | 'grossed_up'>>,
  opts: { member?: Pick<FamilyMember, 'birth_date'> | null; today?: Date; state?: string | null } = {},
): FundTax {
  const gross = f.amount ?? 0;
  const rule = fundRule(f.kind);
  const state = ((f.tax_state ?? '').trim() || (opts.state ?? '')).toUpperCase();
  const lines: TaxLine[] = [];
  const st = stateTaxRate(state);
  const stLabel = state ? `${state} state tax` : 'State tax';

  if (rule.tax === 'wages' && !f.grossed_up) {
    lines.push({ label: 'Federal income tax (22% supplemental)', rate: FEDERAL_SUPPLEMENTAL_RATE, amount: cents(gross * FEDERAL_SUPPLEMENTAL_RATE), when: 'withheld' });
    lines.push({ label: 'Social Security', rate: SOCIAL_SECURITY_RATE, amount: cents(gross * SOCIAL_SECURITY_RATE), when: 'withheld' });
    lines.push({ label: 'Medicare', rate: MEDICARE_RATE, amount: cents(gross * MEDICARE_RATE), when: 'withheld' });
    lines.push({ label: stLabel, rate: st.rate, amount: cents(gross * st.rate), when: 'withheld', estimated: st.estimated });
  } else if (rule.tax === 'retirement') {
    lines.push({ label: 'Federal withholding (20% mandatory)', rate: RETIREMENT_WITHHOLDING_RATE, amount: cents(gross * RETIREMENT_WITHHOLDING_RATE), when: 'withheld' });
    lines.push({ label: stLabel, rate: st.rate, amount: cents(gross * st.rate), when: 'withheld', estimated: st.estimated });
    const age = opts.member?.birth_date ? ageOn(opts.member.birth_date, opts.today ?? new Date()) : null;
    if (age == null || age < 59.5) {
      lines.push({ label: '10% early-withdrawal penalty', rate: EARLY_WITHDRAWAL_PENALTY, amount: cents(gross * EARLY_WITHDRAWAL_PENALTY), when: 'at_filing' });
    }
  }

  const withheld = cents(lines.filter((l) => l.when === 'withheld').reduce((s, l) => s + l.amount, 0));
  const owedLater = cents(lines.filter((l) => l.when === 'at_filing').reduce((s, l) => s + l.amount, 0));
  const deposit = cents(gross - withheld);
  const manual = f.net_amount != null;
  const net = manual ? f.net_amount! : cents(deposit - owedLater);

  let summary = '';
  if (manual) summary = 'Actual deposit entered';
  else if (rule.tax === 'wages' && f.grossed_up) summary = 'Grossed-up — employer covers the tax';
  else if (lines.length) {
    const pct = gross ? ((withheld + owedLater) / gross) * 100 : 0;
    summary = `${pct.toFixed(2).replace(/\.?0+$/, '')}% total tax`;
  } else summary = 'Not taxed';

  return { gross, lines, withheld, owedLater, net, deposit, manual, state, summary };
}

/** Net amount you keep: the actual deposit if entered, otherwise the itemized estimate. */
export function fundNet(
  f: Pick<Fund, 'amount' | 'net_amount' | 'kind'> & Partial<Pick<Fund, 'tax_state' | 'grossed_up'>>,
  member?: Pick<FamilyMember, 'birth_date'> | null,
  today = new Date(),
  state?: string | null,
): number {
  return fundTax(f, { member, today, state }).net;
}

function ageOn(birthdate: string, today: Date): number | null {
  const b = new Date(birthdate + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return null;
  return (today.getTime() - b.getTime()) / (365.25 * 86400000);
}

export interface FundingSummary {
  gross: number;
  net: number;
  received: number;
  pending: number;
  budgeted: number;
  spent: number;
  /** Net funds minus the larger of budgeted vs actual spend. Negative = shortfall. */
  surplus: number;
  byKind: { kind: string; net: number }[];
}

export function fundingSummary(
  funds: Fund[],
  expenses: Pick<Expense, 'estimated' | 'actual'>[],
  members: Pick<FamilyMember, 'id' | 'birth_date'>[] = [],
  today = new Date(),
  /** Default tax state (usually the state you're moving to). */
  state?: string | null,
): FundingSummary {
  const byId = new Map(members.map((m) => [m.id, m]));
  let gross = 0;
  let net = 0;
  let received = 0;
  const kinds = new Map<string, number>();
  for (const f of funds) {
    const n = fundNet(f, f.member_id ? byId.get(f.member_id) : null, today, state);
    gross += f.amount ?? 0;
    net += n;
    if (f.received) received += n;
    kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + n);
  }
  const budgeted = expenses.reduce((s, e) => s + (e.estimated ?? 0), 0);
  const spent = expenses.reduce((s, e) => s + (e.actual ?? 0), 0);
  const need = expenses.reduce((s, e) => s + Math.max(e.estimated ?? 0, e.actual ?? 0), 0);
  return {
    gross,
    net,
    received,
    pending: net - received,
    budgeted,
    spent,
    surplus: net - need,
    byKind: [...kinds].map(([kind, n]) => ({ kind, net: n })).sort((a, b) => b.net - a.net),
  };
}

// ── Starter budget ─────────────────────────────────────────────────────────

export interface BudgetLine {
  title: string;
  category: string;
  estimated: number | null;
  notes: string;
}

/** Typical long-distance moving costs, sized by distance, family and vehicles. Planning estimates only. */
export function suggestBudgetLines(opts: {
  miles: number | null;
  people: number;
  vehicles: number;
  pets: number;
  method?: string;
  moverQuote?: number | null;
  renting?: boolean;
}): BudgetLine[] {
  const miles = opts.miles ?? 0;
  const people = Math.max(1, opts.people);
  const vehicles = Math.max(1, opts.vehicles);
  const days = Math.max(1, Math.ceil(miles / 500));
  const nights = Math.max(0, days - 1);
  const r = (n: number) => Math.round(n / 5) * 5;
  const lines: BudgetLine[] = [
    {
      title: opts.method === 'rental_truck' ? 'Truck rental' : 'Movers',
      category: opts.method === 'rental_truck' ? 'truck' : 'movers',
      estimated: opts.moverQuote ?? null,
      notes: opts.moverQuote ? 'From your accepted mover quote.' : 'Add your accepted quote here (get 3+ binding / not-to-exceed quotes).',
    },
    { title: 'Packing supplies (boxes, tape, wrap)', category: 'supplies', estimated: r(150 + people * 60), notes: 'Free boxes from liquor/grocery stores and Buy Nothing groups cut this a lot.' },
  ];
  if (miles > 0) {
    lines.push(
      { title: `Fuel – ${miles.toLocaleString()} mi × ${vehicles} vehicle${vehicles > 1 ? 's' : ''}`, category: 'fuel', estimated: r((miles / 24) * 3.3 * vehicles), notes: 'Assumes ~24 mpg and $3.30/gal. A loaded truck gets ~10 mpg.' },
      { title: `Meals on the road – ${days} day${days > 1 ? 's' : ''}`, category: 'meals', estimated: r(days * people * 45), notes: '' },
    );
    if (nights) lines.push({ title: `Hotels – ${nights} night${nights > 1 ? 's' : ''}`, category: 'travel', estimated: r(nights * 140), notes: 'Book pet-friendly hotels ahead if traveling with pets.' });
  }
  if (opts.pets) lines.push({ title: 'Pet travel (crates, vet certificate, boarding)', category: 'pet_transport', estimated: r(opts.pets * 120), notes: '' });
  if (opts.renting !== false) lines.push({ title: 'Apartment application fees & security deposit', category: 'deposits', estimated: null, notes: 'Usually one month of rent plus $50–$100 application fee per adult.' });
  lines.push(
    { title: 'Utility & internet setup deposits', category: 'utilities', estimated: 200, notes: '' },
    { title: 'Move-out cleaning', category: 'cleaning', estimated: 250, notes: '' },
    { title: 'New license & vehicle registration', category: 'fees', estimated: r(90 + vehicles * 120), notes: 'Most states require it within 30–60 days.' },
  );
  if (opts.method !== 'rental_truck' && opts.method !== 'container') lines.push({ title: 'Mover tips', category: 'tips', estimated: 150, notes: '$20–$40 per mover per day is typical.' });
  return lines;
}

// ── Document files / packets ───────────────────────────────────────────────

export interface FolderTemplateItem {
  title: string;
  doc_type: string;
  /** Create one per adult family member (18+), or per member when no ages are known. */
  perAdult?: boolean;
  perMember?: boolean;
}

export interface FolderTemplate {
  folder: string;
  icon: string;
  label: string;
  blurb: string;
  tone: string;
  items: FolderTemplateItem[];
}

export const FOLDER_TEMPLATES: FolderTemplate[] = [
  {
    folder: 'apartment',
    icon: '🏢',
    label: 'Apartment file',
    blurb: 'Everything a leasing office asks for — have it ready to apply the same day you tour.',
    tone: 'bg-sky',
    items: [
      { title: 'Photo ID', doc_type: 'id', perAdult: true },
      { title: 'Offer letter (proof of income)', doc_type: 'offer_letter' },
      { title: 'Recent pay stubs (last 2–3)', doc_type: 'pay_stub', perAdult: true },
      { title: 'Bank statements (last 2–3 months)', doc_type: 'bank_statement' },
      { title: 'Tax return / W-2 (last year)', doc_type: 'tax_return' },
      { title: 'Credit report', doc_type: 'credit_report', perAdult: true },
      { title: 'Current landlord reference letter', doc_type: 'reference' },
      { title: 'Rental application', doc_type: 'rental_application' },
      { title: 'Renters insurance quote / policy', doc_type: 'insurance' },
      { title: 'Pet vaccination & vet records', doc_type: 'vet' },
    ],
  },
  {
    folder: 'new_job',
    icon: '💼',
    label: 'New job file',
    blurb: 'Offer, relocation and onboarding paperwork for the new employer.',
    tone: 'bg-sage',
    items: [
      { title: 'Signed offer letter', doc_type: 'offer_letter' },
      { title: 'Relocation agreement / stipend terms', doc_type: 'relocation_agreement' },
      { title: 'I-9 identity documents', doc_type: 'id' },
      { title: 'W-4 & state withholding forms', doc_type: 'direct_deposit' },
      { title: 'Direct deposit form / voided check', doc_type: 'direct_deposit' },
      { title: 'Benefits enrollment', doc_type: 'employment' },
      { title: 'Moving expense receipts (for reimbursement)', doc_type: 'receipt' },
    ],
  },
  {
    folder: 'household',
    icon: '🏠',
    label: 'Household file',
    blurb: 'Vital records for everyone — hand-carry these, never pack them on the truck.',
    tone: 'bg-sand',
    items: [
      { title: "Driver's license / ID", doc_type: 'id', perMember: true },
      { title: 'Birth certificate', doc_type: 'birth_certificate', perMember: true },
      { title: 'Social Security card', doc_type: 'social_security', perMember: true },
      { title: 'Passport', doc_type: 'id', perMember: true },
      { title: 'Marriage certificate', doc_type: 'other' },
      { title: 'Homeowners / renters insurance', doc_type: 'insurance' },
      { title: 'Current lease / closing documents', doc_type: 'lease' },
      { title: 'Recent utility bill (proof of address)', doc_type: 'utility_bill' },
    ],
  },
  {
    folder: 'financial',
    icon: '💵',
    label: 'Financial file',
    blurb: 'Where the moving money comes from — stipend, 401k, settlement and savings paperwork.',
    tone: 'bg-lime',
    items: [
      { title: 'Relocation stipend payout statement', doc_type: 'relocation_agreement' },
      { title: '401k withdrawal / loan paperwork', doc_type: 'retirement' },
      { title: 'Settlement agreement & disbursement', doc_type: 'settlement' },
      { title: 'Savings / bank statements', doc_type: 'bank_statement' },
      { title: 'Tax returns (last 3 years)', doc_type: 'tax_return' },
    ],
  },
  {
    folder: 'moving',
    icon: '🚚',
    label: 'Moving file',
    blurb: 'Mover contracts, inventory and claims.',
    tone: 'bg-blush',
    items: [
      { title: 'Mover contract & bill of lading', doc_type: 'mover_contract' },
      { title: 'Mover insurance / valuation coverage', doc_type: 'insurance' },
      { title: 'Signed inventory sheet', doc_type: 'mover_contract' },
      { title: 'New lease / purchase agreement', doc_type: 'lease' },
    ],
  },
  {
    folder: 'medical',
    icon: '🩺',
    label: 'Medical & school file',
    blurb: 'Records you need to register with new doctors and schools.',
    tone: 'bg-lilac',
    items: [
      { title: 'Medical records & prescriptions', doc_type: 'medical', perMember: true },
      { title: 'Immunization records', doc_type: 'immunization', perMember: true },
      { title: 'School transcripts & withdrawal forms', doc_type: 'school' },
    ],
  },
  {
    folder: 'vehicle',
    icon: '🚗',
    label: 'Vehicle file',
    blurb: 'Titles, registration and insurance for re-registering in the new state.',
    tone: 'bg-sky',
    items: [
      { title: 'Vehicle title', doc_type: 'vehicle' },
      { title: 'Registration', doc_type: 'vehicle' },
      { title: 'Auto insurance card', doc_type: 'insurance' },
    ],
  },
];

export const folderTemplate = (folder: string) => FOLDER_TEMPLATES.find((t) => t.folder === folder);

const isAdult = (m: Pick<FamilyMember, 'birth_date'>, today: Date) => {
  const a = m.birth_date ? ageOn(m.birth_date, today) : null;
  return a == null || a >= 18;
};

/** Rows to insert for a folder template, skipping any that already exist (same title + member + folder). */
export function folderTemplateRows(
  tpl: FolderTemplate,
  members: Pick<FamilyMember, 'id' | 'birth_date'>[],
  existing: Pick<DocumentRow, 'title' | 'member_id' | 'folder'>[],
  today = new Date(),
): Pick<DocumentRow, 'title' | 'doc_type' | 'folder' | 'member_id'>[] {
  const have = new Set(existing.map((d) => `${d.folder ?? ''}|${d.title}|${d.member_id ?? ''}`));
  const adults = members.filter((m) => isAdult(m, today));
  return tpl.items
    .flatMap((it) => {
      const who = it.perMember ? members : it.perAdult ? adults : [];
      return who.length
        ? who.map((m) => ({ title: it.title, doc_type: it.doc_type, folder: tpl.folder, member_id: m.id as string | null }))
        : [{ title: it.title, doc_type: it.doc_type, folder: tpl.folder, member_id: null as string | null }];
    })
    .filter((r) => !have.has(`${r.folder}|${r.title}|${r.member_id ?? ''}`));
}

export interface FolderStatus {
  total: number;
  ready: number;
  withFiles: number;
  missing: number;
  pct: number;
}

export function folderStatus(docs: Pick<DocumentRow, 'status' | 'files'>[]): FolderStatus {
  const ready = docs.filter((d) => d.status === 'received' || d.status === 'filed').length;
  const withFiles = docs.filter((d) => (d.files ?? []).length > 0).length;
  return { total: docs.length, ready, withFiles, missing: docs.length - ready, pct: docs.length ? Math.round((ready / docs.length) * 100) : 0 };
}
