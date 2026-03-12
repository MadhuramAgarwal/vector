-- ============================================================
-- Fix: trips RLS policy — driver_id / supplier_id now store
-- users.id directly (not the profile table id).
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Drop the old policy that references the profile tables
drop policy if exists "trips: involved parties" on public.trips;

-- New policy: match directly against auth.uid()
create policy "trips: involved parties" on public.trips
  for select using (
    driver_id   = auth.uid() or
    supplier_id = auth.uid() or
    trader_id   = auth.uid() or
    order_id in (
      select o.id from public.orders o
      join public.buyers b on b.id = o.buyer_id
      where b.user_id = auth.uid()
    ) or
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Also allow drivers and suppliers to update their own trips (status changes)
drop policy if exists "trips: driver update" on public.trips;
create policy "trips: driver update" on public.trips
  for update using (driver_id = auth.uid() or supplier_id = auth.uid() or trader_id = auth.uid());

-- Allow trader to insert trips
drop policy if exists "trips: trader insert" on public.trips;
create policy "trips: trader insert" on public.trips
  for insert with check (trader_id = auth.uid());

-- Fix trip_status_log: allow insert by involved parties
drop policy if exists "trip_log: involved parties" on public.trip_status_log;

create policy "trip_log: select involved" on public.trip_status_log
  for select using (
    logged_by = auth.uid() or
    trip_id in (select id from public.trips where driver_id = auth.uid() or supplier_id = auth.uid() or trader_id = auth.uid()) or
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

create policy "trip_log: insert involved" on public.trip_status_log
  for insert with check (logged_by = auth.uid());

-- Verify
select policyname, cmd from pg_policies where tablename = 'trips';
select policyname, cmd from pg_policies where tablename = 'trip_status_log';
