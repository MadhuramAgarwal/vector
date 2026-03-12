-- Migration 005: Add truck_driver role, drive_folder_url, instant availability, buyer responses

-- 1. Expand role constraint on users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('buyer','trader','supplier','driver','truck_driver','admin'));

-- 2. Add drive folder URL to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

-- 3. Add instant availability flags to dispatch_trucks
ALTER TABLE dispatch_trucks ADD COLUMN IF NOT EXISTS instant_available BOOLEAN DEFAULT false;
ALTER TABLE dispatch_trucks ADD COLUMN IF NOT EXISTS instant_rate_per_mt NUMERIC;

-- 4. Buyer responses to trader pings / instant orders
CREATE TABLE IF NOT EXISTS buyer_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_truck_id UUID REFERENCES dispatch_trucks(id) ON DELETE SET NULL,
  buyer_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  trader_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  response          TEXT DEFAULT 'pending' CHECK (response IN ('yes','no','pending')),
  quantity_mt       NUMERIC,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE buyer_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON buyer_responses FOR ALL USING (true) WITH CHECK (true);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_dispatch_trucks_instant ON dispatch_trucks(instant_available) WHERE instant_available = true;
CREATE INDEX IF NOT EXISTS idx_buyer_responses_trader ON buyer_responses(trader_id);
CREATE INDEX IF NOT EXISTS idx_buyer_responses_buyer  ON buyer_responses(buyer_id);
