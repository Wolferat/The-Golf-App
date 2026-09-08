-- Golfolio functional launch: player photo contributions
-- Run once in Supabase SQL Editor after 12-social-foundation-migration.sql

create table if not exists public.listing_photo_contributions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  caption text check (char_length(caption) <= 300),
  source_classification text not null default 'player_contribution'
    check (source_classification in ('player_contribution')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'removed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, contributor_id, storage_path)
);

create index if not exists listing_photo_contributions_listing_idx
  on public.listing_photo_contributions (listing_id, status, created_at desc);

alter table public.listing_photo_contributions enable row level security;

create policy "contributors read own photo contributions"
  on public.listing_photo_contributions for select to authenticated
  using (auth.uid() = contributor_id);

create policy "contributors insert own photo contributions"
  on public.listing_photo_contributions for insert to authenticated
  with check (auth.uid() = contributor_id and status = 'pending');

create policy "admins read all photo contributions"
  on public.listing_photo_contributions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select, insert on table public.listing_photo_contributions to authenticated;
grant all on table public.listing_photo_contributions to service_role;

-- Separate private bucket for player contributions (distinct from review-photos and venue-imports).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-contributions',
  'player-contributions',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage policies: contributors upload/read own objects; admins/service role manage all.
drop policy if exists "contributors upload own contribution photos" on storage.objects;
create policy "contributors upload own contribution photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-contributions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "contributors read own contribution photos" on storage.objects;
create policy "contributors read own contribution photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'player-contributions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admins read contribution photos" on storage.objects;
create policy "admins read contribution photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'player-contributions'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

comment on table public.listing_photo_contributions is
  'Player-submitted venue photos distinct from review-attached photos and official venue_photos. No automatic publication or cover promotion.';
