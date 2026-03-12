-- ============================================================
-- RUN THIS ENTIRE FILE IN SUPABASE SQL EDITOR (one paste)
-- Supabase Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- TABLE: fleet_availability
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

                                        -- TABLE: dispatch_batches
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

                                                                                -- TABLE: dispatch_trucks
                                                                                create table if not exists public.dispatch_trucks (
                                                                                  id              uuid default gen_random_uuid() primary key,
                                                                                    batch_id        uuid references public.dispatch_batches(id),
                                                                                      fleet_id        uuid references public.fleet_availability(id),
                                                                                        driver_id       uuid references public.users(id),
                                                                                          truck_number    text,
                                                                                            capacity_mt     numeric,
                                                                                              buyer_id        uuid references public.users(id),
                                                                                                trip_id         uuid references public.trips(id),
                                                                                                  assigned_at     timestamp with time zone,
                                                                                                    status          text default 'heading_to_stockyard'
                                                                                                                        check (status in ('heading_to_stockyard','at_stockyard','loading','loaded','in_transit','delivered','unassigned_alert')),
                                                                                                                          instant_available boolean default false,
                                                                                                                            instant_rate_per_mt numeric,
                                                                                                                              created_at      timestamp with time zone default now()
                                                                                                                              );

                                                                                                                              -- TABLE: buyer_demand
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

                                                                                                                                                -- TABLE: ai_conversations
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

                                                                                                                                                                -- TABLE: buyer_responses
                                                                                                                                                                create table if not exists public.buyer_responses (
                                                                                                                                                                  id                uuid default gen_random_uuid() primary key,
                                                                                                                                                                    dispatch_truck_id uuid references public.dispatch_trucks(id) on delete set null,
                                                                                                                                                                      buyer_id          uuid references public.users(id) on delete cascade,
                                                                                                                                                                        trader_id         uuid references public.users(id) on delete cascade,
                                                                                                                                                                          response          text default 'pending' check (response in ('yes','no','pending')),
                                                                                                                                                                            quantity_mt       numeric,
                                                                                                                                                                              created_at        timestamp with time zone default now()
                                                                                                                                                                              );

                                                                                                                                                                              -- RLS
                                                                                                                                                                              alter table public.fleet_availability  enable row level security;
                                                                                                                                                                              alter table public.dispatch_batches    enable row level security;
                                                                                                                                                                              alter table public.dispatch_trucks     enable row level security;
                                                                                                                                                                              alter table public.buyer_demand        enable row level security;
                                                                                                                                                                              alter table public.ai_conversations    enable row level security;
                                                                                                                                                                              alter table public.buyer_responses     enable row level security;

                                                                                                                                                                              -- Policies (open for now)
                                                                                                                                                                              do $$ begin
                                                                                                                                                                                if not exists (select 1 from pg_policies where tablename='fleet_availability' and policyname='Allow all for now') then
                                                                                                                                                                                    create policy "Allow all for now" on public.fleet_availability  for all using (true) with check (true);
                                                                                                                                                                                      end if;
                                                                                                                                                                                        if not exists (select 1 from pg_policies where tablename='dispatch_batches' and policyname='Allow all for now') then
                                                                                                                                                                                            create policy "Allow all for now" on public.dispatch_batches    for all using (true) with check (true);
                                                                                                                                                                                              end if;
                                                                                                                                                                                                if not exists (select 1 from pg_policies where tablename='dispatch_trucks' and policyname='Allow all for now') then
                                                                                                                                                                                                    create policy "Allow all for now" on public.dispatch_trucks     for all using (true) with check (true);
                                                                                                                                                                                                      end if;
                                                                                                                                                                                                        if not exists (select 1 from pg_policies where tablename='buyer_demand' and policyname='Allow all for now') then
                                                                                                                                                                                                            create policy "Allow all for now" on public.buyer_demand        for all using (true) with check (true);
                                                                                                                                                                                                              end if;
                                                                                                                                                                                                                if not exists (select 1 from pg_policies where tablename='ai_conversations' and policyname='Allow all for now') then
                                                                                                                                                                                                                    create policy "Allow all for now" on public.ai_conversations    for all using (true) with check (true);
                                                                                                                                                                                                                      end if;
                                                                                                                                                                                                                        if not exists (select 1 from pg_policies where tablename='buyer_responses' and policyname='Allow all for now') then
                                                                                                                                                                                                                            create policy "Allow all for now" on public.buyer_responses     for all using (true) with check (true);
                                                                                                                                                                                                                              end if;
                                                                                                                                                                                                                              end $$;

                                                                                                                                                                                                                              -- Alter existing tables
                                                                                                                                                                                                                              alter table public.trips add column if not exists drive_folder_url text;

                                                                                                                                                                                                                              alter table public.users drop constraint if exists users_role_check;
                                                                                                                                                                                                                              alter table public.users add constraint users_role_check
                                                                                                                                                                                                                                check (role in ('buyer','trader','supplier','driver','truck_driver','admin'));

                                                                                                                                                                                                                                -- Indexes
                                                                                                                                                                                                                                create index if not exists idx_dispatch_trucks_instant on public.dispatch_trucks(instant_available) where instant_available = true;
                                                                                                                                                                                                                                create index if not exists idx_buyer_responses_trader  on public.buyer_responses(trader_id);
                                                                                                                                                                                                                                create index if not exists idx_buyer_responses_buyer   on public.buyer_responses(buyer_id);

                                                                                                                                                                                                                                -- Done
                                                                                                                                                                                                                                select 'Migration complete ✓' as result;
                                                                                                                                                                                                                                