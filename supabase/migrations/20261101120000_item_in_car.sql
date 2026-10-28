-- "Coming with us in our car" flag on inventory items (left off the mover inventory).
-- Safe to re-run. Paste into Supabase → SQL Editor → Run.
alter table public.items add column if not exists in_car boolean not null default false;
notify pgrst, 'reload schema';
