import type { AddressChange, FamilyMember, NewRow, Room, Utility } from './types';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#78716c'];

export function defaultRooms(members: Pick<FamilyMember, 'name' | 'relationship'>[] = []): NewRow<'rooms'>[] {
  const base = ['Living room', 'Kitchen', 'Dining room', 'Primary bedroom', 'Primary bathroom', 'Office', 'Laundry', 'Garage', 'Basement / storage', 'Outdoor / patio'];
  const kids = members.filter((m) => m.relationship === 'child' && m.name).map((m) => `${m.name}’s room`);
  const others = members
    .filter((m) => ['parent', 'grandparent', 'sibling', 'other'].includes(m.relationship) && m.name)
    .map((m) => `${m.name}’s room`);
  return [...base.slice(0, 5), ...kids, ...others, ...base.slice(5)].map((name, i) => ({
    name,
    level: '',
    destination_room: name,
    color: COLORS[i % COLORS.length],
    sort: i,
    notes: '',
  })) satisfies Partial<Room>[];
}

export function defaultUtilities(): NewRow<'utilities'>[] {
  const types = ['Electric', 'Gas', 'Water & sewer', 'Trash & recycling', 'Internet', 'TV / streaming', 'Mobile phone plan', 'Home security'];
  const rows: Partial<Utility>[] = [];
  for (const location of ['old', 'new'] as const) {
    for (const utility_type of types) {
      if (location === 'old' && utility_type === 'Mobile phone plan') continue;
      rows.push({ utility_type, location, provider: '', account_number: '', phone: '', website: '', action_date: null, status: 'todo', notes: '' });
    }
  }
  return rows as NewRow<'utilities'>[];
}

export function defaultAddressChanges(): NewRow<'address_changes'>[] {
  const list: [string, AddressChange['category'], string][] = [
    ['USPS mail forwarding', 'government', 'moversguide.usps.com'],
    ['IRS (Form 8822)', 'government', 'Mail Form 8822'],
    ['DMV – driver’s licenses', 'government', 'State DMV website'],
    ['DMV – vehicle registration', 'government', 'State DMV website'],
    ['Voter registration', 'government', 'vote.gov'],
    ['Social Security / Medicare', 'government', 'ssa.gov'],
    ['Bank(s)', 'financial', 'Online banking'],
    ['Credit cards', 'financial', 'Online account'],
    ['Loans / mortgage', 'financial', ''],
    ['Retirement & investment accounts', 'financial', ''],
    ['Auto insurance', 'insurance', ''],
    ['Health insurance', 'insurance', ''],
    ['Life insurance', 'insurance', ''],
    ['Homeowners / renters insurance', 'insurance', ''],
    ['Doctors & dentists', 'medical', ''],
    ['Pharmacy', 'medical', ''],
    ['Employer / payroll', 'work', 'HR portal'],
    ['Schools / colleges / alumni', 'work', ''],
    ['Amazon & online stores', 'subscriptions', ''],
    ['Subscriptions & magazines', 'subscriptions', ''],
    ['Streaming & app stores billing', 'subscriptions', ''],
    ['Gym / memberships', 'personal', ''],
    ['Charities & organizations', 'personal', ''],
    ['Friends & family', 'personal', 'Send a moving announcement'],
  ];
  return list.map(([organization, category, method]) => ({
    organization,
    category,
    method,
    member_id: null,
    status: 'todo',
    done_date: null,
    notes: '',
  })) as NewRow<'address_changes'>[];
}

export function defaultBudget(): NewRow<'expenses'>[] {
  const rows: [string, string][] = [
    ['Moving company', 'movers'],
    ['Packing supplies', 'supplies'],
    ['Travel & lodging', 'travel'],
    ['Fuel', 'fuel'],
    ['Meals on the road', 'meals'],
    ['Deposits (utilities, rental)', 'deposits'],
    ['Cleaning', 'cleaning'],
    ['Crew tips', 'tips'],
  ];
  return rows.map(([title, category]) => ({ title, category, estimated: null, actual: null, paid: false, paid_by: '', date: null, receipts: [], notes: '' }));
}
