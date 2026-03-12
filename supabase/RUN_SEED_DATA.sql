-- ════════════════════════════════════════════════════════════════════════════
-- SandX — SEED DATA  (Run in Supabase SQL Editor)
-- Password for ALL accounts: Test@1234
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Add extra columns + fix role constraint ───────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone        text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address      text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_number text;

-- Allow truck_driver role (original schema only had buyer/trader/supplier/driver/admin)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('buyer','trader','supplier','driver','truck_driver','admin'));

-- ── 1. Clean up existing @sandx.com test accounts ────────────────────────────
DO $$
DECLARE v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.users WHERE email LIKE '%@sandx.com';
  IF v_ids IS NOT NULL THEN
    -- Each sub-block catches errors for tables that might not exist yet
    BEGIN DELETE FROM public.trip_status_log WHERE updated_by = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.dispatch_trucks WHERE driver_id = ANY(v_ids) OR buyer_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.buyer_responses WHERE buyer_id = ANY(v_ids) OR trader_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.dispatch_batches WHERE trader_id = ANY(v_ids) OR supplier_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.buyer_demand WHERE trader_id = ANY(v_ids) OR buyer_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.ai_conversations WHERE user_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.trips WHERE driver_id = ANY(v_ids) OR supplier_id = ANY(v_ids) OR order_id IN (SELECT id FROM public.orders WHERE trader_id = ANY(v_ids) OR buyer_id = ANY(v_ids)); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.orders WHERE trader_id = ANY(v_ids) OR buyer_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.fleet_availability WHERE driver_id = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.user_invitations WHERE invited_by = ANY(v_ids) OR approved_by = ANY(v_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    DELETE FROM public.users WHERE id = ANY(v_ids);
  END IF;
  -- Always clean auth (catches orphan rows not in public.users)
  DELETE FROM auth.users WHERE email LIKE '%@sandx.com';
END $$;

-- ── 2. Insert into auth.users ─────────────────────────────────────────────────
-- All passwords = crypt('Test@1234', gen_salt('bf'))
-- email_confirmed_at = now() so email confirmation is skipped

INSERT INTO auth.users
  (id, instance_id, email, encrypted_password, email_confirmed_at,
   raw_user_meta_data, raw_app_meta_data, role, aud, created_at, updated_at)
VALUES

-- Admin
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
 'admin@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"admin","full_name":"Vikram Admin"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),

-- Traders
('00000000-0000-0000-0001-000000000001','00000000-0000-0000-0000-000000000000',
 'trader1@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"trader","full_name":"Ravi Kumar"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0001-000000000002','00000000-0000-0000-0000-000000000000',
 'trader2@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"trader","full_name":"Suresh Sharma"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0001-000000000003','00000000-0000-0000-0000-000000000000',
 'trader3@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"trader","full_name":"Anil Patel"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),

-- Buyers (3 per trader)
('00000000-0000-0000-0002-000000000001','00000000-0000-0000-0000-000000000000',
 'buyer1@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Anand Kapoor"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000002','00000000-0000-0000-0000-000000000000',
 'buyer2@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Harpal Singh"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000003','00000000-0000-0000-0000-000000000000',
 'buyer3@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Deepak Mehta"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000004','00000000-0000-0000-0000-000000000000',
 'buyer4@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Rajesh Gupta"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000005','00000000-0000-0000-0000-000000000000',
 'buyer5@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Vikas Joshi"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000006','00000000-0000-0000-0000-000000000000',
 'buyer6@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Sunil Desai"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000007','00000000-0000-0000-0000-000000000000',
 'buyer7@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Nilesh Shah"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000008','00000000-0000-0000-0000-000000000000',
 'buyer8@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Bhavesh Modi"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0002-000000000009','00000000-0000-0000-0000-000000000000',
 'buyer9@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"buyer","full_name":"Ketan Trivedi"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),

-- Suppliers (3 per trader)
('00000000-0000-0000-0003-000000000001','00000000-0000-0000-0000-000000000000',
 'supplier1@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Mohan Das"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000002','00000000-0000-0000-0000-000000000000',
 'supplier2@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Rajendra Bhatt"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000003','00000000-0000-0000-0000-000000000000',
 'supplier3@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Balram Yadav"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000004','00000000-0000-0000-0000-000000000000',
 'supplier4@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Ganesh Patil"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000005','00000000-0000-0000-0000-000000000000',
 'supplier5@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Krishna Nair"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000006','00000000-0000-0000-0000-000000000000',
 'supplier6@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Shantilal Patel"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000007','00000000-0000-0000-0000-000000000000',
 'supplier7@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Vishnu Prasad"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000008','00000000-0000-0000-0000-000000000000',
 'supplier8@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Shivkumar Tiwari"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0003-000000000009','00000000-0000-0000-0000-000000000000',
 'supplier9@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"supplier","full_name":"Durga Prasad"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),

-- Fleet Owners / Transporters (role = truck_driver, 3 per trader)
('00000000-0000-0000-0004-000000000001','00000000-0000-0000-0000-000000000000',
 'fleet1@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Arjun Singh"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000002','00000000-0000-0000-0000-000000000000',
 'fleet2@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Bharat Patel"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000003','00000000-0000-0000-0000-000000000000',
 'fleet3@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Chandrakant Shah"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000004','00000000-0000-0000-0000-000000000000',
 'fleet4@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Devraj Chauhan"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000005','00000000-0000-0000-0000-000000000000',
 'fleet5@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Eshwar Kumar"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000006','00000000-0000-0000-0000-000000000000',
 'fleet6@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Farhan Sheikh"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000007','00000000-0000-0000-0000-000000000000',
 'fleet7@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Gopal Trivedi"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000008','00000000-0000-0000-0000-000000000000',
 'fleet8@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Harishbhai Desai"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0004-000000000009','00000000-0000-0000-0000-000000000000',
 'fleet9@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"truck_driver","full_name":"Ishwar Das"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),

-- Drivers (3 per fleet, 27 total — role = driver)
('00000000-0000-0000-0005-000000000001','00000000-0000-0000-0000-000000000000',
 'driver1@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Ramesh Kumar"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000002','00000000-0000-0000-0000-000000000000',
 'driver2@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Suresh Yadav"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000003','00000000-0000-0000-0000-000000000000',
 'driver3@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Mahesh Singh"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000004','00000000-0000-0000-0000-000000000000',
 'driver4@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Dinesh Patel"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000005','00000000-0000-0000-0000-000000000000',
 'driver5@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Naresh Shah"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000006','00000000-0000-0000-0000-000000000000',
 'driver6@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Paresh Modi"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000007','00000000-0000-0000-0000-000000000000',
 'driver7@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Rakesh Tiwari"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000008','00000000-0000-0000-0000-000000000000',
 'driver8@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Ganesh Pandey"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000009','00000000-0000-0000-0000-000000000000',
 'driver9@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Yogesh Mishra"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000010','00000000-0000-0000-0000-000000000000',
 'driver10@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Lokesh Verma"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000011','00000000-0000-0000-0000-000000000000',
 'driver11@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Mukesh Gupta"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000012','00000000-0000-0000-0000-000000000000',
 'driver12@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Prakash Jha"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000013','00000000-0000-0000-0000-000000000000',
 'driver13@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Satish Dubey"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000014','00000000-0000-0000-0000-000000000000',
 'driver14@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Rajesh Shukla"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000015','00000000-0000-0000-0000-000000000000',
 'driver15@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Kamlesh Tripathi"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000016','00000000-0000-0000-0000-000000000000',
 'driver16@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Mohan Ansari"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000017','00000000-0000-0000-0000-000000000000',
 'driver17@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Salim Khan"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000018','00000000-0000-0000-0000-000000000000',
 'driver18@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Arif Malik"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000019','00000000-0000-0000-0000-000000000000',
 'driver19@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Girish Dave"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000020','00000000-0000-0000-0000-000000000000',
 'driver20@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Hitesh Parmar"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000021','00000000-0000-0000-0000-000000000000',
 'driver21@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Jignesh Solanki"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000022','00000000-0000-0000-0000-000000000000',
 'driver22@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Kalpesh Vasava"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000023','00000000-0000-0000-0000-000000000000',
 'driver23@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Manish Rathod"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000024','00000000-0000-0000-0000-000000000000',
 'driver24@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Nilesh Gamit"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000025','00000000-0000-0000-0000-000000000000',
 'driver25@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Ojas Bhil"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000026','00000000-0000-0000-0000-000000000000',
 'driver26@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Parag Patel"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now()),
('00000000-0000-0000-0005-000000000027','00000000-0000-0000-0000-000000000000',
 'driver27@sandx.com', crypt('Test@1234', gen_salt('bf')), now(),
 '{"role":"driver","full_name":"Qasim Shaikh"}','{"provider":"email","providers":["email"]}','authenticated','authenticated',now(),now());

-- ── 2b. Insert into auth.identities (required by GoTrue v2 for signInWithPassword) ──
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
('admin@sandx.com',     '00000000-0000-0000-0000-000000000001', '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@sandx.com","email_verified":true}',     'email', now(), now(), now()),
('trader1@sandx.com',   '00000000-0000-0000-0001-000000000001', '{"sub":"00000000-0000-0000-0001-000000000001","email":"trader1@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('trader2@sandx.com',   '00000000-0000-0000-0001-000000000002', '{"sub":"00000000-0000-0000-0001-000000000002","email":"trader2@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('trader3@sandx.com',   '00000000-0000-0000-0001-000000000003', '{"sub":"00000000-0000-0000-0001-000000000003","email":"trader3@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('buyer1@sandx.com',    '00000000-0000-0000-0002-000000000001', '{"sub":"00000000-0000-0000-0002-000000000001","email":"buyer1@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer2@sandx.com',    '00000000-0000-0000-0002-000000000002', '{"sub":"00000000-0000-0000-0002-000000000002","email":"buyer2@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer3@sandx.com',    '00000000-0000-0000-0002-000000000003', '{"sub":"00000000-0000-0000-0002-000000000003","email":"buyer3@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer4@sandx.com',    '00000000-0000-0000-0002-000000000004', '{"sub":"00000000-0000-0000-0002-000000000004","email":"buyer4@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer5@sandx.com',    '00000000-0000-0000-0002-000000000005', '{"sub":"00000000-0000-0000-0002-000000000005","email":"buyer5@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer6@sandx.com',    '00000000-0000-0000-0002-000000000006', '{"sub":"00000000-0000-0000-0002-000000000006","email":"buyer6@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer7@sandx.com',    '00000000-0000-0000-0002-000000000007', '{"sub":"00000000-0000-0000-0002-000000000007","email":"buyer7@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer8@sandx.com',    '00000000-0000-0000-0002-000000000008', '{"sub":"00000000-0000-0000-0002-000000000008","email":"buyer8@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('buyer9@sandx.com',    '00000000-0000-0000-0002-000000000009', '{"sub":"00000000-0000-0000-0002-000000000009","email":"buyer9@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('supplier1@sandx.com', '00000000-0000-0000-0003-000000000001', '{"sub":"00000000-0000-0000-0003-000000000001","email":"supplier1@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier2@sandx.com', '00000000-0000-0000-0003-000000000002', '{"sub":"00000000-0000-0000-0003-000000000002","email":"supplier2@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier3@sandx.com', '00000000-0000-0000-0003-000000000003', '{"sub":"00000000-0000-0000-0003-000000000003","email":"supplier3@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier4@sandx.com', '00000000-0000-0000-0003-000000000004', '{"sub":"00000000-0000-0000-0003-000000000004","email":"supplier4@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier5@sandx.com', '00000000-0000-0000-0003-000000000005', '{"sub":"00000000-0000-0000-0003-000000000005","email":"supplier5@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier6@sandx.com', '00000000-0000-0000-0003-000000000006', '{"sub":"00000000-0000-0000-0003-000000000006","email":"supplier6@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier7@sandx.com', '00000000-0000-0000-0003-000000000007', '{"sub":"00000000-0000-0000-0003-000000000007","email":"supplier7@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier8@sandx.com', '00000000-0000-0000-0003-000000000008', '{"sub":"00000000-0000-0000-0003-000000000008","email":"supplier8@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('supplier9@sandx.com', '00000000-0000-0000-0003-000000000009', '{"sub":"00000000-0000-0000-0003-000000000009","email":"supplier9@sandx.com","email_verified":true}', 'email', now(), now(), now()),
('fleet1@sandx.com',    '00000000-0000-0000-0004-000000000001', '{"sub":"00000000-0000-0000-0004-000000000001","email":"fleet1@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet2@sandx.com',    '00000000-0000-0000-0004-000000000002', '{"sub":"00000000-0000-0000-0004-000000000002","email":"fleet2@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet3@sandx.com',    '00000000-0000-0000-0004-000000000003', '{"sub":"00000000-0000-0000-0004-000000000003","email":"fleet3@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet4@sandx.com',    '00000000-0000-0000-0004-000000000004', '{"sub":"00000000-0000-0000-0004-000000000004","email":"fleet4@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet5@sandx.com',    '00000000-0000-0000-0004-000000000005', '{"sub":"00000000-0000-0000-0004-000000000005","email":"fleet5@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet6@sandx.com',    '00000000-0000-0000-0004-000000000006', '{"sub":"00000000-0000-0000-0004-000000000006","email":"fleet6@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet7@sandx.com',    '00000000-0000-0000-0004-000000000007', '{"sub":"00000000-0000-0000-0004-000000000007","email":"fleet7@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet8@sandx.com',    '00000000-0000-0000-0004-000000000008', '{"sub":"00000000-0000-0000-0004-000000000008","email":"fleet8@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('fleet9@sandx.com',    '00000000-0000-0000-0004-000000000009', '{"sub":"00000000-0000-0000-0004-000000000009","email":"fleet9@sandx.com","email_verified":true}',    'email', now(), now(), now()),
('driver1@sandx.com',   '00000000-0000-0000-0005-000000000001', '{"sub":"00000000-0000-0000-0005-000000000001","email":"driver1@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver2@sandx.com',   '00000000-0000-0000-0005-000000000002', '{"sub":"00000000-0000-0000-0005-000000000002","email":"driver2@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver3@sandx.com',   '00000000-0000-0000-0005-000000000003', '{"sub":"00000000-0000-0000-0005-000000000003","email":"driver3@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver4@sandx.com',   '00000000-0000-0000-0005-000000000004', '{"sub":"00000000-0000-0000-0005-000000000004","email":"driver4@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver5@sandx.com',   '00000000-0000-0000-0005-000000000005', '{"sub":"00000000-0000-0000-0005-000000000005","email":"driver5@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver6@sandx.com',   '00000000-0000-0000-0005-000000000006', '{"sub":"00000000-0000-0000-0005-000000000006","email":"driver6@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver7@sandx.com',   '00000000-0000-0000-0005-000000000007', '{"sub":"00000000-0000-0000-0005-000000000007","email":"driver7@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver8@sandx.com',   '00000000-0000-0000-0005-000000000008', '{"sub":"00000000-0000-0000-0005-000000000008","email":"driver8@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver9@sandx.com',   '00000000-0000-0000-0005-000000000009', '{"sub":"00000000-0000-0000-0005-000000000009","email":"driver9@sandx.com","email_verified":true}',   'email', now(), now(), now()),
('driver10@sandx.com',  '00000000-0000-0000-0005-000000000010', '{"sub":"00000000-0000-0000-0005-000000000010","email":"driver10@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver11@sandx.com',  '00000000-0000-0000-0005-000000000011', '{"sub":"00000000-0000-0000-0005-000000000011","email":"driver11@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver12@sandx.com',  '00000000-0000-0000-0005-000000000012', '{"sub":"00000000-0000-0000-0005-000000000012","email":"driver12@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver13@sandx.com',  '00000000-0000-0000-0005-000000000013', '{"sub":"00000000-0000-0000-0005-000000000013","email":"driver13@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver14@sandx.com',  '00000000-0000-0000-0005-000000000014', '{"sub":"00000000-0000-0000-0005-000000000014","email":"driver14@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver15@sandx.com',  '00000000-0000-0000-0005-000000000015', '{"sub":"00000000-0000-0000-0005-000000000015","email":"driver15@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver16@sandx.com',  '00000000-0000-0000-0005-000000000016', '{"sub":"00000000-0000-0000-0005-000000000016","email":"driver16@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver17@sandx.com',  '00000000-0000-0000-0005-000000000017', '{"sub":"00000000-0000-0000-0005-000000000017","email":"driver17@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver18@sandx.com',  '00000000-0000-0000-0005-000000000018', '{"sub":"00000000-0000-0000-0005-000000000018","email":"driver18@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver19@sandx.com',  '00000000-0000-0000-0005-000000000019', '{"sub":"00000000-0000-0000-0005-000000000019","email":"driver19@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver20@sandx.com',  '00000000-0000-0000-0005-000000000020', '{"sub":"00000000-0000-0000-0005-000000000020","email":"driver20@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver21@sandx.com',  '00000000-0000-0000-0005-000000000021', '{"sub":"00000000-0000-0000-0005-000000000021","email":"driver21@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver22@sandx.com',  '00000000-0000-0000-0005-000000000022', '{"sub":"00000000-0000-0000-0005-000000000022","email":"driver22@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver23@sandx.com',  '00000000-0000-0000-0005-000000000023', '{"sub":"00000000-0000-0000-0005-000000000023","email":"driver23@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver24@sandx.com',  '00000000-0000-0000-0005-000000000024', '{"sub":"00000000-0000-0000-0005-000000000024","email":"driver24@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver25@sandx.com',  '00000000-0000-0000-0005-000000000025', '{"sub":"00000000-0000-0000-0005-000000000025","email":"driver25@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver26@sandx.com',  '00000000-0000-0000-0005-000000000026', '{"sub":"00000000-0000-0000-0005-000000000026","email":"driver26@sandx.com","email_verified":true}',  'email', now(), now(), now()),
('driver27@sandx.com',  '00000000-0000-0000-0005-000000000027', '{"sub":"00000000-0000-0000-0005-000000000027","email":"driver27@sandx.com","email_verified":true}',  'email', now(), now(), now());

-- ── 3. Insert into public.users (with full details) ───────────────────────────

INSERT INTO public.users (id, email, role, full_name, phone, company_name, address, vehicle_number)
VALUES

-- Admin
('00000000-0000-0000-0000-000000000001','admin@sandx.com','admin','Vikram Admin',
 '9900000000', 'SandX Admin', 'Surat, Gujarat', NULL),

-- Traders
('00000000-0000-0000-0001-000000000001','trader1@sandx.com','trader','Ravi Kumar',
 '9898010001', 'Ravi Kumar Traders', 'Ring Road, Surat-395002, Gujarat', NULL),
('00000000-0000-0000-0001-000000000002','trader2@sandx.com','trader','Suresh Sharma',
 '9898010002', 'Sharma Sand Works', 'Adajan, Surat-395009, Gujarat', NULL),
('00000000-0000-0000-0001-000000000003','trader3@sandx.com','trader','Anil Patel',
 '9898010003', 'Patel Sand Traders', 'Katargam, Surat-395004, Gujarat', NULL),

-- Buyers (under trader1: buyer1-3, trader2: buyer4-6, trader3: buyer7-9)
('00000000-0000-0000-0002-000000000001','buyer1@sandx.com','buyer','Anand Kapoor',
 '9898020001', 'Kapoor RMC Plant',
 'Plot 12, GIDC Phase-2, Sachin, Surat-394230, Gujarat', NULL),
('00000000-0000-0000-0002-000000000002','buyer2@sandx.com','buyer','Harpal Singh',
 '9898020002', 'Singh Constructions',
 'Survey No.45, NH-48, Navsari-396445, Gujarat', NULL),
('00000000-0000-0000-0002-000000000003','buyer3@sandx.com','buyer','Deepak Mehta',
 '9898020003', 'Mehta Builders',
 'Plot 7, Ring Road, Bharuch-392001, Gujarat', NULL),
('00000000-0000-0000-0002-000000000004','buyer4@sandx.com','buyer','Rajesh Gupta',
 '9898020004', 'Gupta RMC Plant',
 'Sachin GIDC, Block-C, Surat-394230, Gujarat', NULL),
('00000000-0000-0000-0002-000000000005','buyer5@sandx.com','buyer','Vikas Joshi',
 '9898020005', 'Joshi Constructions',
 'Hazira Road, Survey No.102, Surat-394270, Gujarat', NULL),
('00000000-0000-0000-0002-000000000006','buyer6@sandx.com','buyer','Sunil Desai',
 '9898020006', 'Desai Ready Mix',
 'Pandesara GIDC, Plot 22, Surat-394221, Gujarat', NULL),
('00000000-0000-0000-0002-000000000007','buyer7@sandx.com','buyer','Nilesh Shah',
 '9898020007', 'Shah Constructions',
 'Udhna Industrial Area, Surat-394210, Gujarat', NULL),
('00000000-0000-0000-0002-000000000008','buyer8@sandx.com','buyer','Bhavesh Modi',
 '9898020008', 'Modi Builders',
 'Katargam, Near Sarthana, Surat-395004, Gujarat', NULL),
('00000000-0000-0000-0002-000000000009','buyer9@sandx.com','buyer','Ketan Trivedi',
 '9898020009', 'Trivedi RMC Plant',
 'Sachin Port Road, Plot 18, Surat-394230, Gujarat', NULL),

-- Suppliers (under trader1: sup1-3, trader2: sup4-6, trader3: sup7-9)
('00000000-0000-0000-0003-000000000001','supplier1@sandx.com','supplier','Mohan Das',
 '9898030001', 'Mohan Stockyard',
 'Village Hazira, Near Bharat Petroleum, Surat-394270, Gujarat', NULL),
('00000000-0000-0000-0003-000000000002','supplier2@sandx.com','supplier','Rajendra Bhatt',
 '9898030002', 'Raj Sand Supply',
 'Village Magdalla, Dumas Road, Surat-395007, Gujarat', NULL),
('00000000-0000-0000-0003-000000000003','supplier3@sandx.com','supplier','Balram Yadav',
 '9898030003', 'Balaji Sand Depot',
 'Limbayat, Survey No.78, Surat-395006, Gujarat', NULL),
('00000000-0000-0000-0003-000000000004','supplier4@sandx.com','supplier','Ganesh Patil',
 '9898030004', 'Ganesh Stockyard',
 'Village Singanpore, Kamrej Road, Surat-395005, Gujarat', NULL),
('00000000-0000-0000-0003-000000000005','supplier5@sandx.com','supplier','Krishna Nair',
 '9898030005', 'Krishna Sand Works',
 'Amroli, Survey No.34, Surat-395007, Gujarat', NULL),
('00000000-0000-0000-0003-000000000006','supplier6@sandx.com','supplier','Shantilal Patel',
 '9898030006', 'Shantilal Sand Depot',
 'Kim, NH-48, Surat-394110, Gujarat', NULL),
('00000000-0000-0000-0003-000000000007','supplier7@sandx.com','supplier','Vishnu Prasad',
 '9898030007', 'Vishnu Sand Supply',
 'Olpad, River Bank, Surat-394540, Gujarat', NULL),
('00000000-0000-0000-0003-000000000008','supplier8@sandx.com','supplier','Shivkumar Tiwari',
 '9898030008', 'Shiv Stockyard',
 'Kamrej, Sand Bank Area, Surat-394150, Gujarat', NULL),
('00000000-0000-0000-0003-000000000009','supplier9@sandx.com','supplier','Durga Prasad',
 '9898030009', 'Durga Sand Depot',
 'Bardoli, Tapi River Bank, Surat-394601, Gujarat', NULL),

-- Fleet Owners / Transporters (truck_driver role)
-- Under trader1: fleet1-3 | trader2: fleet4-6 | trader3: fleet7-9
('00000000-0000-0000-0004-000000000001','fleet1@sandx.com','truck_driver','Arjun Singh',
 '9898040001', 'Arjun Transport Co.',
 'Bhestan, Surat-395023, Gujarat', NULL),
('00000000-0000-0000-0004-000000000002','fleet2@sandx.com','truck_driver','Bharat Patel',
 '9898040002', 'Bharat Carriers',
 'Vesu, Surat-395007, Gujarat', NULL),
('00000000-0000-0000-0004-000000000003','fleet3@sandx.com','truck_driver','Chandrakant Shah',
 '9898040003', 'Chandra Logistics',
 'Piplod, Surat-395007, Gujarat', NULL),
('00000000-0000-0000-0004-000000000004','fleet4@sandx.com','truck_driver','Devraj Chauhan',
 '9898040004', 'Devraj Transport',
 'Althan, Surat-395017, Gujarat', NULL),
('00000000-0000-0000-0004-000000000005','fleet5@sandx.com','truck_driver','Eshwar Kumar',
 '9898040005', 'Eshwar Carriers',
 'Pal, Surat-395009, Gujarat', NULL),
('00000000-0000-0000-0004-000000000006','fleet6@sandx.com','truck_driver','Farhan Sheikh',
 '9898040006', 'Farhan Logistics',
 'Jahangirpura, Surat-395005, Gujarat', NULL),
('00000000-0000-0000-0004-000000000007','fleet7@sandx.com','truck_driver','Gopal Trivedi',
 '9898040007', 'Gopal Transport',
 'Adajan, Surat-395009, Gujarat', NULL),
('00000000-0000-0000-0004-000000000008','fleet8@sandx.com','truck_driver','Harishbhai Desai',
 '9898040008', 'Hari Carriers',
 'Citylight, Surat-395007, Gujarat', NULL),
('00000000-0000-0000-0004-000000000009','fleet9@sandx.com','truck_driver','Ishwar Das',
 '9898040009', 'Ishwar Logistics',
 'Katargam, Surat-395004, Gujarat', NULL),

-- Drivers (vehicle_number = license plate)
-- Fleet 1 (Arjun Transport): driver1-3
('00000000-0000-0000-0005-000000000001','driver1@sandx.com','driver','Ramesh Kumar',
 '9898050001', NULL, 'Surat, Gujarat', 'GJ-05-T-1001'),
('00000000-0000-0000-0005-000000000002','driver2@sandx.com','driver','Suresh Yadav',
 '9898050002', NULL, 'Surat, Gujarat', 'GJ-05-T-1002'),
('00000000-0000-0000-0005-000000000003','driver3@sandx.com','driver','Mahesh Singh',
 '9898050003', NULL, 'Surat, Gujarat', 'GJ-05-T-1003'),
-- Fleet 2 (Bharat Carriers): driver4-6
('00000000-0000-0000-0005-000000000004','driver4@sandx.com','driver','Dinesh Patel',
 '9898050004', NULL, 'Surat, Gujarat', 'GJ-05-T-2001'),
('00000000-0000-0000-0005-000000000005','driver5@sandx.com','driver','Naresh Shah',
 '9898050005', NULL, 'Surat, Gujarat', 'GJ-05-T-2002'),
('00000000-0000-0000-0005-000000000006','driver6@sandx.com','driver','Paresh Modi',
 '9898050006', NULL, 'Surat, Gujarat', 'GJ-05-T-2003'),
-- Fleet 3 (Chandra Logistics): driver7-9
('00000000-0000-0000-0005-000000000007','driver7@sandx.com','driver','Rakesh Tiwari',
 '9898050007', NULL, 'Surat, Gujarat', 'GJ-05-T-3001'),
('00000000-0000-0000-0005-000000000008','driver8@sandx.com','driver','Ganesh Pandey',
 '9898050008', NULL, 'Surat, Gujarat', 'GJ-05-T-3002'),
('00000000-0000-0000-0005-000000000009','driver9@sandx.com','driver','Yogesh Mishra',
 '9898050009', NULL, 'Surat, Gujarat', 'GJ-05-T-3003'),
-- Fleet 4 (Devraj Transport): driver10-12
('00000000-0000-0000-0005-000000000010','driver10@sandx.com','driver','Lokesh Verma',
 '9898050010', NULL, 'Surat, Gujarat', 'GJ-06-T-1001'),
('00000000-0000-0000-0005-000000000011','driver11@sandx.com','driver','Mukesh Gupta',
 '9898050011', NULL, 'Surat, Gujarat', 'GJ-06-T-1002'),
('00000000-0000-0000-0005-000000000012','driver12@sandx.com','driver','Prakash Jha',
 '9898050012', NULL, 'Surat, Gujarat', 'GJ-06-T-1003'),
-- Fleet 5 (Eshwar Carriers): driver13-15
('00000000-0000-0000-0005-000000000013','driver13@sandx.com','driver','Satish Dubey',
 '9898050013', NULL, 'Surat, Gujarat', 'GJ-06-T-2001'),
('00000000-0000-0000-0005-000000000014','driver14@sandx.com','driver','Rajesh Shukla',
 '9898050014', NULL, 'Surat, Gujarat', 'GJ-06-T-2002'),
('00000000-0000-0000-0005-000000000015','driver15@sandx.com','driver','Kamlesh Tripathi',
 '9898050015', NULL, 'Surat, Gujarat', 'GJ-06-T-2003'),
-- Fleet 6 (Farhan Logistics): driver16-18
('00000000-0000-0000-0005-000000000016','driver16@sandx.com','driver','Mohan Ansari',
 '9898050016', NULL, 'Surat, Gujarat', 'GJ-06-T-3001'),
('00000000-0000-0000-0005-000000000017','driver17@sandx.com','driver','Salim Khan',
 '9898050017', NULL, 'Surat, Gujarat', 'GJ-06-T-3002'),
('00000000-0000-0000-0005-000000000018','driver18@sandx.com','driver','Arif Malik',
 '9898050018', NULL, 'Surat, Gujarat', 'GJ-06-T-3003'),
-- Fleet 7 (Gopal Transport): driver19-21
('00000000-0000-0000-0005-000000000019','driver19@sandx.com','driver','Girish Dave',
 '9898050019', NULL, 'Surat, Gujarat', 'GJ-07-T-1001'),
('00000000-0000-0000-0005-000000000020','driver20@sandx.com','driver','Hitesh Parmar',
 '9898050020', NULL, 'Surat, Gujarat', 'GJ-07-T-1002'),
('00000000-0000-0000-0005-000000000021','driver21@sandx.com','driver','Jignesh Solanki',
 '9898050021', NULL, 'Surat, Gujarat', 'GJ-07-T-1003'),
-- Fleet 8 (Hari Carriers): driver22-24
('00000000-0000-0000-0005-000000000022','driver22@sandx.com','driver','Kalpesh Vasava',
 '9898050022', NULL, 'Surat, Gujarat', 'GJ-07-T-2001'),
('00000000-0000-0000-0005-000000000023','driver23@sandx.com','driver','Manish Rathod',
 '9898050023', NULL, 'Surat, Gujarat', 'GJ-07-T-2002'),
('00000000-0000-0000-0005-000000000024','driver24@sandx.com','driver','Nilesh Gamit',
 '9898050024', NULL, 'Surat, Gujarat', 'GJ-07-T-2003'),
-- Fleet 9 (Ishwar Logistics): driver25-27
('00000000-0000-0000-0005-000000000025','driver25@sandx.com','driver','Ojas Bhil',
 '9898050025', NULL, 'Surat, Gujarat', 'GJ-07-T-3001'),
('00000000-0000-0000-0005-000000000026','driver26@sandx.com','driver','Parag Patel',
 '9898050026', NULL, 'Surat, Gujarat', 'GJ-07-T-3002'),
('00000000-0000-0000-0005-000000000027','driver27@sandx.com','driver','Qasim Shaikh',
 '9898050027', NULL, 'Surat, Gujarat', 'GJ-07-T-3003')

ON CONFLICT (id) DO UPDATE SET
  role         = EXCLUDED.role,
  full_name    = EXCLUDED.full_name,
  phone        = EXCLUDED.phone,
  company_name = EXCLUDED.company_name,
  address      = EXCLUDED.address,
  vehicle_number = EXCLUDED.vehicle_number;

COMMIT;
