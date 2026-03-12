-- ── Migration 007: Extend user_invitations for public access requests ──────────

-- Allow direct public requests (not from a trader), so invited_by can be null
ALTER TABLE user_invitations ALTER COLUMN invited_by DROP NOT NULL;

-- Extra details collected from the request form
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS phone        text;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS address      text;
