-- Actual weight and size on inventory items (used for the mover PDF and box packing).
-- Safe to re-run. Paste into Supabase → SQL Editor → Run.
alter table public.items add column if not exists weight_lbs numeric;
alter table public.items add column if not exists dims_in text not null default '';
notify pgrst, 'reload schema';
