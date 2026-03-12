-- ── Migration 008: Fleet owner model ────────────────────────────────────────
-- Fleet owners (truck_driver role) declare truck availability on behalf of drivers
-- Drivers no longer self-declare; traders assign trips from fleet owner offers

ALTER TABLE fleet_availability ADD COLUMN IF NOT EXISTS fleet_owner_id uuid REFERENCES users(id);
ALTER TABLE fleet_availability ADD COLUMN IF NOT EXISTS location      text DEFAULT 'Hazira Industrial Area, Surat, Gujarat';
ALTER TABLE fleet_availability ADD COLUMN IF NOT EXISTS available_to  date;  -- end of availability window

CREATE INDEX IF NOT EXISTS idx_fleet_avail_fleet_owner ON fleet_availability(fleet_owner_id);
CREATE INDEX IF NOT EXISTS idx_fleet_avail_available_to ON fleet_availability(available_to);
