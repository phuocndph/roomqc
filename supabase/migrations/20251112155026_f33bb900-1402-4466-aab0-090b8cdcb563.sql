-- Add billing_cycle column to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')) DEFAULT 'monthly';

-- Add subscription period tracking columns if they don't exist
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Update existing tenants to have monthly billing cycle
UPDATE tenants 
SET billing_cycle = 'monthly' 
WHERE billing_cycle IS NULL;