-- Suorita tämä kokonaisuudessaan Supabasen SQL Editorissa.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'driver' check (role in ('admin','dispatcher','driver')),
  created_at timestamptz not null default now()
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  ride_date date not null,
  ride_time time not null,
  customer text not null,
  phone text,
  pickup text not null,
  destination text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,email,full_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1))) on conflict do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists rides_updated_at on public.rides;
create trigger rides_updated_at before update on public.rides for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.rides enable row level security;

grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.rides to authenticated;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "own profile editable" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update to authenticated using (public.current_user_role()='admin') with check (public.current_user_role()='admin');
drop policy if exists "rides readable" on public.rides;
create policy "rides readable" on public.rides for select to authenticated using (true);
drop policy if exists "dispatchers create rides" on public.rides;
create policy "dispatchers create rides" on public.rides for insert to authenticated with check (public.current_user_role() in ('admin','dispatcher'));
drop policy if exists "dispatchers update rides" on public.rides;
create policy "dispatchers update rides" on public.rides for update to authenticated using (public.current_user_role() in ('admin','dispatcher')) with check (public.current_user_role() in ('admin','dispatcher'));
drop policy if exists "dispatchers delete rides" on public.rides;
create policy "dispatchers delete rides" on public.rides for delete to authenticated using (public.current_user_role() in ('admin','dispatcher'));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rides') then
    alter publication supabase_realtime add table public.rides;
  end if;
end $$;

-- Kun olet luonut oman tunnuksesi, tee siitä ylläpitäjä vaihtamalla sähköposti:
-- update public.profiles set role='admin' where email='oma@osoite.fi';
