-- Golfolio functional launch: private rounds only
-- Run once in Supabase SQL Editor after 10-saved-listings-migration.sql

-- One-time privacy migration: all existing rounds become owner-only.
update public.rounds
set visibility = 'private'
where visibility is distinct from 'private';

alter table public.profiles
  add column if not exists rounds_privacy_notice_seen_at timestamptz;

comment on column public.profiles.rounds_privacy_notice_seen_at is
  'Timestamp when the player acknowledged the one-time rounds privacy change notice.';

-- Remove public/connections round reads for this release.
drop policy if exists "public rounds are readable" on public.rounds;
drop policy if exists "authenticated read public rounds" on public.rounds;

-- Owner-only access enforced at database layer.
drop policy if exists "players manage own rounds" on public.rounds;
create policy "players manage own rounds"
  on public.rounds
  for all
  to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id and visibility = 'private');

-- Service role retains full access for admin operations and account deletion cleanup.
