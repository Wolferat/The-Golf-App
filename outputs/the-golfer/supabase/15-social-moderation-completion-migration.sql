-- Golfolio functional launch completion: invitations, moderation actions, rate events, restrictions
-- Run once in Supabase SQL Editor after 14-account-lifecycle-migration.sql

alter table public.profiles
  add column if not exists account_restricted boolean not null default false,
  add column if not exists account_restriction_reason text,
  add column if not exists account_restricted_at timestamptz;

comment on column public.profiles.account_restricted is
  'When true, social participation is blocked. Reporting and blocking remain available to other users.';

create table if not exists public.player_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists player_invitations_inviter_idx
  on public.player_invitations (inviter_id, status, created_at desc);

create table if not exists public.social_rate_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (char_length(event_type) <= 80),
  created_at timestamptz not null default now()
);

create index if not exists social_rate_events_user_type_idx
  on public.social_rate_events (user_id, event_type, created_at desc);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.player_reports(id) on delete set null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (char_length(action) <= 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_report_idx
  on public.moderation_actions (report_id, created_at desc);

alter table public.player_invitations enable row level security;
alter table public.social_rate_events enable row level security;
alter table public.moderation_actions enable row level security;

create policy "players manage own invitations"
  on public.player_invitations for all to authenticated
  using (auth.uid() = inviter_id)
  with check (auth.uid() = inviter_id);

create policy "players read own rate events"
  on public.social_rate_events for select to authenticated
  using (auth.uid() = user_id);

create policy "admins read moderation actions"
  on public.moderation_actions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select, insert, update on table public.player_invitations to authenticated;
grant select, insert on table public.social_rate_events to authenticated;
grant select on table public.moderation_actions to authenticated;
grant all on table public.player_invitations to service_role;
grant all on table public.social_rate_events to service_role;
grant all on table public.moderation_actions to service_role;

-- Admins update reports and account restrictions through service role APIs.

alter table public.player_reports
  add column if not exists assigned_admin_id uuid references public.profiles(id) on delete set null,
  add column if not exists resolution_note text;

alter table public.account_deletion_requests
  add column if not exists cleanup_completed_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists steps jsonb not null default '[]'::jsonb;

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_status_check;
alter table public.account_deletion_requests
  add constraint account_deletion_requests_status_check
  check (status in ('pending', 'processing', 'cleanup_pending', 'completed', 'failed'));
