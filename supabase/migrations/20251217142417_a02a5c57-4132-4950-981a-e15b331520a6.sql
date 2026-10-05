-- Add new columns for room-based pricing model
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS pricing_model text DEFAULT 'room_based',
ADD COLUMN IF NOT EXISTS price_per_room_daily numeric DEFAULT 1000,
ADD COLUMN IF NOT EXISTS min_subscription_days integer DEFAULT 30;

-- Add comment for clarity
COMMENT ON COLUMN subscription_plans.pricing_model IS 'Pricing model: room_based (default)';
COMMENT ON COLUMN subscription_plans.price_per_room_daily IS 'Price per room per day in VND (default 1000)';
COMMENT ON COLUMN subscription_plans.min_subscription_days IS 'Minimum subscription period in days (default 30)';

-- Update existing plans to use room-based model
UPDATE subscription_plans 
SET pricing_model = 'room_based',
    price_per_room_daily = 1000,
    min_subscription_days = 30
WHERE pricing_model IS NULL OR pricing_model != 'room_based';