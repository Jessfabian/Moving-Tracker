-- Item purchase date / price / shopping link (resale estimates) and photos on books.
-- Safe to re-run. Paste into Supabase → SQL Editor → Run.
alter table public.items add column if not exists purchase_date date;
alter table public.items add column if not exists purchase_price numeric;
alter table public.items add column if not exists product_url text not null default '';
alter table public.books add column if not exists photos jsonb not null default '[]';
notify pgrst, 'reload schema';
