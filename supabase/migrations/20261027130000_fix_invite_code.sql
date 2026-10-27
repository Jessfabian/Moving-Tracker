-- ONLY for databases already set up with an older 20261027000000_init.sql. Safe to run more than once.
-- New project? Run 20261027000000_init.sql instead - it already includes everything below.
do $$
begin
  if to_regclass('public.households') is null then
    raise exception 'Moving Tracker tables are not set up yet. Run supabase/migrations/20261027000000_init.sql (the full setup script) instead of this file.';
  end if;
end $$;

-- 1) "function gen_random_bytes(integer) does not exist" when creating a move on Supabase.
-- Supabase installs pgcrypto in the "extensions" schema, which create_household() (search_path = public)
-- can't see. gen_random_uuid() is built into Postgres, so the invite code no longer needs pgcrypto.
alter table public.households
  alter column invite_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- 2) Explicit API access (newer Supabase projects don't auto-grant new tables to signed-in users).
-- Row Level Security still limits every row to members of the household.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.create_household(text, text), public.join_household(text, text),
  public.is_household_member(uuid), public.can_edit_household(uuid) to authenticated;