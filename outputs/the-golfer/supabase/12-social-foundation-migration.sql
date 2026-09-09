-- Golfolio functional launch: social foundation
-- Run once in Supabase SQL Editor after 11-private-rounds-migration.sql

alter table public.app_settings
  add column if not exists social_features_enabled boolean not null default false,
  add column if not exists social_eligibility_policy_version text not null default '2026-09-adult-self-attestation-v1',
  add column if not exists player_support_email text,
  add column if not exists player_support_url text,
  add column if not exists community_standards_url text,
  add column if not exists safety_help_url text;

comment on column public.app_settings.social_features_enabled is
  'Owner-controlled gate. Keep false until policy review and functional tests pass.';

alter table public.profiles
  add column if not exists social_eligibility_status text not null default 'unknown'
    check (social_eligibility_status in ('unknown', 'eligible', 'ineligible')),
  add column if not exists social_attestation_at timestamptz,
  add column if not exists social_attestation_policy_version text;

comment on column public.profiles.social_eligibility_status is
  'Adult-only self-attestation state. unknown = must complete gate before social discovery/requests/invites.';

-- Preserve historical follows without converting to friendships.
alter table public.player_follows
  add column if not exists legacy_inactive boolean not null default false;

update public.player_follows
set legacy_inactive = true;

comment on table public.player_follows is
  'Legacy one-way follows preserved as inactive historical data. New social graph uses player_friendships.';

create table if not exists public.player_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists player_friendships_pair_idx
  on public.player_friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index if not exists player_friendships_requester_idx
  on public.player_friendships (requester_id, status, created_at desc);

create index if not exists player_friendships_addressee_idx
  on public.player_friendships (addressee_id, status, created_at desc);

create table if not exists public.player_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reported_listing_id uuid references public.listings(id) on delete set null,
  category text not null check (char_length(category) <= 80),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    reported_user_id is not null
    or reported_listing_id is not null
  )
);

create index if not exists player_reports_status_idx
  on public.player_reports (status, created_at desc);

alter table public.player_friendships enable row level security;
alter table public.player_blocks enable row level security;
alter table public.player_reports enable row level security;

create policy "players read own friendships"
  on public.player_friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy "players insert friendship requests"
  on public.player_friendships for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

create policy "players respond to friendship requests"
  on public.player_friendships for update to authenticated
  using (auth.uid() in (requester_id, addressee_id))
  with check (auth.uid() in (requester_id, addressee_id));

create policy "players manage own blocks"
  on public.player_blocks for all to authenticated
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

create policy "players manage own reports"
  on public.player_reports for all to authenticated
  using (auth.uid() = reporter_id)
  with check (auth.uid() = reporter_id);

create policy "admins read all reports"
  on public.player_reports for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select, insert, update on table public.player_friendships to authenticated;
grant select, insert, delete on table public.player_blocks to authenticated;
grant select, insert, update on table public.player_reports to authenticated;
grant all on table public.player_friendships to service_role;
grant all on table public.player_blocks to service_role;
grant all on table public.player_reports to service_role;
