-- Delete all users NOT in the 11 seeded accounts
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- First nullify FK references in trips/orders that point to old accounts
UPDATE trips SET supplier_id = NULL WHERE supplier_id IN (
  SELECT id FROM public.users WHERE email NOT IN (
    'trader@sandx.com','admin@sandx.com',
    'buyer1@sandx.com','buyer2@sandx.com','buyer3@sandx.com',
    'supplier1@sandx.com','supplier2@sandx.com','supplier3@sandx.com',
    'driver1@sandx.com','driver2@sandx.com','driver3@sandx.com'
  )
);
UPDATE trips SET driver_id = NULL WHERE driver_id IN (
  SELECT id FROM public.users WHERE email NOT IN (
    'trader@sandx.com','admin@sandx.com',
    'buyer1@sandx.com','buyer2@sandx.com','buyer3@sandx.com',
    'supplier1@sandx.com','supplier2@sandx.com','supplier3@sandx.com',
    'driver1@sandx.com','driver2@sandx.com','driver3@sandx.com'
  )
);
UPDATE orders SET buyer_id = NULL WHERE buyer_id IN (
  SELECT id FROM public.users WHERE email NOT IN (
    'trader@sandx.com','admin@sandx.com',
    'buyer1@sandx.com','buyer2@sandx.com','buyer3@sandx.com',
    'supplier1@sandx.com','supplier2@sandx.com','supplier3@sandx.com',
    'driver1@sandx.com','driver2@sandx.com','driver3@sandx.com'
  )
);

-- Now delete the old user rows
DELETE FROM public.users WHERE email NOT IN (
  'trader@sandx.com','admin@sandx.com',
  'buyer1@sandx.com','buyer2@sandx.com','buyer3@sandx.com',
  'supplier1@sandx.com','supplier2@sandx.com','supplier3@sandx.com',
  'driver1@sandx.com','driver2@sandx.com','driver3@sandx.com'
);

-- Also delete old trips and orders that have no buyer/supplier/driver
DELETE FROM trips  WHERE supplier_id IS NULL OR driver_id IS NULL;
DELETE FROM orders WHERE buyer_id    IS NULL;

-- Verify final count
SELECT role, count(*) FROM public.users GROUP BY role ORDER BY role;
