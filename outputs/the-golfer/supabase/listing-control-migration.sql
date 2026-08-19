-- Golfolio listing control, AI proposals, and event expiration
-- Run once in the Supabase SQL Editor after company-settings-migration.sql.
-- Public users still only see approved listings. AI proposals are admin-only.

-- Company AI operating permissions (no auto-publish / no AI delete).
alter table public.app_settings
  add column if not exists ai_manual_search_enabled boolean not null default false,
  add column if not exists ai_research_enabled boolean not null default false,
  add column if not exists auto_expire_events_enabled boolean not null default true;

update public.app_settings
set
  ai_manual_search_enabled = coalesce(ai_manual_search_enabled, false),
  ai_research_enabled = coalesce(ai_research_enabled, false),
  auto_expire_events_enabled = coalesce(auto_expire_events_enabled, true),
  pending_queue_max = least(greatest(coalesce(pending_queue_max, 25), 1), 25),
  admin_approval_required = true,
  review_mode = 'admin',
  updated_at = now()
where id = true;

-- Listing kinds and statuses.
alter table public.listings drop constraint if exists listings_kind_check;
alter table public.listings
  add constraint listings_kind_check
  check (kind in ('tournament','course','training','simulator','charity','corporate'));

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('pending','approved','rejected','expired','archived','deleted'));

alter table public.listings
  add column if not exists description text,
  add column if not exists venue_name text,
  add column if not exists official_website text,
  add column if not exists registration_url text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists ends_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists expire_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists reviews jsonb not null default '[]'::jsonb,
  add column if not exists field_sources jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_listings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
  before update on public.listings
  for each row execute procedure public.touch_listings_updated_at();

-- Private AI search / enrichment proposals.
create table if not exists public.listing_proposals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  kind text not null check (kind in ('search','enrichment')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied')),
  query text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz
);

-- Audit trail for admin and AI-assisted listing actions.
create table if not exists public.listing_audit (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  proposal_id uuid references public.listing_proposals(id) on delete set null,
  action text not null,
  actor_id uuid references public.profiles(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.listings enable row level security;
alter table public.listing_proposals enable row level security;
alter table public.listing_audit enable row level security;

drop policy if exists "public approved listings" on public.listings;
create policy "public approved listings"
  on public.listings for select
  using (status = 'approved');

-- No public policies on proposals or audit. Server APIs use the service role
-- after verifying profiles.role = 'admin'.

-- ---------------------------------------------------------------------------
-- Assign the first admin manually (do not run automatically):
--   update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
-- ---------------------------------------------------------------------------
