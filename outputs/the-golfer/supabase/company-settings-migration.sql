-- Golfolio company settings expansion
-- Run once in the Supabase SQL Editor.
-- Extends the existing single-row public.app_settings record.
-- Do NOT create a second company settings table.

alter table public.app_settings
  add column if not exists launch_description text,
  add column if not exists location_radius_default integer not null default 15,
  add column if not exists launch_enabled boolean not null default true,
  add column if not exists discovery_enabled boolean not null default false,
  add column if not exists admin_approval_required boolean not null default true,
  add column if not exists pending_queue_max integer not null default 25,
  add column if not exists community_submissions_enabled boolean not null default false,
  add column if not exists ops_admin_emails text,
  add column if not exists notify_listing_entered_queue boolean not null default true,
  add column if not exists notify_queue_at_max boolean not null default true,
  add column if not exists support_message text,
  add column if not exists privacy_guidelines text;

-- Keep the single company row present.
insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

-- Sensible defaults for existing installs.
update public.app_settings
set
  launch_description = coalesce(
    launch_description,
    'Golfolio starts from just west of Weatherford to just east of Royse City, from just south of Midlothian to just below the Oklahoma border.'
  ),
  location_radius_default = coalesce(location_radius_default, 15),
  launch_enabled = coalesce(launch_enabled, true),
  discovery_enabled = coalesce(discovery_enabled, false),
  admin_approval_required = coalesce(admin_approval_required, true),
  pending_queue_max = coalesce(pending_queue_max, 25),
  community_submissions_enabled = coalesce(community_submissions_enabled, false),
  notify_listing_entered_queue = coalesce(notify_listing_entered_queue, true),
  notify_queue_at_max = coalesce(notify_queue_at_max, true),
  company_name = coalesce(nullif(company_name, ''), 'Golfolio'),
  launch_boundary_name = coalesce(nullif(launch_boundary_name, ''), 'DFW launch boundary'),
  updated_at = now()
where id = true;

alter table public.app_settings
  drop constraint if exists app_settings_location_radius_default_check;
alter table public.app_settings
  add constraint app_settings_location_radius_default_check
  check (location_radius_default between 1 and 100);

alter table public.app_settings
  drop constraint if exists app_settings_pending_queue_max_check;
alter table public.app_settings
  add constraint app_settings_pending_queue_max_check
  check (pending_queue_max between 1 and 200);

alter table public.app_settings enable row level security;

-- No public policies: browser clients never read/write this table directly.
-- Server APIs use the service role after verifying profiles.role = 'admin'.

-- ---------------------------------------------------------------------------
-- Assign the first admin manually in Supabase (do not run automatically):
--   update public.profiles
--   set role = 'admin'
--   where username = 'YOUR_USERNAME';
-- ---------------------------------------------------------------------------
