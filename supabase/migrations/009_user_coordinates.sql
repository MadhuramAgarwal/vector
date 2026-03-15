-- Migration 009: Add address, lat, lng to users for geocoding / smart match

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lng numeric;

-- Backfill buyer coordinates from seed data addresses
-- Gujarat buyers
UPDATE public.users SET
  address = 'Survey No.45, NH-48, Navsari-396445, Gujarat',
  lat = 20.9467, lng = 72.9520
WHERE role = 'buyer' AND full_name = 'Harpal Singh';

UPDATE public.users SET
  address = 'Plot 12, Vapi GIDC, Vapi-396195, Gujarat',
  lat = 20.3893, lng = 72.9106
WHERE role = 'buyer' AND full_name = 'Rajesh Patel';

UPDATE public.users SET
  address = 'Survey 78, Sachin GIDC, Surat-394230, Gujarat',
  lat = 21.0851, lng = 72.8856
WHERE role = 'buyer' AND full_name = 'Mehul Desai';

UPDATE public.users SET
  address = 'NH-8, Bharuch Industrial Area, Bharuch-392001, Gujarat',
  lat = 21.7051, lng = 72.9959
WHERE role = 'buyer' AND full_name = 'Amit Trivedi';

UPDATE public.users SET
  address = 'Waghodia Road, Vadodara-390019, Gujarat',
  lat = 22.2587, lng = 73.1645
WHERE role = 'buyer' AND full_name = 'Kishan Bhatt';

UPDATE public.users SET
  address = 'Ankleshwar GIDC, Ankleshwar-393002, Gujarat',
  lat = 21.6264, lng = 73.0153
WHERE role = 'buyer' AND full_name = 'Suresh Nair';

UPDATE public.users SET
  address = 'SH-6, Gandhinagar-382010, Gujarat',
  lat = 23.2156, lng = 72.6369
WHERE role = 'buyer' AND full_name = 'Priya Sharma';

UPDATE public.users SET
  address = 'Hazira Road, Surat-394270, Gujarat',
  lat = 21.0960, lng = 72.6542
WHERE role = 'buyer' AND full_name = 'Dharmesh Shah';

UPDATE public.users SET
  address = 'SP Ring Road, Ahmedabad-380058, Gujarat',
  lat = 23.0225, lng = 72.5714
WHERE role = 'buyer' AND full_name = 'Nitin Agarwal';

UPDATE public.users SET
  address = 'Silvassa Road, Valsad-396001, Gujarat',
  lat = 20.6100, lng = 72.9342
WHERE role = 'buyer' AND full_name = 'Farhan Qureshi';

-- Supplier coordinates
UPDATE public.users SET
  address = 'Sand Mine, Tapi River, Kim-394110, Gujarat',
  lat = 21.3637, lng = 72.9530
WHERE role = 'supplier' AND full_name = 'Dilip Vasava';

UPDATE public.users SET
  address = 'Narmada Ghat, Rajpipla-393145, Gujarat',
  lat = 21.8677, lng = 73.5023
WHERE role = 'supplier' AND full_name = 'Bhavesh Tadvi';

UPDATE public.users SET
  address = 'Daman Ganga River Quarry, Vapi-396191, Gujarat',
  lat = 20.3710, lng = 72.9050
WHERE role = 'supplier' AND full_name = 'Manoj Patidar';

UPDATE public.users SET
  address = 'Purna River Sand Depot, Navsari-396445, Gujarat',
  lat = 20.9500, lng = 73.0000
WHERE role = 'supplier' AND full_name = 'Girish Chaudhari';

UPDATE public.users SET
  address = 'Sabarmati Sand Yard, Ahmedabad-380005, Gujarat',
  lat = 23.0396, lng = 72.5852
WHERE role = 'supplier' AND full_name = 'Vikram Rathod';
