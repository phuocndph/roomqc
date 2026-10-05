-- Add max_items and max_rooms columns to subscription_plans
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS max_rooms INTEGER,
ADD COLUMN IF NOT EXISTS max_items INTEGER;

-- Update existing plans with reasonable defaults
-- You can adjust these values based on your business logic
UPDATE subscription_plans
SET 
  max_rooms = CASE 
    WHEN max_hotels IS NULL THEN NULL  -- Unlimited hotels = unlimited rooms
    WHEN max_hotels <= 1 THEN 50       -- 1 hotel = 50 rooms
    WHEN max_hotels <= 5 THEN 250      -- Up to 5 hotels = 250 rooms
    ELSE NULL                           -- More than 5 hotels = unlimited rooms
  END,
  max_items = CASE 
    WHEN max_hotels IS NULL THEN NULL  -- Unlimited hotels = unlimited items
    WHEN max_hotels <= 1 THEN 500      -- 1 hotel = 500 items
    WHEN max_hotels <= 5 THEN 2500     -- Up to 5 hotels = 2500 items
    ELSE NULL                           -- More than 5 hotels = unlimited items
  END
WHERE max_rooms IS NULL OR max_items IS NULL;

-- Force recalculate tenant usage for all active tenants
DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN 
    SELECT id FROM tenants WHERE subscription_status = 'active'
  LOOP
    PERFORM update_tenant_usage(tenant_record.id);
  END LOOP;
END $$;