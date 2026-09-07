-- RUN THIS FILE IN SUPABASE SQL EDITOR:
--   outputs/the-golfer/supabase/signed-in-data-gate-migration.sql
--
-- Signed-in data gate for Golfolio.
-- Run once after venue-community-migration.sql.
-- Do not run from the app, a cron, a deployment, or this coding agent.
--
-- Anonymous clients that know SUPABASE_URL and the public anon key must not
-- be able to read approved listings, reviews, venue photos, or public rounds
-- through PostgREST. Signed-in players still read approved public-facing rows.
-- Owners keep their own private/pending rows. Admins and the service role
-- keep existing access. RLS stays enabled. Nothing is published.

-- ---------------------------------------------------------------------------
-- 1. Keep RLS on and drop anonymous public-read policies
-- ---------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.listing_reviews enable row level security;
alter table public.venue_photos enable row level security;
alter table public.rounds enable row level security;

drop policy if exists "public approved listings" on public.listings;
drop policy if exists "authenticated read approved listings" on public.listings;

drop policy if exists "public read approved listing reviews" on public.listing_reviews;
drop policy if exists "authenticated read approved listing reviews" on public.listing_reviews;

drop policy if exists "public read approved venue photos" on public.venue_photos;
drop policy if exists "authenticated read approved venue photos" on public.venue_photos;

drop policy if exists "public rounds are readable" on public.rounds;
drop policy if exists "authenticated read public rounds" on public.rounds;

-- ---------------------------------------------------------------------------
-- 2. Approved public-facing rows require a signed-in session
-- ---------------------------------------------------------------------------

create policy "authenticated read approved listings"
  on public.listings for select
  to authenticated
  using (status = 'approved' and auth.role() = 'authenticated');

create policy "authenticated read approved listing reviews"
  on public.listing_reviews for select
  to authenticated
  using (status = 'approved' and auth.role() = 'authenticated');

create policy "authenticated read approved venue photos"
  on public.venue_photos for select
  to authenticated
  using (status = 'approved' and auth.role() = 'authenticated');

create policy "authenticated read public rounds"
  on public.rounds for select
  to authenticated
  using (visibility = 'public' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 3. Preserve owner access to private / pending rows
-- ---------------------------------------------------------------------------

drop policy if exists "players read own listing reviews" on public.listing_reviews;
create policy "players read own listing reviews"
  on public.listing_reviews for select
  to authenticated
  using (auth.uid() = player_id);

drop policy if exists "players insert own listing reviews" on public.listing_reviews;
create policy "players insert own listing reviews"
  on public.listing_reviews for insert
  to authenticated
  with check (
    auth.uid() = player_id
    and status = 'pending'
    and (photo_status is null or photo_status = 'pending')
  );

drop policy if exists "players update own listing reviews" on public.listing_reviews;
create policy "players update own listing reviews"
  on public.listing_reviews for update
  to authenticated
  using (auth.uid() = player_id)
  with check (
    auth.uid() = player_id
    and status = 'pending'
    and (photo_status is null or photo_status in ('pending','rejected'))
  );

drop policy if exists "players delete own listing reviews" on public.listing_reviews;
create policy "players delete own listing reviews"
  on public.listing_reviews for delete
  to authenticated
  using (auth.uid() = player_id);

drop policy if exists "players manage own rounds" on public.rounds;
create policy "players manage own rounds"
  on public.rounds
  for all
  to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

-- ---------------------------------------------------------------------------
-- 4. Preserve admin read access (service role still bypasses RLS)
-- ---------------------------------------------------------------------------

drop policy if exists "admins read all listing reviews" on public.listing_reviews;
create policy "admins read all listing reviews"
  on public.listing_reviews for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "admins read all venue photos" on public.venue_photos;
create policy "admins read all venue photos"
  on public.venue_photos for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------------
-- 5. Table grants: anon cannot select; authenticated players still can
-- ---------------------------------------------------------------------------

revoke all on table public.listings from anon;
revoke all on table public.listing_reviews from anon;
revoke all on table public.venue_photos from anon;
revoke all on table public.rounds from anon;

grant select on table public.listings to authenticated;
grant select, insert, update, delete on table public.listing_reviews to authenticated;
grant select on table public.venue_photos to authenticated;
grant select, insert, update, delete on table public.rounds to authenticated;

grant all on table public.listings to service_role;
grant all on table public.listing_reviews to service_role;
grant all on table public.venue_photos to service_role;
grant all on table public.rounds to service_role;
