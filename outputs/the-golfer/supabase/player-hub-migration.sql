-- Golfolio player hub: run this once in the Supabase SQL Editor.
-- It adds player stats, personal round history, and player connections.

alter table public.profiles add column if not exists bio text check (char_length(bio) <= 280);
alter table public.profiles add column if not exists home_course text check (char_length(home_course) <= 120);
alter table public.profiles add column if not exists city text check (char_length(city) <= 80);
alter table public.profiles add column if not exists handicap numeric(4,1) check (handicap between -10 and 54);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  course_name text not null check (char_length(course_name) <= 160),
  played_on date not null default current_date,
  holes smallint not null default 18 check (holes in (9,18)),
  score smallint not null check (score between 20 and 200),
  par smallint check (par between 27 and 90),
  putts smallint check (putts between 0 and 100),
  fairways_hit smallint check (fairways_hit between 0 and 18),
  greens_hit smallint check (greens_hit between 0 and 18),
  notes text check (char_length(notes) <= 500),
  visibility text not null default 'private' check (visibility in ('private','connections','public')),
  created_at timestamptz not null default now()
);

create index if not exists rounds_player_date_idx on public.rounds(player_id, played_on desc);

create table if not exists public.player_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.rounds enable row level security;
alter table public.player_follows enable row level security;

create policy "players manage own rounds" on public.rounds
  for all using (auth.uid() = player_id) with check (auth.uid() = player_id);
create policy "public rounds are readable" on public.rounds
  for select using (visibility = 'public');
create policy "players manage own follows" on public.player_follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- These indexes support the player finder without exposing phone numbers or email addresses.
create index if not exists profiles_username_idx on public.profiles(username);

