-- Drop the restrictive check constraint on code
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_code_check;

-- Allow NULL values for limit columns (to represent "unlimited")
ALTER TABLE subscription_plans ALTER COLUMN max_hotels DROP NOT NULL;
ALTER TABLE subscription_plans ALTER COLUMN max_users DROP NOT NULL;
ALTER TABLE subscription_plans ALTER COLUMN max_rooms DROP NOT NULL;
ALTER TABLE subscription_plans ALTER COLUMN max_items DROP NOT NULL;
ALTER TABLE subscription_plans ALTER COLUMN max_storage_gb DROP NOT NULL;

-- Add room-based pricing columns to tenants (if not exists)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registered_rooms integer DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_duration_days integer DEFAULT 30;

-- Deactivate all old plans  
UPDATE subscription_plans SET is_active = false;

-- Create the standard room-based plan
INSERT INTO subscription_plans (
  code, name, description, pricing_model, 
  price_per_room_daily, min_subscription_days,
  price_monthly, price_yearly,
  max_hotels, max_users, max_rooms, max_items, max_storage_gb,
  features, is_active, display_order
) VALUES (
  'standard', 
  'Gói Tiêu Chuẩn', 
  'Đầy đủ tính năng, không giới hạn',
  'room_based', 
  1000, 
  30,
  0, 
  0,
  NULL, NULL, NULL, NULL, NULL,
  '["Không giới hạn khách sạn","Không giới hạn người dùng","Không giới hạn phòng","Không giới hạn sản phẩm","Không giới hạn lưu trữ","Đầy đủ báo cáo","Hỗ trợ 24/7"]'::jsonb,
  true, 
  1
);

-- Migrate all existing tenants to standard plan and calculate registered rooms
UPDATE tenants t
SET 
  subscription_plan_id = (SELECT id FROM subscription_plans WHERE code = 'standard' LIMIT 1),
  registered_rooms = COALESCE(
    (SELECT COUNT(*) FROM rooms r 
     JOIN hotels h ON r.hotel_id = h.id 
     WHERE h.tenant_id = t.id AND h.status = 'active'),
    0
  ),
  subscription_status = 'active'
WHERE t.id != '00000000-0000-0000-0000-000000000000';