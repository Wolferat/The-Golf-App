-- Golfolio Sherman beta listing area
-- Additive. Run once in the Supabase SQL Editor after listing-control-migration.sql.
-- Does not publish listings. Does not delete data. Does not enable an AI cron.
--
-- Temporary beta geofence: 30-mile radius centered on Sherman, Texas.
-- Admins can later change the label, coordinates, and radius in Company Settings.

alter table public.app_settings
  add column if not exists beta_area_label text,
  add column if not exists beta_area_latitude double precision,
  add column if not exists beta_area_longitude double precision,
  add column if not exists beta_area_radius_miles integer;

update public.app_settings
set
  beta_area_label = coalesce(nullif(beta_area_label, ''), 'Sherman, Texas'),
  beta_area_latitude = coalesce(beta_area_latitude, 33.6357),
  beta_area_longitude = coalesce(beta_area_longitude, -96.6089),
  beta_area_radius_miles = coalesce(beta_area_radius_miles, 30),
  launch_boundary_name = case
    when launch_boundary_name is null
      or launch_boundary_name = ''
      or launch_boundary_name = 'DFW launch boundary'
    then 'Sherman beta area'
    else launch_boundary_name
  end,
  launch_description = case
    when launch_description is null
      or launch_description = ''
      or launch_description ilike '%Weatherford%'
      or launch_description ilike '%Royse City%'
    then 'Temporary Golfolio beta area: a 30-mile radius centered on Sherman, Texas. Admins can change the center and radius in Company Settings as beta users travel.'
    else launch_description
  end,
  updated_at = now()
where id = true;

alter table public.app_settings
  drop constraint if exists app_settings_beta_area_latitude_check;
alter table public.app_settings
  add constraint app_settings_beta_area_latitude_check
  check (beta_area_latitude is null or (beta_area_latitude between -90 and 90));

alter table public.app_settings
  drop constraint if exists app_settings_beta_area_longitude_check;
alter table public.app_settings
  add constraint app_settings_beta_area_longitude_check
  check (beta_area_longitude is null or (beta_area_longitude between -180 and 180));

alter table public.app_settings
  drop constraint if exists app_settings_beta_area_radius_miles_check;
alter table public.app_settings
  add constraint app_settings_beta_area_radius_miles_check
  check (beta_area_radius_miles is null or (beta_area_radius_miles between 1 and 250));
