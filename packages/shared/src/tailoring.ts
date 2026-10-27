import type { FamilyMember, Move, Pet, Priority, Task, TaskCategory } from './types';
import { addDays, memberAge } from './util';

export interface TaskDraft {
  rule_key: string;
  title: string;
  description: string;
  category: TaskCategory;
  /** Days relative to move date (negative = before move). */
  offset: number;
  priority: Priority;
  member_id?: string | null;
  pet_id?: string | null;
  source: 'template' | 'tailored';
  /** Short explanation of why this task was suggested. */
  reason?: string;
}

export interface PlanInput {
  move: Pick<
    Move,
    'move_date' | 'from_state' | 'to_state' | 'distance_miles' | 'from_tenure' | 'to_tenure' | 'moving_method' | 'to_city'
  > | null;
  members: FamilyMember[];
  pets: Pet[];
}

export function isInterstate(move: PlanInput['move']): boolean {
  return !!move && !!move.from_state && !!move.to_state && move.from_state !== move.to_state;
}

export function isLongDistance(move: PlanInput['move']): boolean {
  return isInterstate(move) || (move?.distance_miles ?? 0) >= 100;
}

type Rule = Omit<TaskDraft, 'source'>;

const t = (
  rule_key: string,
  title: string,
  category: TaskCategory,
  offset: number,
  priority: Priority = 'medium',
  description = '',
): Rule => ({ rule_key, title, category, offset, priority, description });

function baseTemplate(move: PlanInput['move']): Rule[] {
  const longDistance = isLongDistance(move);
  const interstate = isInterstate(move);
  const method = move?.moving_method ?? 'undecided';
  const usesMovers = method === 'full_service' || method === 'self_pack' || method === 'undecided';
  const rules: Rule[] = [
    t('base:binder', 'Create a moving binder / folder for all paperwork', 'planning', -60, 'medium', 'Keep quotes, contracts, receipts, and records in one place (this app counts!).'),
    t('base:budget', 'Set a moving budget', 'finance', -60, 'high', 'Add expected costs in the Budget section: movers, travel, deposits, supplies.'),
    t('base:declutter', 'Declutter room by room — decide sell, donate, keep', 'home', -56, 'high', 'Use Inventory to mark each item’s plan. Less stuff = cheaper move.'),
    t('base:inventory', 'Inventory the house with photos (helps with insurance claims)', 'home', -56, 'high'),
    t('base:research-area', 'Research the new neighborhood (schools, groceries, hospitals, commute)', 'planning', -56),
    t('base:tax-deductions', 'Ask employer about relocation assistance & keep receipts', 'finance', -56, 'medium', 'Relocation packages may cover movers, travel, and temporary housing.'),
    t('base:sell-items', 'List items to sell (marketplace, garage sale, consignment)', 'home', -42, 'medium', 'See the Sell & Donate hub.'),
    t('base:schedule-donations', 'Schedule donation pickups', 'home', -28),
    t('base:supplies', 'Buy packing supplies (boxes, tape, markers, bubble wrap)', 'packing', -35),
    t('base:important-docs', 'Gather important documents (birth certificates, passports, SS cards, titles)', 'paperwork', -35, 'high', 'Carry these with you — never pack them on the truck.'),
    t('base:usps', 'File USPS change of address (moversguide.usps.com)', 'address', -14, 'high'),
    t('base:utilities-old', 'Schedule utility shut-off at old home (day after move)', 'utilities', -21, 'high'),
    t('base:utilities-new', 'Schedule utility start at new home (day before arrival)', 'utilities', -21, 'high'),
    t('base:internet', 'Schedule internet installation at the new home', 'utilities', -28, 'medium', 'Installs can book out weeks in advance.'),
    t('base:home-insurance', 'Set up homeowners/renters insurance for the new home', 'finance', -21, 'high'),
    t('base:bank-address', 'Update address with banks, credit cards, and loans', 'address', -7),
    t('base:pack-nonessentials', 'Start packing non-essentials (books, decor, off-season clothes)', 'packing', -28),
    t('base:food', 'Use up frozen & pantry food; plan simple meals for the last week', 'home', -21, 'low'),
    t('base:borrowed', 'Return borrowed and library items; collect items lent out', 'home', -14, 'low'),
    t('base:time-off', 'Request time off work for packing and moving day', 'planning', -35),
    t('base:valuables', 'Plan to transport valuables, jewelry, and documents yourselves', 'packing', -14, 'high'),
    t('base:hazardous', 'Dispose of items movers cannot take (paint, propane, chemicals, ammo)', 'packing', -10),
    t('base:open-first', 'Pack the household “open first” box (toilet paper, tools, chargers, sheets)', 'packing', -3, 'high'),
    t('base:fridge', 'Defrost & clean the refrigerator/freezer', 'home', -2),
    t('base:cash', 'Get cash for tips and incidentals', 'finance', -3, 'low'),
    t('base:chargers', 'Charge all devices and pack chargers in personal bag', 'moving_day', -1, 'low'),
    t('base:walkthrough', 'Final walkthrough of old home — closets, cabinets, attic, garage', 'moving_day', 0, 'high'),
    t('base:meters', 'Photograph utility meter readings and the empty home', 'moving_day', 0),
    t('base:keys', 'Hand over / collect keys, garage openers, mailbox keys', 'moving_day', 0),
    t('base:delivery-check', 'Check every box & item against inventory on delivery', 'after_move', 1, 'high', 'Note damage on the delivery receipt before signing.'),
    t('base:unpack-first', 'Unpack open-first boxes and set up beds', 'after_move', 1, 'high'),
    t('base:safety', 'Locate breaker box & water shutoff; test smoke/CO detectors', 'after_move', 2),
    t('base:change-locks', 'Change or rekey locks at the new home', 'home', 3),
    t('base:new-doctors', 'Find new primary care doctor & dentist for the family', 'health', 30),
    t('base:explore', 'Explore the new community — library cards, parks, places of worship', 'after_move', 30, 'low'),
  ];

  if (usesMovers) {
    rules.push(
      t('movers:quotes', 'Get at least 3 written mover quotes (in-home or virtual survey)', 'movers', -56, 'high', 'Track and compare them in Mover quotes.'),
      t('movers:book', 'Book movers and sign contract', 'movers', -42, 'high'),
      t('movers:confirm', 'Confirm dates, times, and inventory with movers', 'movers', -7, 'high'),
      t('movers:bol', 'Review & sign bill of lading; keep a copy', 'moving_day', 0, 'high'),
      t('movers:tip', 'Prepare water/snacks and tips for the crew', 'moving_day', 0, 'low'),
    );
    if (interstate) {
      rules.push(
        t('movers:usdot', 'Verify movers’ USDOT number and complaints on FMCSA', 'movers', -49, 'high', 'Interstate movers must be registered with FMCSA (fmcsa.dot.gov).'),
        t('movers:rights', 'Read “Your Rights and Responsibilities When You Move” (FMCSA)', 'movers', -42),
        t('movers:claims', 'File any damage claims (interstate: within 9 months)', 'after_move', 14),
      );
    }
  }
  if (method === 'rental_truck') {
    rules.push(
      t('diy:truck', 'Reserve rental truck (and trailer/tow dolly if needed)', 'movers', -42, 'high'),
      t('diy:helpers', 'Recruit helpers or book labor-only loaders', 'movers', -21),
      t('diy:equipment', 'Get dolly, furniture pads, straps, and moving blankets', 'packing', -14),
    );
  }
  if (method === 'container') {
    rules.push(t('container:order', 'Order portable container and confirm delivery/pickup dates', 'movers', -42, 'high'));
  }
  if (longDistance) {
    rules.push(
      t('trip:plan', 'Plan the travel route, overnight stops, and lodging', 'planning', -21),
      t('trip:service-car', 'Service vehicles before the long drive (oil, tires, brakes)', 'vehicles', -14),
      t('trip:bag', 'Pack a suitcase per person for the trip + first days', 'packing', -3, 'high'),
      t('trip:temp-housing', 'Arrange temporary housing if delivery is delayed', 'planning', -28, 'low'),
    );
  }
  if (interstate) {
    rules.push(
      t('state:dmv-research', 'Look up new-state DMV deadlines for license and registration', 'vehicles', -14),
      t('state:taxes', 'Plan for part-year state tax returns (both states)', 'finance', 60, 'low'),
      t('state:auto-insurance', 'Update auto insurance for the new state', 'vehicles', 7, 'high'),
    );
  }
  if (move?.from_tenure === 'rent') {
    rules.push(
      t('rent:notice', 'Give written notice to landlord', 'home', -60, 'high', 'Check your lease for the required notice period.'),
      t('rent:inspection', 'Schedule move-out inspection & clean the rental', 'home', -3),
      t('rent:deposit', 'Follow up on security deposit return', 'finance', 30),
    );
  }
  if (move?.from_tenure === 'own') {
    rules.push(
      t('own:sell', 'Coordinate home sale / listing and closing date', 'home', -90, 'high'),
      t('own:cancel-insurance', 'Cancel homeowners insurance after closing', 'finance', 1),
    );
  }
  if (move?.to_tenure === 'rent') {
    rules.push(t('newrent:lease', 'Sign new lease and pay deposit; get move-in instructions', 'paperwork', -30, 'high'));
  }
  if (move?.to_tenure === 'own') {
    rules.push(
      t('newown:closing', 'Confirm closing date, final walkthrough, and funds', 'paperwork', -21, 'high'),
      t('newown:homestead', 'File homestead exemption (if your new state offers one)', 'finance', 30, 'low'),
    );
  }
  return rules;
}

function memberRules(m: FamilyMember, move: PlanInput['move']): Rule[] {
  const age = memberAge(m, move?.move_date ?? undefined);
  const name = m.name || 'Family member';
  const k = (s: string) => `member:${m.id}:${s}`;
  const interstate = isInterstate(move);
  const rules: Rule[] = [];
  const add = (key: string, title: string, category: TaskCategory, offset: number, priority: Priority = 'medium', description = '', reason = '') =>
    rules.push({ ...t(k(key), title, category, offset, priority, description), member_id: m.id, reason });

  add('open-first', `Pack an “open first” bag for ${name}`, 'packing', -3, 'medium', 'Clothes for 3 days, toiletries, meds, chargers, comfort items.');

  if (age !== null && age < 5) {
    add('childcare', `Find childcare / daycare for ${name}`, 'kids', -56, 'high', '', `${name} is under 5`);
    add('pediatrician', `Choose a new pediatrician for ${name} and transfer records`, 'health', -30, 'high', '', `${name} is under 5`);
    add('car-seat', `Check car seat for the trip and install in vehicle`, 'kids', -7, 'medium', '', `${name} is under 5`);
    add('nursery', `Pack ${name}’s room last and set it up first`, 'kids', -1, 'medium', 'Familiar routines help little ones adjust.', `${name} is under 5`);
  }
  if ((age !== null && age >= 4 && age <= 18) || m.school_name) {
    const r = `${name} is school age`;
    add('talk', `Talk with ${name} about the move — involve them in choices`, 'family', -56, 'medium', 'Let them pick room colors or plan a goodbye.', r);
    add('new-school', `Research and choose a new school for ${name}`, 'kids', -56, 'high', '', r);
    add('school-records', `Request school records/transcripts for ${name}${m.school_name ? ` from ${m.school_name}` : ''}`, 'kids', -35, 'high', 'Ask for report cards, test scores, and withdrawal forms.', r);
    add('enroll', `Enroll ${name} in the new school (proof of residency, records)`, 'kids', -21, 'high', '', r);
    add('immunizations', `Get immunization records for ${name}`, 'health', -35, 'high', 'Schools require these at enrollment.', r);
    add('goodbye', `Plan goodbye time with ${name}’s friends; collect contact info`, 'family', -14, 'low', '', r);
  }
  if (m.special_needs.trim()) {
    const r = `${name} has special needs/accommodations`;
    add('iep', `Transfer IEP/504/accommodation plans for ${name}`, 'kids', -42, 'high', 'Request copies and contact the new school’s special services office early.', r);
    add('services', `Research therapies & support services near the new home for ${name}`, 'health', -42, 'high', '', r);
  }
  if (m.activities.trim()) {
    add('activities', `Find new activities/sports/clubs for ${name}`, 'family', 14, 'low', m.activities, `${name} has activities listed`);
  }
  if (age !== null && age >= 15 && age < 18) {
    add('teen-license', `Check new-state rules for ${name}’s learner’s permit/teen license`, 'vehicles', 14, 'low', '', `${name} is a teen`);
  }
  if (m.drives) {
    if (interstate) {
      add('license', `Get ${name}’s new-state driver’s license`, 'vehicles', 30, 'high', 'Most states require this within 30–90 days.', `${name} drives and you are changing states`);
      add('registration', `Register ${name}’s vehicle(s) in the new state`, 'vehicles', 30, 'high', '', `${name} drives and you are changing states`);
    } else {
      add('license-address', `Update address on ${name}’s driver’s license`, 'vehicles', 10, 'medium', '', `${name} drives`);
    }
  }
  if (age !== null && age >= 18) {
    add('voter', `Update voter registration for ${name}`, 'address', 14, 'medium', 'vote.gov', `${name} is an adult`);
    add('irs', `Update address with the IRS (Form 8822) for ${name}`, 'address', 14, 'low', '', `${name} is an adult`);
  }
  if (m.employed) {
    const r = `${name} is employed`;
    add('employer', `Notify ${name}’s employer/HR of new address${m.employer ? ` (${m.employer})` : ''}`, 'address', -14, 'medium', '', r);
    if (interstate) add('withholding', `Update ${name}’s state tax withholding with payroll`, 'finance', 7, 'medium', '', r);
  }
  if (m.works_remote) {
    add('office', `Set up ${name}’s home office — internet ready before move-in`, 'utilities', -21, 'high', 'Schedule internet install for the day you arrive; plan a backup hotspot.', `${name} works remotely`);
  }
  if (age !== null && age >= 65) {
    const r = `${name} is 65+`;
    add('ssa', `Update address with Social Security / Medicare for ${name}`, 'address', -7, 'high', 'ssa.gov/myaccount', r);
    add('medicare-plan', `Check if ${name}’s Medicare Advantage/Part D plan covers the new area`, 'health', -42, 'high', 'Moving out of a plan’s service area triggers a Special Enrollment Period.', r);
    add('senior-comfort', `Plan a comfortable travel itinerary for ${name} (rest stops, mobility)`, 'family', -21, 'medium', '', r);
  }
  if (m.medications.trim()) {
    const r = `${name} takes medications`;
    add('rx-refill', `Refill ${name}’s prescriptions (aim for a 90-day supply)`, 'health', -21, 'high', m.medications, r);
    add('rx-transfer', `Transfer ${name}’s prescriptions to a pharmacy near the new home`, 'health', -7, 'high', '', r);
    add('rx-carry', `Keep ${name}’s medications in the travel bag (not the truck)`, 'health', -1, 'high', '', r);
  }
  if (m.medical_conditions.trim() || m.doctors.trim()) {
    const r = `${name} has doctors/medical conditions listed`;
    add('med-records', `Request medical records for ${name} from current doctors`, 'health', -35, 'high', m.doctors, r);
    add('new-specialists', `Find new doctors/specialists for ${name} and book first visit`, 'health', -28, 'high', m.medical_conditions, r);
  }
  if (m.insurance.trim() || (age !== null && age >= 18)) {
    if (interstate) add('health-network', `Confirm ${name}’s health insurance network in the new state`, 'health', -30, 'medium', m.insurance, 'Changing states can change plan networks');
  }
  if (m.allergies.trim()) {
    add('allergy-kit', `Pack allergy meds / EpiPen for ${name} in the travel bag`, 'health', -2, 'high', m.allergies, `${name} has allergies`);
  }
  if (m.dietary.trim()) {
    add('dietary', `Plan travel meals that meet ${name}’s dietary needs`, 'family', -7, 'low', m.dietary, `${name} has dietary needs`);
  }
  return rules;
}

function petRules(p: Pet, move: PlanInput['move']): Rule[] {
  const name = p.name || 'pet';
  const k = (s: string) => `pet:${p.id}:${s}`;
  const interstate = isInterstate(move);
  const longDistance = isLongDistance(move);
  const rules: Rule[] = [];
  const add = (key: string, title: string, offset: number, priority: Priority = 'medium', description = '') =>
    rules.push({ ...t(k(key), title, 'pets', offset, priority, description), pet_id: p.id, reason: `For ${name}` });

  add('vet-records', `Get ${name}’s vet records${p.vet_name ? ` from ${p.vet_name}` : ''}`, -30, 'high');
  add('new-vet', `Find a new vet for ${name} near the new home`, -21);
  add('tag', `Update ${name}’s ID tag with your new address/phone`, -7);
  add('kit', `Pack ${name}’s travel kit (food, water, leash, meds, litter, bed)`, -2, 'high');
  add('moving-day', `Plan where ${name} stays on moving day (quiet room, sitter, boarding)`, -7, 'medium');
  add('regs', `Check pet licensing rules in the new city/state for ${name}`, 14, 'low');
  if (p.microchip.trim()) add('microchip', `Update ${name}’s microchip registration address`, 3);
  else add('microchip-get', `Consider microchipping ${name} before the move`, -30, 'low');
  if (!p.vaccinations_current) add('vaccines', `Update ${name}’s vaccinations`, -30, 'high');
  if (interstate) add('cvi', `Get a health certificate (CVI) for ${name} for interstate travel`, -10, 'high', 'Usually must be issued within 10 days of travel.');
  if (p.medications.trim()) add('meds', `Refill ${name}’s medications`, -14, 'high', p.medications);
  if (p.travel_method === 'air_cabin' || p.travel_method === 'air_cargo') {
    add('flight', `Book a pet-friendly flight for ${name} and an airline-approved carrier`, -42, 'high');
    add('crate', `Crate-train ${name} for the trip`, -35);
  }
  if (p.travel_method === 'pet_transport') add('transport', `Book pet transport service for ${name}`, -42, 'high');
  if ((p.travel_method === 'car' || p.travel_method === 'undecided') && longDistance) {
    add('lodging', `Book pet-friendly lodging along the route for ${name}`, -21);
  }
  return rules;
}

/** Builds the full tailored plan for a household. Rule keys are stable, so regenerating is idempotent. */
export function buildPlan(input: PlanInput): TaskDraft[] {
  const drafts: TaskDraft[] = baseTemplate(input.move).map((r) => ({ ...r, source: 'template' }));
  for (const m of input.members) drafts.push(...memberRules(m, input.move).map((r) => ({ ...r, source: 'tailored' as const })));
  for (const p of input.pets) drafts.push(...petRules(p, input.move).map((r) => ({ ...r, source: 'tailored' as const })));
  const seen = new Set<string>();
  return drafts.filter((d) => (seen.has(d.rule_key) ? false : (seen.add(d.rule_key), true))).sort((a, b) => a.offset - b.offset);
}

export function dueDateFor(draft: Pick<TaskDraft, 'offset'>, moveDate: string | null | undefined): string | null {
  return moveDate ? addDays(moveDate, draft.offset) : null;
}

export interface PlanDiff {
  create: TaskDraft[];
  reschedule: { task: Task; due_date: string | null }[];
  obsolete: Task[];
}

/**
 * Compares a freshly built plan with existing tasks:
 * - create: drafts not yet in the task list
 * - reschedule: untouched generated tasks whose due date changed (e.g. move date moved)
 * - obsolete: open generated tasks whose rule no longer applies (e.g. member removed)
 */
export function diffPlan(drafts: TaskDraft[], tasks: Task[], moveDate: string | null | undefined): PlanDiff {
  const byKey = new Map(tasks.filter((x) => x.rule_key && !x.deleted).map((x) => [x.rule_key!, x]));
  const draftKeys = new Set(drafts.map((d) => d.rule_key));
  const create: TaskDraft[] = [];
  const reschedule: PlanDiff['reschedule'] = [];
  for (const d of drafts) {
    const existing = byKey.get(d.rule_key);
    if (!existing) create.push(d);
    else if (existing.status === 'todo') {
      const due = dueDateFor(d, moveDate);
      if (due !== existing.due_date) reschedule.push({ task: existing, due_date: due });
    }
  }
  const obsolete = tasks.filter((x) => !x.deleted && x.rule_key && !draftKeys.has(x.rule_key) && x.status === 'todo');
  return { create, reschedule, obsolete };
}

export const TIMELINE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '3+ months before', min: -10000, max: -84 },
  { label: '8–12 weeks before', min: -83, max: -56 },
  { label: '6–8 weeks before', min: -55, max: -42 },
  { label: '4–6 weeks before', min: -41, max: -28 },
  { label: '2–4 weeks before', min: -27, max: -14 },
  { label: '1–2 weeks before', min: -13, max: -7 },
  { label: 'Final week', min: -6, max: -1 },
  { label: 'Moving day', min: 0, max: 0 },
  { label: 'First week after', min: 1, max: 7 },
  { label: 'First months after', min: 8, max: 10000 },
];

export function bucketFor(offset: number | null): string {
  if (offset === null) return 'No date';
  return TIMELINE_BUCKETS.find((b) => offset >= b.min && offset <= b.max)?.label ?? 'No date';
}
