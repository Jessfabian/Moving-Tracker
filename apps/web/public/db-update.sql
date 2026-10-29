-- ONE-TIME CATCH-UP for Moving Tracker. Safe to run more than once.
-- Supabase -> your project -> SQL Editor -> New query -> paste ALL of this -> Run.
-- Adds everything newer versions of the app need: subscriptions, bill due dates / last paid / account,
-- item purchase date / price / link, and book photos.

do $$
begin
  if to_regclass('public.households') is null then
    raise exception 'Moving Tracker tables are not set up yet. Run supabase/migrations/20261027000000_init.sql first.';
  end if;
end $$;

-- An older copy of a row (for example one re-sent by a phone) must never overwrite a newer edit.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;
-- Item purchase info and book photos
alter table public.items add column if not exists purchase_date date;
alter table public.items add column if not exists purchase_price numeric;
alter table public.items add column if not exists product_url text not null default '';
alter table public.books add column if not exists photos jsonb not null default '[]';
notify pgrst, 'reload schema';

-- Subscription manager + more detailed bills (next due date, last paid, account number).

create table if not exists public.subscriptions (
  name text not null default '', service text not null default '', category text not null default 'other',
  amount numeric, frequency text not null default 'monthly', next_due date, status text not null default 'active',
  source text not null default 'manual', payer_id text, account_email text not null default '', pay_method text not null default '',
  cancel_url text not null default '', remind boolean not null default true, last_charged date, cancelled_on date,
  notes text not null default ''
);

alter table public.bills add column if not exists next_due date;
alter table public.bills add column if not exists last_paid date;
alter table public.bills add column if not exists account text not null default '';

do $$
declare t text := 'subscriptions';
begin
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
end $$;

grant select, insert, update, delete on public.subscriptions to authenticated;

notify pgrst, 'reload schema';
