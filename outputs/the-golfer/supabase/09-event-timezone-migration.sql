-- Golfolio functional launch: event timezone support
-- Run once in Supabase SQL Editor after signed-in-data-gate-migration.sql

alter table public.listings
  add column if not exists event_timezone text not null default 'America/Chicago';

alter table public.listings
  add column if not exists starts_at_date_only boolean not null default false;

alter table public.listings
  add column if not exists ends_at_date_only boolean not null default false;

comment on column public.listings.event_timezone is
  'IANA timezone for event display and date-only expiration. Default America/Chicago for launch catalog.';

update public.listings
set event_timezone = 'America/Chicago'
where event_timezone is null or trim(event_timezone) = '';

-- Preserve existing instants; mark date-only rows where time is midnight UTC with no sub-day precision in source.
update public.listings
set starts_at_date_only = true
where starts_at is not null
  and starts_at::text ~ 'T00:00:00'
  and kind in ('tournament', 'training', 'simulator', 'charity', 'corporate');

update public.listings
set ends_at_date_only = true
where ends_at is not null
  and ends_at::text ~ 'T00:00:00'
  and kind in ('tournament', 'training', 'simulator', 'charity', 'corporate');
