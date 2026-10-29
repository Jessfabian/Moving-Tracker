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

notify pgrst, 'reload schema';
