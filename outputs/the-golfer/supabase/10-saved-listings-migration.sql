-- Golfolio functional launch: saved listings
-- Run once in Supabase SQL Editor after 09-event-timezone-migration.sql

create table if not exists public.saved_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists saved_listings_user_created_idx
  on public.saved_listings (user_id, created_at desc);

alter table public.saved_listings enable row level security;

create policy "players manage own saved listings"
  on public.saved_listings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, delete on table public.saved_listings to authenticated;
grant all on table public.saved_listings to service_role;

comment on table public.saved_listings is
  'Player-owned bookmarks. Does not require social eligibility. Targets may be deleted or archived; APIs must handle missing listings gracefully.';
