-- Drop existing orders/trips tables (old schema used separate role tables)
drop table if exists public.trip_status_log cascade;
drop table if exists public.trips          cascade;
drop table if exists public.orders         cascade;

-- ORDERS
create table public.orders (
  id                   uuid default gen_random_uuid() primary key,
  buyer_id             uuid references public.users(id),
  trader_id            uuid references public.users(id),
  material_type        text default 'Ordinary Sand',
  quantity_mt          numeric not null,
  delivery_address     text not null,
  delivery_lat         numeric,
  delivery_lng         numeric,
  scheduled_date       date not null,
  status               text default 'pending'
                         check (status in ('pending','confirmed','in_progress','completed','cancelled')),
  total_price          numeric,
  special_instructions text,
  created_at           timestamp with time zone default now()
);

-- TRIPS
create table public.trips (
  id           uuid default gen_random_uuid() primary key,
  order_id     uuid references public.orders(id),
  trip_number  integer default 1,
  supplier_id  uuid references public.users(id),
  driver_id    uuid references public.users(id),
  quantity_mt  numeric,
  status       text default 'pending'
                 check (status in ('pending','confirmed','loading','loaded','in_transit','delivered','cancelled')),
  created_at   timestamp with time zone default now()
);

-- TRIP STATUS LOG
create table public.trip_status_log (
  id         uuid default gen_random_uuid() primary key,
  trip_id    uuid references public.trips(id),
  status     text,
  updated_by uuid references public.users(id),
  notes      text,
  timestamp  timestamp with time zone default now()
);

-- RLS (open for now — tighten before production)
alter table public.orders          enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_status_log enable row level security;

create policy "Allow all for now" on public.orders          for all using (true);
create policy "Allow all for now" on public.trips           for all using (true);
create policy "Allow all for now" on public.trip_status_log for all using (true);
