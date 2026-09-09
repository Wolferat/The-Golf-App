-- Golfolio functional launch: account lifecycle and moderation evidence
-- Run once in Supabase SQL Editor after 13-photo-contributions-migration.sql

alter table public.app_settings
  add column if not exists moderation_evidence_retention_days integer,
  add column if not exists account_deletion_enabled boolean not null default false;

comment on column public.app_settings.moderation_evidence_retention_days is
  'Owner must set before production activation. Null means deletion flow retains evidence only in test configuration. Purge job uses this value when set.';

comment on column public.app_settings.account_deletion_enabled is
  'Owner gate for self-service account deletion. Keep false until retention policy is decided and tested.';

create table if not exists public.moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid,
  subject_username text,
  report_id uuid references public.player_reports(id) on delete set null,
  category text not null check (char_length(category) <= 80),
  summary text not null check (char_length(summary) <= 2000),
  content_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  purge_after timestamptz
);

create index if not exists moderation_evidence_purge_idx
  on public.moderation_evidence (purge_after)
  where purge_after is not null;

alter table public.moderation_evidence enable row level security;

-- No authenticated read policies: evidence is service-role only.
grant all on table public.moderation_evidence to service_role;

comment on table public.moderation_evidence is
  'Restricted operational moderation evidence without email/phone copies. Retention duration is configurable via app_settings.moderation_evidence_retention_days. Not publicly accessible.';

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  failure_reason text
);

alter table public.account_deletion_requests enable row level security;

create policy "players read own deletion requests"
  on public.account_deletion_requests for select to authenticated
  using (auth.uid() = user_id);

grant select on table public.account_deletion_requests to authenticated;
grant all on table public.account_deletion_requests to service_role;
