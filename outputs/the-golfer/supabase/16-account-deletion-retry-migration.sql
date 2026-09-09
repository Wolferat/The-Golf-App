-- Golfolio functional launch: persisted deletion cleanup state
-- Run once in Supabase SQL Editor after 15-social-moderation-completion-migration.sql

alter table public.account_deletion_requests
  add column if not exists pending_storage_objects jsonb not null default '[]'::jsonb;

comment on column public.account_deletion_requests.pending_storage_objects is
  'Exact private storage objects captured before owned-data cleanup. Server-side retry uses this list after auth access is removed.';
