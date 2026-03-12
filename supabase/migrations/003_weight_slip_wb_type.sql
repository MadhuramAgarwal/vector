-- =============================================
-- 003: Add wb_type to weight_slips
-- Run this in Supabase SQL Editor after 002
-- =============================================

-- wb_type: 'wb1' (driver, at source) | 'wb2' (buyer, at destination)
alter table public.weight_slips
  add column if not exists wb_type text not null default 'wb1';

-- uploaded_by_role: 'driver' | 'buyer'
alter table public.weight_slips
  add column if not exists uploaded_by_role text not null default 'driver';
