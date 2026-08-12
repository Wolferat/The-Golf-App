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
