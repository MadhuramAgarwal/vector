-- ── Run this in Supabase SQL Editor ────────────────────────────────────────
-- Creates the user_invitations table with all required columns

CREATE TABLE IF NOT EXISTS user_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by    uuid REFERENCES users(id),          -- nullable: direct public requests have no inviter
  target_role   text NOT NULL CHECK (target_role IN ('buyer', 'supplier', 'driver', 'truck_driver')),
  full_name     text NOT NULL,
  email         text NOT NULL,
  phone         text,
  company_name  text,
  address       text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
  requires_approval boolean NOT NULL DEFAULT true,
  notes         text,
  approved_by   uuid REFERENCES users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for now" ON user_invitations;
CREATE POLICY "Allow all for now" ON user_invitations FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email  ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);
