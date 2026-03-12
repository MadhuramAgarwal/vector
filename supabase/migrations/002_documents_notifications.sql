-- =============================================
-- 002: Documents, Challans, Notifications
-- Run this in Supabase SQL Editor
-- =============================================

-- Royalty passes (uploaded by driver before journey)
create table if not exists public.royalty_passes (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  driver_id     uuid not null references public.users(id),
  image_url     text not null,
  extracted     jsonb,          -- Gemini extraction result
  created_at    timestamptz default now()
);

-- Weight slips (uploaded by driver at weighbridge)
create table if not exists public.weight_slips (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  driver_id     uuid not null references public.users(id),
  image_url     text not null,
  wb1_weight    numeric,        -- tare weight (truck empty)
  wb2_weight    numeric,        -- gross weight (truck loaded)
  net_weight    numeric,        -- computed: wb2 - wb1
  extracted     jsonb,          -- Gemini extraction result
  created_at    timestamptz default now()
);

-- Challans (generated after delivery confirmed)
create table if not exists public.challans (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  order_id        uuid not null references public.orders(id) on delete cascade,
  pdf_url         text,         -- Supabase Storage URL
  net_weight      numeric,
  material_type   text,
  delivery_address text,
  buyer_confirmed boolean default false,
  trader_approved boolean default false,
  buyer_confirmed_at  timestamptz,
  trader_approved_at  timestamptz,
  created_at      timestamptz default now()
);

-- Notifications
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  type        text not null,   -- 'challan_ready' | 'challan_confirmed' | 'challan_approved' | 'reminder' | 'escalation'
  ref_id      uuid,            -- challan_id or order_id
  read        boolean default false,
  created_at  timestamptz default now()
);

-- =============================================
-- RLS (open for development)
-- =============================================

alter table public.royalty_passes  enable row level security;
alter table public.weight_slips    enable row level security;
alter table public.challans        enable row level security;
alter table public.notifications   enable row level security;

create policy "royalty_passes: all for auth"  on public.royalty_passes  for all using (auth.uid() is not null);
create policy "weight_slips: all for auth"    on public.weight_slips    for all using (auth.uid() is not null);
create policy "challans: all for auth"        on public.challans        for all using (auth.uid() is not null);
create policy "notifications: own"            on public.notifications   for all using (auth.uid() = user_id);

-- =============================================
-- Storage buckets
-- =============================================

insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', true),
  ('challans',  'challans',  true)
on conflict (id) do nothing;

create policy "documents: upload auth"  on storage.objects for insert with check (bucket_id = 'documents' and auth.uid() is not null);
create policy "documents: read public"  on storage.objects for select using (bucket_id = 'documents');
create policy "challans: upload auth"   on storage.objects for insert with check (bucket_id = 'challans'  and auth.uid() is not null);
create policy "challans: read public"   on storage.objects for select using (bucket_id = 'challans');

-- =============================================
-- Add trader_id to orders if not present
-- =============================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'orders' and column_name = 'trader_id'
  ) then
    alter table public.orders add column trader_id uuid references public.users(id);
  end if;
end $$;
