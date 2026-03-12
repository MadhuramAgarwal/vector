-- =============================================
-- 004: Pre-dispatch flow + AI conversations
-- Run in Supabase SQL Editor after 003
-- =============================================

create table if not exists public.fleet_availability (
  id                uuid default gen_random_uuid() primary key,
  driver_id         uuid references public.users(id),
  trader_id         uuid references public.users(id),
  truck_number      text not null,
  truck_capacity_mt numeric default 24,
  available_date    date not null,
  declared_at       timestamp with time zone default now(),
  status            text default 'available'
                      check (status in ('available','assigned','dispatched','completed','cancelled')),
  notes             text
);

create table if not exists public.dispatch_batches (
  id                uuid default gen_random_uuid() primary key,
  trader_id         uuid references public.users(id),
  supplier_id       uuid references public.users(id),
  dispatch_date     date not null,
  total_trucks      integer,
  total_capacity_mt numeric,
  status            text default 'active'
                      check (status in ('active','completed','cancelled')),
  notes             text,
  created_at        timestamp with time zone default now()
);

create table if not exists public.dispatch_trucks (
  id           uuid default gen_random_uuid() primary key,
  batch_id     uuid references public.dispatch_batches(id),
  fleet_id     uuid references public.fleet_availability(id),
  driver_id    uuid references public.users(id),
  truck_number text,
  capacity_mt  numeric,
  buyer_id     uuid references public.users(id),
  trip_id      uuid references public.trips(id),
  assigned_at  timestamp with time zone,
  status       text default 'heading_to_stockyard'
                 check (status in ('heading_to_stockyard','at_stockyard','loading','loaded','in_transit','delivered','unassigned_alert'))
);

create table if not exists public.buyer_demand (
  id               uuid default gen_random_uuid() primary key,
  trader_id        uuid references public.users(id),
  buyer_id         uuid references public.users(id),
  demand_date      date not null,
  trucks_requested integer,
  trucks_assigned  integer default 0,
  material_type    text default 'Sand',
  notes            text,
  created_at       timestamp with time zone default now()
);

create table if not exists public.ai_conversations (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.users(id),
  user_role  text,
  type       text,
  prompt     text,
  response   text,
  metadata   jsonb,
  created_at timestamp with time zone default now()
);

alter table public.fleet_availability  enable row level security;
alter table public.dispatch_batches    enable row level security;
alter table public.dispatch_trucks     enable row level security;
alter table public.buyer_demand        enable row level security;
alter table public.ai_conversations    enable row level security;

create policy "Allow all for now" on public.fleet_availability  for all using (true);
create policy "Allow all for now" on public.dispatch_batches    for all using (true);
create policy "Allow all for now" on public.dispatch_trucks     for all using (true);
create policy "Allow all for now" on public.buyer_demand        for all using (true);
create policy "Allow all for now" on public.ai_conversations    for all using (true);
