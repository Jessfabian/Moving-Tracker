-- Moving Tracker schema: households shared by family members, one row per entity,
-- Row Level Security by household membership, photo storage, and realtime sync.

create extension if not exists pgcrypto;

-- ---------- Households & membership ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hid and user_id = auth.uid());
$$;

create or replace function public.can_edit_household(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hid and user_id = auth.uid() and role in ('owner', 'editor'));
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select using (public.is_household_member(id));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update using (
  exists (select 1 from public.household_members m where m.household_id = id and m.user_id = auth.uid() and m.role = 'owner')
);

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select using (public.is_household_member(household_id));
drop policy if exists members_update_self on public.household_members;
create policy members_update_self on public.household_members for update using (user_id = auth.uid());
drop policy if exists members_owner_manage on public.household_members;
create policy members_owner_manage on public.household_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.household_members m where m.household_id = household_members.household_id and m.user_id = auth.uid() and m.role = 'owner')
);

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into households (name, created_by) values (coalesce(nullif(p_name, ''), 'Our move'), auth.uid()) returning id into hid;
  insert into household_members (household_id, user_id, display_name, role) values (hid, auth.uid(), p_display_name, 'owner');
  return hid;
end $$;

create or replace function public.join_household(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into hid from households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'Invalid invite code'; end if;
  insert into household_members (household_id, user_id, display_name, role)
  values (hid, auth.uid(), p_display_name, 'editor')
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return hid;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ---------- Entity tables ----------
-- Common columns: id, household_id, created_at/updated_at (client ISO strings, used for
-- last-write-wins), updated_by, deleted (soft delete for sync), server_updated_at (pull cursor).

create table if not exists public.moves (
  title text not null default '',
  from_address text not null default '', from_city text not null default '', from_state text not null default '', from_zip text not null default '',
  to_address text not null default '', to_city text not null default '', to_state text not null default '', to_zip text not null default '',
  move_date date, pack_date date, load_date date, delivery_date date,
  distance_miles numeric, from_tenure text not null default 'own', to_tenure text not null default 'own',
  moving_method text not null default 'undecided', sales_to_budget text not null default 'sold', work_trip boolean not null default false, places jsonb not null default '[]', notes text not null default ''
);

create table if not exists public.family_members (
  name text not null default '', relationship text not null default 'other', birth_date date, age integer,
  phone text not null default '', email text not null default '',
  drives boolean not null default false, employed boolean not null default false, employer text not null default '', works_remote boolean not null default false,
  school_name text not null default '', grade text not null default '', special_needs text not null default '',
  medical_conditions text not null default '', medications text not null default '', allergies text not null default '',
  doctors text not null default '', insurance text not null default '', dietary text not null default '', activities text not null default '',
  notes text not null default ''
);

create table if not exists public.pets (
  name text not null default '', species text not null default 'dog', breed text not null default '', birth_date date, weight numeric,
  vet_name text not null default '', vet_phone text not null default '', microchip text not null default '',
  vaccinations_current boolean not null default false, medications text not null default '',
  travel_method text not null default 'undecided', notes text not null default ''
);

create table if not exists public.tasks (
  title text not null default '', description text not null default '', category text not null default 'planning', due_date date,
  status text not null default 'todo', priority text not null default 'medium',
  assignee_id text, member_id text, pet_id text, source text not null default 'custom', rule_key text, notes text not null default ''
);

create table if not exists public.documents (
  title text not null default '', doc_type text not null default 'other', member_id text, status text not null default 'needed',
  expires_on date, files jsonb not null default '[]', notes text not null default ''
);

create table if not exists public.quotes (
  company text not null default '', contact_name text not null default '', phone text not null default '', email text not null default '',
  website text not null default '', usdot text not null default '', mc_number text not null default '',
  quote_type text not null default 'binding', price numeric, deposit numeric, valuation text not null default 'released',
  coverage_amount numeric, estimated_weight_lbs numeric, pickup_window text not null default '', delivery_window text not null default '',
  includes_packing boolean not null default false, includes_storage boolean not null default false,
  survey_type text not null default 'virtual', rating integer, status text not null default 'requested',
  files jsonb not null default '[]', notes text not null default ''
);

create table if not exists public.apartments (
  name text not null default '', address text not null default '', city text not null default '', state text not null default '',
  zip text not null default '', listing_url text not null default '', contact_name text not null default '', phone text not null default '',
  email text not null default '', status text not null default 'researching', home_type text not null default 'apartment',
  tour_date date, available_date date, application_deadline date,
  rent numeric, deposit numeric, application_fee numeric, admin_fee numeric, broker_fee numeric, pet_deposit numeric, pet_rent numeric,
  parking_fee numeric, utilities_est numeric, other_monthly numeric, move_in_special text not null default '', lease_months integer,
  bedrooms numeric, bathrooms numeric, sqft numeric, floor text not null default '', laundry text not null default 'unknown',
  parking text not null default 'unknown', pets_allowed boolean not null default false, amenities jsonb not null default '[]',
  commute_minutes integer, school_district text not null default '', neighborhood text not null default '',
  pros text not null default '', cons text not null default '', rating integer, photos jsonb not null default '[]', image_urls jsonb not null default '[]',
  latitude double precision, longitude double precision, geocoded_address text not null default '', notes text not null default ''
);

create table if not exists public.appointments (
  title text not null default '', kind text not null default 'other', date date, start_time text not null default '', end_time text not null default '',
  all_day boolean not null default false, location text not null default '', member_ids jsonb not null default '[]', with_whom text not null default '',
  phone text not null default '', status text not null default 'scheduled', reminder boolean not null default true, notes text not null default ''
);

create table if not exists public.bills (
  name text not null default '', category text not null default 'utilities', amount numeric, frequency text not null default 'monthly',
  due_day integer, autopay boolean not null default false, status text not null default 'active', payer_id text, website text not null default '', notes text not null default ''
);

create table if not exists public.incomes (
  source text not null default '', member_id text, kind text not null default 'salary', amount numeric, frequency text not null default 'monthly',
  basis text not null default 'net', status text not null default 'current', start_date date, end_date date, notes text not null default ''
);

create table if not exists public.rooms (  name text not null default '', level text not null default '', destination_room text not null default '',
  color text not null default '#3b82f6', sort integer not null default 0, notes text not null default ''
);

create table if not exists public.boxes (
  number integer not null default 0, label text not null default '', room_id text, destination_room text not null default '',
  status text not null default 'packing', fragile boolean not null default false, open_first boolean not null default false,
  weight_lbs numeric, contents text not null default '', notes text not null default ''
);

create table if not exists public.items (
  name text not null default '', room_id text, box_id text, category text not null default 'other', quantity integer not null default 1,
  condition text not null default 'good', est_value numeric, disposition text not null default 'undecided',
  sale_price numeric, sale_status text not null default 'not_listed', barcode text not null default '', brand text not null default '',
  model text not null default '', description text not null default '', image_url text not null default '', retail_price numeric,
  fragile boolean not null default false, photos jsonb not null default '[]', notes text not null default ''
);

create table if not exists public.books (
  isbn text not null default '', title text not null default '', subtitle text not null default '', authors jsonb not null default '[]',
  publisher text not null default '', published text not null default '', pages integer, cover_url text not null default '',
  subjects jsonb not null default '[]', genre text not null default 'other', condition text not null default 'good',
  disposition text not null default 'undecided', owner_member_id text, room_id text, box_id text,
  est_value numeric, sale_price numeric, sale_status text not null default 'not_listed', notes text not null default ''
);

alter table public.books add column if not exists format text not null default 'paperback';
alter table public.books add column if not exists weight_oz numeric;
alter table public.books add column if not exists list_price numeric;
alter table public.books add column if not exists sale_channel text not null default '';
alter table public.books add column if not exists sale_id text;
alter table public.items add column if not exists purchase_date date;
alter table public.items add column if not exists purchase_price numeric;
alter table public.items add column if not exists product_url text not null default '';
alter table public.items add column if not exists in_car boolean not null default false;
alter table public.items add column if not exists weight_lbs numeric;
alter table public.items add column if not exists dims_in text not null default '';
alter table public.books add column if not exists photos jsonb not null default '[]';

create table if not exists public.book_sales (
  buyer_name text not null default '', buyer_email text not null default '', buyer_phone text not null default '',
  ship_address text not null default '', ship_city text not null default '', ship_state text not null default '', ship_zip text not null default '',
  channel text not null default 'pango', order_ref text not null default '', book_ids jsonb not null default '[]', price numeric,
  shipping_charged numeric, fees numeric, postage numeric, packaging text not null default '', weight_oz numeric,
  tracking text not null default '', status text not null default 'pending', sale_date date, ship_date date, notes text not null default ''
);

create table if not exists public.expenses (
  title text not null default '', category text not null default 'other', estimated numeric, actual numeric,
  paid boolean not null default false, paid_by text not null default '', date date, receipts jsonb not null default '[]', notes text not null default ''
);

create table if not exists public.funds (
  source text not null default '', kind text not null default 'savings', amount numeric, net_amount numeric,
  tax_state text not null default '', grossed_up boolean not null default false, expected_date date, received boolean not null default false, member_id text, files jsonb not null default '[]', notes text not null default ''
);

create table if not exists public.travel (
  kind text not null default 'flight', title text not null default '', trip text not null default '', member_id text,
  provider text not null default '', confirmation text not null default '', airline text not null default '', flight_number text not null default '',
  seat text not null default '', aircraft text not null default '', operated_by text not null default '', miles_used numeric, miles_value numeric, recover_miles boolean not null default true, start_date date, start_time text not null default '',
  end_date date, end_time text not null default '', origin text not null default '', destination text not null default '',
  address text not null default '', cost numeric, paid boolean not null default false, paid_with text not null default '',
  reimbursable boolean not null default true, reimbursed boolean not null default false, files jsonb not null default '[]',
  notes text not null default ''
);

alter table public.documents add column if not exists folder text not null default 'other';

create table if not exists public.utilities (
  utility_type text not null default '', location text not null default 'old', provider text not null default '',
  account_number text not null default '', phone text not null default '', website text not null default '',
  action_date date, status text not null default 'todo', notes text not null default ''
);

create table if not exists public.address_changes (
  organization text not null default '', category text not null default 'other', member_id text, method text not null default '',
  status text not null default 'todo', done_date date, notes text not null default ''
);

create table if not exists public.contacts (
  name text not null default '', role text not null default 'other', company text not null default '',
  phone text not null default '', email text not null default '', notes text not null default ''
);

create table if not exists public.activity (
  entity text not null default '', entity_id text not null default '', action text not null default 'created',
  label text not null default '', actor text not null default ''
);

create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  -- An older copy of a row (for example one re-sent by a phone) must never overwrite a newer edit.
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['moves','family_members','pets','tasks','documents','quotes','apartments','rooms','boxes','items','books','book_sales','expenses','funds','travel','utilities','appointments','bills','incomes','address_changes','contacts','activity']
  loop
    execute format('alter table public.%I add column if not exists id uuid primary key', t);
    execute format('alter table public.%I add column if not exists household_id uuid not null references public.households(id) on delete cascade', t);
    execute format('alter table public.%I add column if not exists created_at text not null default to_char(now() at time zone ''utc'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'')', t);
    execute format('alter table public.%I add column if not exists updated_at text not null default to_char(now() at time zone ''utc'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'')', t);
    execute format('alter table public.%I add column if not exists updated_by text', t);
    execute format('alter table public.%I add column if not exists deleted boolean not null default false', t);
    execute format('alter table public.%I add column if not exists server_updated_at timestamptz not null default clock_timestamp()', t);
    execute format('create index if not exists %I on public.%I (household_id, server_updated_at)', t || '_sync_idx', t);

    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format('create trigger touch_%I before insert or update on public.%I for each row execute function public.touch_server_updated_at()', t, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.is_household_member(household_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.can_edit_household(household_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using (public.can_edit_household(household_id))', t || '_delete', t);

    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;

-- ---------- Storage for photos, scans, receipts ----------
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select
  using (bucket_id = 'media' and public.is_household_member(((storage.foldername(name))[1])::uuid));
drop policy if exists media_write on storage.objects;
create policy media_write on storage.objects for insert
  with check (bucket_id = 'media' and public.can_edit_household(((storage.foldername(name))[1])::uuid));
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update
  using (bucket_id = 'media' and public.can_edit_household(((storage.foldername(name))[1])::uuid));
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete
  using (bucket_id = 'media' and public.can_edit_household(((storage.foldername(name))[1])::uuid));

-- Explicit API access (newer Supabase projects don't auto-grant new tables to signed-in users).
-- Row Level Security above still limits every row to members of the household.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.create_household(text, text), public.join_household(text, text),
  public.is_household_member(uuid), public.can_edit_household(uuid) to authenticated;