-- Add 'waiting' status to maintenance_requests
ALTER TABLE maintenance_requests 
DROP CONSTRAINT IF EXISTS maintenance_requests_status_check;

ALTER TABLE maintenance_requests
ADD CONSTRAINT maintenance_requests_status_check 
CHECK (status IN ('waiting', 'pending', 'in_progress', 'completed', 'cancelled'));

-- Update existing 'pending' requests to 'waiting' to reflect new workflow
-- (New requests will be 'waiting', existing 'pending' become 'waiting' until accepted)
UPDATE maintenance_requests 
SET status = 'waiting' 
WHERE status = 'pending' AND started_at IS NULL;

-- Add accepted_at column to track when request was accepted by manager
ALTER TABLE maintenance_requests
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Update accepted_at for requests that were already in progress
UPDATE maintenance_requests
SET accepted_at = reported_at
WHERE status IN ('in_progress', 'completed') AND accepted_at IS NULL;