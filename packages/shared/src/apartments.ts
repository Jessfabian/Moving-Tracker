import type { Apartment } from './types';

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface ApartmentCosts {
  monthly: number;
  moveIn: number;
  firstYear: number;
  perSqft: number | null;
  perBedroom: number | null;
}

/** True monthly cost, cash needed to move in, and total cost over the first 12 months. */
export function apartmentCosts(a: Partial<Apartment>): ApartmentCosts {
  const monthly = n(a.rent) + n(a.pet_rent) + n(a.parking_fee) + n(a.utilities_est) + n(a.other_monthly);
  const oneTime = n(a.deposit) + n(a.pet_deposit) + n(a.application_fee) + n(a.admin_fee) + n(a.broker_fee);
  const moveIn = oneTime + monthly;
  const refundable = n(a.deposit);
  const firstYear = monthly * 12 + oneTime - refundable;
  return {
    monthly,
    moveIn,
    firstYear,
    perSqft: a.sqft && n(a.rent) ? Math.round((n(a.rent) / a.sqft) * 100) / 100 : null,
    perBedroom: a.bedrooms && n(a.rent) ? Math.round(n(a.rent) / a.bedrooms) : null,
  };
}

/** Rule of thumb: rent should be ≤ 30% of gross monthly income. */
export function incomeNeeded(monthlyRent: number, ratio = 0.3) {
  return monthlyRent > 0 ? Math.round(monthlyRent / ratio) * 12 : 0;
}

export const APARTMENT_CHECKLIST: string[] = [
  'Verify the landlord / management company is legitimate (never wire money before touring)',
  'Ask what utilities are included and average monthly bills',
  'Confirm pet policy, breed/weight limits, pet rent and deposits',
  'Check cell signal and internet providers available',
  'Test water pressure, hot water, appliances, HVAC, windows and locks',
  'Look for signs of pests, mold, leaks or water damage',
  'Ask about parking, guest parking and EV charging',
  'Ask about noise, quiet hours and who lives above/below',
  'Clarify lease break penalties, renewal increases and subletting rules',
  'Ask about renters insurance requirements',
  'Confirm move-in date, elevator reservation and moving-truck rules',
  'Drive the commute at rush hour; visit at night',
  'Look up school ratings and walkability for the neighborhood',
  'Take photos/video of existing damage at move-in',
];
