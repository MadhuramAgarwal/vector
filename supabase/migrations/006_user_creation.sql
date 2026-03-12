-- ── Migration 006: User invitation system ──────────────────────────────────
-- Traders can invite buyers, suppliers, and fleet owners (requires admin approval)
-- Fleet owners (truck_driver role) can invite drivers (no approval required)

CREATE TABLE user_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by    uuid NOT NULL REFERENCES users(id),
  target_role   text NOT NULL CHECK (target_role IN ('buyer', 'supplier', 'driver', 'truck_driver')),
  full_name     text NOT NULL,
  email         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
  requires_approval boolean NOT NULL DEFAULT true,
  notes         text,
  approved_by   uuid REFERENCES users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON user_invitations FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_user_invitations_email  ON user_invitations(email);
CREATE INDEX idx_user_invitations_status ON user_invitations(status);
