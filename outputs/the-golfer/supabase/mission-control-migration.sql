-- Mission Control + privacy fields. Run once in Supabase SQL Editor.

alter table public.profiles add column if not exists state text check (char_length(state) <= 2);
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('player','organizer','admin'));

alter table public.app_settings add column if not exists geofence_west double precision default -97.95;
alter table public.app_settings add column if not exists geofence_east double precision default -96.25;
alter table public.app_settings add column if not exists geofence_south double precision default 32.15;
alter table public.app_settings add column if not exists geofence_north double precision default 33.45;
alter table public.app_settings add column if not exists proximity_miles integer default 15 check (proximity_miles between 1 and 100);

update public.app_settings set
  geofence_west = coalesce(geofence_west, -97.95),
  geofence_east = coalesce(geofence_east, -96.25),
  geofence_south = coalesce(geofence_south, 32.15),
  geofence_north = coalesce(geofence_north, 33.45),
  proximity_miles = coalesce(proximity_miles, 15)
where id = true;
