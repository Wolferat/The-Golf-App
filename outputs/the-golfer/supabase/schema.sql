create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_-]{3,24}$'),
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('tournament','course','training','simulator')),
  city text,
  starts_at timestamptz,
  price_note text,
  source_url text not null unique,
  source_name text,
  latitude double precision,
  longitude double precision,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  discovered_by text not null default 'ai' check (discovered_by in ('ai','community','admin')),
  discovery_notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
create policy "public approved listings" on public.listings for select using (status = 'approved');
create policy "players see own profile" on public.profiles for select using (auth.uid() = id);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar text;
create policy "players update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Golfolio',
  support_email text,
  launch_boundary_name text not null default 'DFW launch boundary',
  review_mode text not null default 'admin' check (review_mode in ('admin','community')),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data->>'username');
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- After creating your own account, promote it once in the Supabase SQL Editor:
-- update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
