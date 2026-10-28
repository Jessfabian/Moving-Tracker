export type ID = string;

export interface BaseRow {
  id: ID;
  household_id: string;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
  deleted?: boolean;
}

export interface MediaRef {
  id: string;
  /** Local URI (file://, data:, blob:) usable for display on this device. */
  uri?: string | null;
  /** Path inside the Supabase `media` bucket once uploaded. */
  remotePath?: string | null;
  mime?: string;
  name?: string;
}

export type SalesToBudget = 'none' | 'sold' | 'pending' | 'listed';

export type HomeTenure = 'own' | 'rent' | 'other';

export interface Move extends BaseRow {
  title: string;
  from_address: string;
  from_city: string;
  from_state: string;
  from_zip: string;
  to_address: string;
  to_city: string;
  to_state: string;
  to_zip: string;
  move_date: string | null;
  pack_date: string | null;
  load_date: string | null;
  delivery_date: string | null;
  distance_miles: number | null;
  from_tenure: HomeTenure;
  to_tenure: HomeTenure;
  moving_method: 'full_service' | 'self_pack' | 'rental_truck' | 'container' | 'undecided';
  /** Someone travels ahead (new job, house hunting) — turns on the Trip section. */
  work_trip?: boolean;
  /** Which sale money counts toward the moving budget. */
  sales_to_budget?: SalesToBudget;
  /** Important places at the destination (work, school…) used to measure distance from rentals. */
  places: Place[];
  notes: string;
}

export interface Place {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  /** The place distances are measured to by default. */
  primary?: boolean;
}

export type Relationship = 'self' | 'spouse' | 'partner' | 'child' | 'parent' | 'grandparent' | 'sibling' | 'other';

export interface FamilyMember extends BaseRow {
  name: string;
  relationship: Relationship;
  birth_date: string | null;
  age: number | null;
  phone: string;
  email: string;
  drives: boolean;
  employed: boolean;
  employer: string;
  works_remote: boolean;
  school_name: string;
  grade: string;
  special_needs: string;
  medical_conditions: string;
  medications: string;
  allergies: string;
  doctors: string;
  insurance: string;
  dietary: string;
  activities: string;
  notes: string;
}

export interface Pet extends BaseRow {
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'fish' | 'reptile' | 'small_mammal' | 'horse' | 'other';
  breed: string;
  birth_date: string | null;
  weight: number | null;
  vet_name: string;
  vet_phone: string;
  microchip: string;
  vaccinations_current: boolean;
  medications: string;
  travel_method: 'car' | 'air_cabin' | 'air_cargo' | 'pet_transport' | 'undecided';
  notes: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped';
export type Priority = 'low' | 'medium' | 'high';

export interface Task extends BaseRow {
  title: string;
  description: string;
  category: TaskCategory;
  due_date: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee_id: ID | null;
  member_id: ID | null;
  pet_id: ID | null;
  source: 'template' | 'tailored' | 'custom';
  rule_key: string | null;
  notes: string;
}

export type TaskCategory =
  | 'planning'
  | 'paperwork'
  | 'movers'
  | 'packing'
  | 'family'
  | 'kids'
  | 'health'
  | 'pets'
  | 'utilities'
  | 'address'
  | 'finance'
  | 'vehicles'
  | 'home'
  | 'moving_day'
  | 'after_move';

export interface DocumentRow extends BaseRow {
  title: string;
  doc_type: string;
  folder: string;
  member_id: ID | null;
  status: 'needed' | 'requested' | 'received' | 'filed';
  expires_on: string | null;
  files: MediaRef[];
  notes: string;
}

export interface MoverQuote extends BaseRow {
  company: string;
  contact_name: string;
  phone: string;
  email: string;
  website: string;
  usdot: string;
  mc_number: string;
  quote_type: 'binding' | 'non_binding' | 'binding_not_to_exceed' | 'indicative';
  price: number | null;
  deposit: number | null;
  valuation: 'released' | 'full_value' | 'third_party';
  coverage_amount: number | null;
  estimated_weight_lbs: number | null;
  pickup_window: string;
  delivery_window: string;
  includes_packing: boolean;
  includes_storage: boolean;
  survey_type: 'in_home' | 'virtual' | 'none';
  rating: number | null;
  status: 'requested' | 'received' | 'accepted' | 'rejected';
  files: MediaRef[];
  notes: string;
}

export interface Room extends BaseRow {
  name: string;
  level: string;
  destination_room: string;
  color: string;
  sort: number;
  notes: string;
}

export type BoxStatus = 'empty' | 'packing' | 'packed' | 'loaded' | 'delivered' | 'unpacked';

export interface Box extends BaseRow {
  number: number;
  label: string;
  room_id: ID | null;
  destination_room: string;
  status: BoxStatus;
  fragile: boolean;
  open_first: boolean;
  weight_lbs: number | null;
  contents: string;
  notes: string;
}

export type Disposition = 'move' | 'sell' | 'donate' | 'give' | 'trash' | 'store' | 'undecided';
export type SaleStatus = 'not_listed' | 'listed' | 'pending' | 'sold';

export interface Item extends BaseRow {
  name: string;
  room_id: ID | null;
  box_id: ID | null;
  category: string;
  quantity: number;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  est_value: number | null;
  disposition: Disposition;
  sale_price: number | null;
  sale_status: SaleStatus;
  barcode: string;
  brand: string;
  model: string;
  description: string;
  image_url: string;
  /** New/retail price found when the barcode was looked up. */
  retail_price: number | null;
  /** When it was bought — older things resell for less. */
  purchase_date: string | null;
  /** What was actually paid (used when there's no retail price). */
  purchase_price: number | null;
  /** Shopping / product page it came from. */
  product_url: string;
  fragile: boolean;
  /** Riding with us in the car — left off the mover inventory and size estimate. */
  in_car?: boolean;
  /** Actual weight of one, if known (otherwise a typical weight for the category is used). */
  weight_lbs?: number | null;
  /** "L x W x H" in inches, if measured. */
  dims_in?: string;
  photos: MediaRef[];
  notes: string;
}

export type ApartmentStatus = 'researching' | 'contacted' | 'tour_scheduled' | 'toured' | 'applied' | 'approved' | 'signed' | 'rejected';

export interface Apartment extends BaseRow {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  listing_url: string;
  contact_name: string;
  phone: string;
  email: string;
  status: ApartmentStatus;
  home_type: 'apartment' | 'condo' | 'townhouse' | 'house' | 'other';
  tour_date: string | null;
  available_date: string | null;
  application_deadline: string | null;
  rent: number | null;
  deposit: number | null;
  application_fee: number | null;
  admin_fee: number | null;
  broker_fee: number | null;
  pet_deposit: number | null;
  pet_rent: number | null;
  parking_fee: number | null;
  utilities_est: number | null;
  other_monthly: number | null;
  move_in_special: string;
  lease_months: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  floor: string;
  laundry: 'in_unit' | 'in_building' | 'none' | 'unknown';
  parking: 'garage' | 'assigned' | 'street' | 'none' | 'unknown';
  pets_allowed: boolean;
  amenities: string[];
  commute_minutes: number | null;
  school_district: string;
  neighborhood: string;
  pros: string;
  cons: string;
  rating: number | null;
  photos: MediaRef[];
  /** Remote photo URLs pulled from the listing website. */
  image_urls: string[];
  latitude: number | null;
  longitude: number | null;
  /** Address string the coordinates were computed from; re-geocode when the address changes. */
  geocoded_address: string;
  notes: string;
}

export type Frequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly';

export type BillStatus = 'active' | 'cancel_before_move' | 'transfer' | 'new_after_move';

export interface Bill extends BaseRow {
  name: string;
  category: string;
  amount: number | null;
  frequency: Frequency;
  due_day: number | null;
  autopay: boolean;
  status: BillStatus;
  payer_id: ID | null;
  website: string;
  notes: string;
}

export interface Income extends BaseRow {
  source: string;
  member_id: ID | null;
  kind: 'salary' | 'hourly' | 'self_employment' | 'benefits' | 'support' | 'investment' | 'other';
  amount: number | null;
  frequency: Frequency;
  basis: 'net' | 'gross';
  status: 'current' | 'ending' | 'new_job';
  start_date: string | null;
  end_date: string | null;
  notes: string;
}

export type AppointmentKind = 'tour' | 'movers' | 'utility' | 'medical' | 'school' | 'work' | 'closing' | 'inspection' | 'travel' | 'government' | 'other';

export interface Appointment extends BaseRow {
  title: string;
  kind: AppointmentKind;
  date: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  member_ids: ID[];
  with_whom: string;
  phone: string;
  status: 'scheduled' | 'done' | 'cancelled';
  reminder: boolean;
  notes: string;
}

export interface Book extends BaseRow {
  isbn: string;
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  published: string;
  pages: number | null;
  cover_url: string;
  subjects: string[];
  genre: string;
  condition: 'new' | 'like_new' | 'very_good' | 'good' | 'acceptable' | 'poor';
  disposition: Disposition;
  owner_member_id: ID | null;
  room_id: ID | null;
  box_id: ID | null;
  est_value: number | null;
  sale_price: number | null;
  sale_status: SaleStatus;
  format: string;
  /** Weighed (or estimated) weight in ounces, used for Media Mail postage. */
  weight_oz: number | null;
  /** Original cover / list price, used to estimate a used market price. */
  list_price: number | null;
  sale_channel: string;
  sale_id: ID | null;
  /** Your own photos (condition, signed copy, cover when there's no online image). */
  photos: MediaRef[];
  notes: string;
}

export type BookSaleStatus = 'pending' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'picked_up' | 'cancelled';

/** A sale of one or more books to a buyer, including shipping details. */
export interface BookSale extends BaseRow {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  ship_address: string;
  ship_city: string;
  ship_state: string;
  ship_zip: string;
  channel: string;
  order_ref: string;
  book_ids: ID[];
  price: number | null;
  shipping_charged: number | null;
  fees: number | null;
  postage: number | null;
  packaging: string;
  weight_oz: number | null;
  tracking: string;
  status: BookSaleStatus;
  sale_date: string | null;
  ship_date: string | null;
  notes: string;
}

export interface Expense extends BaseRow {
  title: string;
  category: string;
  estimated: number | null;
  actual: number | null;
  paid: boolean;
  paid_by: string;
  date: string | null;
  receipts: MediaRef[];
  notes: string;
}

export interface Fund extends BaseRow {
  source: string;
  kind: string;
  amount: number | null;
  /** Estimated amount actually received after taxes / penalties. Null = estimate automatically. */
  net_amount: number | null;
  /** State whose income tax applies (2-letter). Empty = the state you are moving to. */
  tax_state?: string;
  /** Employer pays the tax for you (grossed-up) so the full amount lands. */
  grossed_up?: boolean;
  expected_date: string | null;
  received: boolean;
  member_id: ID | null;
  files: MediaRef[];
  notes: string;
}

/** One leg of a work / house-hunting trip: a flight, hotel stay, rental car, meals… */
export interface TravelItem extends BaseRow {
  kind: 'flight' | 'lodging' | 'car' | 'ground' | 'meals' | 'other';
  title: string;
  trip: string;
  member_id: ID | null;
  provider: string;
  confirmation: string;
  /** 2-letter airline code (DL, AA, WN…) for flights. */
  airline?: string;
  flight_number?: string;
  seat?: string;
  aircraft?: string;
  /** Regional partner that actually flies it (SkyWest, Republic…) — trackers use its callsign. */
  operated_by?: string;
  /** Frequent-flyer miles / points spent on this item. */
  miles_used?: number | null;
  /** What those miles are worth in dollars. Blank = estimate from the airline's typical value. */
  miles_value?: number | null;
  /** Pay ourselves back for the miles out of the stipend too. */
  recover_miles?: boolean;
  start_date: string | null;
  start_time: string;
  end_date: string | null;
  end_time: string;
  origin: string;
  destination: string;
  address: string;
  cost: number | null;
  paid: boolean;
  paid_with: string;
  reimbursable: boolean;
  reimbursed: boolean;
  files: MediaRef[];
  notes: string;
}

export interface Utility extends BaseRow {
  utility_type: string;
  location: 'old' | 'new';
  provider: string;
  account_number: string;
  phone: string;
  website: string;
  action_date: string | null;
  status: 'todo' | 'scheduled' | 'done';
  notes: string;
}

export interface AddressChange extends BaseRow {
  organization: string;
  category: string;
  member_id: ID | null;
  method: string;
  status: 'todo' | 'done' | 'not_needed';
  done_date: string | null;
  notes: string;
}

export interface Contact extends BaseRow {
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
}

export interface Activity extends BaseRow {
  entity: TableName;
  entity_id: ID;
  action: 'created' | 'updated' | 'deleted';
  label: string;
  actor: string;
}

export interface TableMap {
  moves: Move;
  family_members: FamilyMember;
  pets: Pet;
  tasks: Task;
  documents: DocumentRow;
  quotes: MoverQuote;
  apartments: Apartment;
  rooms: Room;
  boxes: Box;
  items: Item;
  books: Book;
  book_sales: BookSale;
  expenses: Expense;
  funds: Fund;
  travel: TravelItem;
  utilities: Utility;
  bills: Bill;
  appointments: Appointment;
  incomes: Income;
  address_changes: AddressChange;
  contacts: Contact;
  activity: Activity;
}

export type TableName = keyof TableMap;

export const TABLES: TableName[] = [
  'moves',
  'family_members',
  'pets',
  'tasks',
  'documents',
  'quotes',
  'apartments',
  'rooms',
  'boxes',
  'items',
  'books',
  'book_sales',
  'expenses',
  'funds',
  'travel',
  'utilities',
  'appointments',
  'bills',
  'incomes',
  'address_changes',
  'contacts',
  'activity',
];

export type NewRow<T extends TableName> = Partial<Omit<TableMap[T], keyof BaseRow>> & { id?: ID };
