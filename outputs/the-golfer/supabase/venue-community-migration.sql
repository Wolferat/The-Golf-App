-- RUN THIS FILE IN SUPABASE SQL EDITOR:
--   outputs/the-golfer/supabase/venue-community-migration.sql
--
-- Golfolio venue community: player reviews, official venue photos, and rounds.listing_id
-- Run once in the Supabase SQL Editor after sherman-beta-area-migration.sql.
-- Do not run from the app, a cron, a deployment, or this coding agent.
--
-- This does NOT publish reviews or photos. Everything starts pending until an admin approves it.
-- This does NOT add an AI cron. Official photo search is admin-button only.

-- ---------------------------------------------------------------------------
-- 1. Player reviews of permanent places (course / simulator)
-- Optional single attached photo lives in Storage; this table stores the path
-- and independent photo moderation status.
-- ---------------------------------------------------------------------------

create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 80),
  body text not null check (char_length(body) between 8 and 2000),
  visited_on date,
  photo_path text,
  photo_status text check (photo_status is null or photo_status in ('pending','approved','rejected')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  photo_reviewed_by uuid references public.profiles(id),
  photo_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, player_id)
);

create index if not exists listing_reviews_listing_status_idx
  on public.listing_reviews (listing_id, status, created_at desc);
create index if not exists listing_reviews_player_idx
  on public.listing_reviews (player_id, created_at desc);
create index if not exists listing_reviews_pending_idx
  on public.listing_reviews (status, created_at desc)
  where status = 'pending';

create or replace function public.touch_listing_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists listing_reviews_set_updated_at on public.listing_reviews;
create trigger listing_reviews_set_updated_at
  before update on public.listing_reviews
  for each row execute procedure public.touch_listing_reviews_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Official venue photos (remote URLs only — never re-hosted files)
-- ---------------------------------------------------------------------------

create table if not exists public.venue_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  image_url text not null,
  source_url text not null,
  source_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, image_url)
);

create index if not exists venue_photos_listing_status_idx
  on public.venue_photos (listing_id, status, created_at desc);
create index if not exists venue_photos_pending_idx
  on public.venue_photos (status, created_at desc)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Optional listing link on player rounds
-- ---------------------------------------------------------------------------

alter table public.rounds
  add column if not exists listing_id uuid references public.listings(id) on delete set null;

create index if not exists rounds_listing_player_idx
  on public.rounds (listing_id, player_id, played_on desc)
  where listing_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- Server APIs still verify the user (or admin role) and then use the service
-- role. These policies are the safety net if a browser client hits PostgREST.
-- ---------------------------------------------------------------------------

alter table public.listing_reviews enable row level security;
alter table public.venue_photos enable row level security;

drop policy if exists "public read approved listing reviews" on public.listing_reviews;
create policy "public read approved listing reviews"
  on public.listing_reviews for select
  using (status = 'approved');

drop policy if exists "players read own listing reviews" on public.listing_reviews;
create policy "players read own listing reviews"
  on public.listing_reviews for select
  using (auth.uid() = player_id);

drop policy if exists "players insert own listing reviews" on public.listing_reviews;
create policy "players insert own listing reviews"
  on public.listing_reviews for insert
  with check (
    auth.uid() = player_id
    and status = 'pending'
    and (photo_status is null or photo_status = 'pending')
  );

drop policy if exists "players update own listing reviews" on public.listing_reviews;
create policy "players update own listing reviews"
  on public.listing_reviews for update
  using (auth.uid() = player_id)
  with check (
    auth.uid() = player_id
    and status = 'pending'
    and (photo_status is null or photo_status in ('pending','rejected'))
  );

drop policy if exists "players delete own listing reviews" on public.listing_reviews;
create policy "players delete own listing reviews"
  on public.listing_reviews for delete
  using (auth.uid() = player_id);

drop policy if exists "public read approved venue photos" on public.venue_photos;
create policy "public read approved venue photos"
  on public.venue_photos for select
  using (status = 'approved');

-- No player insert/update/delete on venue_photos. Admins use the service role
-- after /api/venue-photos verifies profiles.role = 'admin'.

drop policy if exists "admins read all listing reviews" on public.listing_reviews;
create policy "admins read all listing reviews"
  on public.listing_reviews for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "admins read all venue photos" on public.venue_photos;
create policy "admins read all venue photos"
  on public.venue_photos for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Reviews are only allowed on approved permanent places.
create or replace function public.enforce_reviewable_listing()
returns trigger language plpgsql as $$
declare
  listing_kind text;
  listing_status text;
begin
  select kind, status into listing_kind, listing_status
  from public.listings
  where id = new.listing_id;
  if listing_kind is null or listing_kind not in ('course', 'simulator') or listing_status <> 'approved' then
    raise exception 'Reviews are only allowed on approved course or simulator listings';
  end if;
  return new;
end;
$$;

drop trigger if exists listing_reviews_enforce_place on public.listing_reviews;
create trigger listing_reviews_enforce_place
  before insert or update of listing_id on public.listing_reviews
  for each row execute procedure public.enforce_reviewable_listing();

create or replace function public.enforce_round_listing_place()
returns trigger language plpgsql as $$
declare
  listing_kind text;
begin
  if new.listing_id is null then
    return new;
  end if;
  select kind into listing_kind from public.listings where id = new.listing_id;
  if listing_kind is null or listing_kind not in ('course', 'simulator') then
    raise exception 'Rounds can only be linked to course or simulator listings';
  end if;
  return new;
end;
$$;

drop trigger if exists rounds_enforce_place on public.rounds;
create trigger rounds_enforce_place
  before insert or update of listing_id on public.rounds
  for each row execute procedure public.enforce_round_listing_place();

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for the optional single review photo
-- Private bucket. The browser never receives the service-role key.
-- Uploads go through /api/reviews (server-side). Public pages receive a
-- short-lived signed URL only for approved review photos (or the owner's own).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Deny direct browser writes. Service role bypasses these policies.
drop policy if exists "players read own review photos" on storage.objects;
create policy "players read own review photos"
  on storage.objects for select
  using (
    bucket_id = 'review-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- If storage.buckets insert is not permitted in the SQL Editor, create the
-- bucket in Dashboard → Storage:
--   name: review-photos
--   public: OFF
--   file size limit: 2 MB
--   allowed MIME types: image/jpeg, image/png, image/webp
-- Then re-run the storage policy statements above.
