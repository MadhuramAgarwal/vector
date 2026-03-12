-- ============================================================
-- SandX Platform — Database Schema (Email OTP version)
-- Run this in the Supabase SQL Editor to set up all tables
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- DROP existing tables (clean slate)
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.trip_status_log cascade;
drop table if exists public.trips          cascade;
drop table if exists public.orders         cascade;
drop table if exists public.drivers        cascade;
drop table if exists public.suppliers      cascade;
drop table if exists public.buyers         cascade;
drop table if exists public.traders        cascade;
drop table if exists public.users          cascade;

-- ============================================================
-- USERS (mirrors auth.users, stores role + profile)
-- ============================================================
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  role        text not null check (role in ('buyer', 'trader', 'supplier', 'driver', 'admin')),
  full_name   text,
  created_at  timestamptz default now()
);

-- ============================================================
-- TRADERS
-- ============================================================
create table public.traders (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid unique not null references public.users(id) on delete cascade,
  company     text,
  created_at  timestamptz default now()
);

-- ============================================================
-- BUYERS  (RMC plant owners)
-- ============================================================
create table public.buyers (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid unique not null references public.users(id) on delete cascade,
  plant_name  text,
  location    text,
  created_at  timestamptz default now()
);

-- ============================================================
-- SUPPLIERS  (stockyard owners)
-- ============================================================
create table public.suppliers (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid unique not null references public.users(id) on delete cascade,
  yard_name   text,
  location    text,
  stock_tons  numeric default 0,
  created_at  timestamptz default now()
);

-- ============================================================
-- DRIVERS  (truck operators)
-- ============================================================
create table public.drivers (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique not null references public.users(id) on delete cascade,
  vehicle_number  text,
  vehicle_type    text,
  is_available    boolean default true,
  created_at      timestamptz default now()
);

-- ============================================================
-- ORDERS
-- ============================================================
create table public.orders (
  id                uuid primary key default uuid_generate_v4(),
  buyer_id          uuid not null references public.buyers(id),
  supplier_id       uuid references public.suppliers(id),
  trader_id         uuid references public.traders(id),
  quantity_tons     numeric not null,
  rate_per_ton      numeric,
  total_amount      numeric,
  status            text not null default 'pending'
                      check (status in ('pending', 'confirmed', 'in_transit', 'delivered', 'cancelled')),
  payment_status    text default 'unpaid'
                      check (payment_status in ('unpaid', 'partial', 'paid')),
  razorpay_order_id text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ============================================================
-- TRIPS
-- ============================================================
create table public.trips (
  id             uuid primary key default uuid_generate_v4(),
  order_id       uuid not null references public.orders(id),
  driver_id      uuid not null references public.drivers(id),
  vehicle_number text,
  load_tons      numeric,
  status         text not null default 'assigned'
                   check (status in ('assigned', 'loading', 'in_transit', 'delivered')),
  started_at     timestamptz,
  delivered_at   timestamptz,
  created_at     timestamptz default now()
);

-- ============================================================
-- TRIP STATUS LOG  (full audit trail)
-- ============================================================
create table public.trip_status_log (
  id        uuid primary key default uuid_generate_v4(),
  trip_id   uuid not null references public.trips(id) on delete cascade,
  status    text not null,
  note      text,
  logged_by uuid references public.users(id),
  logged_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.users           enable row level security;
alter table public.traders         enable row level security;
alter table public.buyers          enable row level security;
alter table public.suppliers       enable row level security;
alter table public.drivers         enable row level security;
alter table public.orders          enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_status_log enable row level security;

-- Users: own row
create policy "users: own row" on public.users
  for all using (auth.uid() = id);

-- Role profile tables: own row
create policy "traders: own row" on public.traders
  for all using (auth.uid() = user_id);

create policy "buyers: own row" on public.buyers
  for all using (auth.uid() = user_id);

create policy "suppliers: own row" on public.suppliers
  for all using (auth.uid() = user_id);

create policy "drivers: own row" on public.drivers
  for all using (auth.uid() = user_id);

-- Orders: buyer / supplier / trader involved + admin
create policy "orders: involved parties" on public.orders
  for select using (
    buyer_id    in (select id from public.buyers    where user_id = auth.uid()) or
    supplier_id in (select id from public.suppliers where user_id = auth.uid()) or
    trader_id   in (select id from public.traders   where user_id = auth.uid()) or
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Trips: driver + buyer + admin
create policy "trips: involved parties" on public.trips
  for select using (
    driver_id in (select id from public.drivers where user_id = auth.uid()) or
    order_id  in (
      select o.id from public.orders o
      join public.buyers b on b.id = o.buyer_id
      where b.user_id = auth.uid()
    ) or
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

create policy "trip_log: involved parties" on public.trip_status_log
  for select using (
    logged_by = auth.uid() or
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- FUNCTION + TRIGGER: auto-create user profile after sign-in
-- Role comes from raw_user_meta_data set during signInWithOtp
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'buyer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
