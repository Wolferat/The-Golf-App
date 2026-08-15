-- Golfolio user settings
-- Run this once in the Supabase SQL Editor.
-- Stores notification, location, and listing preferences per signed-in user.
-- Does NOT store precise location history.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_nearby_events boolean not null default true,
  notify_followed_activity boolean not null default true,
  notify_product_updates boolean not null default false,
  use_location boolean not null default false,
  nearby_radius_miles integer not null default 15
    check (nearby_radius_miles between 1 and 100),
  show_tournaments boolean not null default true,
  show_courses boolean not null default true,
  show_training boolean not null default true,
  show_simulators boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "users read own settings" on public.user_settings;
create policy "users read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own settings" on public.user_settings;
create policy "users insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own settings" on public.user_settings;
create policy "users update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_user_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute procedure public.touch_user_settings_updated_at();
