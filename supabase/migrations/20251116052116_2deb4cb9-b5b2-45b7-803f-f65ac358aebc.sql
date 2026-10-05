-- Remove 'assigned' status from maintenance_requests
-- Step 1: Drop old constraint
ALTER TABLE maintenance_requests 
DROP CONSTRAINT IF EXISTS maintenance_requests_status_check;

-- Step 2: Add new constraint (only 4 statuses)
ALTER TABLE maintenance_requests 
ADD CONSTRAINT maintenance_requests_status_check 
CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));

-- Step 3: Update existing 'assigned' records to 'pending'
UPDATE maintenance_requests 
SET status = 'pending' 
WHERE status = 'assigned';

-- Step 4: Drop RLS policies that depend on assigned_to column
DROP POLICY IF EXISTS "Staff can update their maintenance requests" ON maintenance_requests;

-- Step 5: Remove assigned_to and assigned_at columns
ALTER TABLE maintenance_requests 
DROP COLUMN IF EXISTS assigned_to,
DROP COLUMN IF EXISTS assigned_at;