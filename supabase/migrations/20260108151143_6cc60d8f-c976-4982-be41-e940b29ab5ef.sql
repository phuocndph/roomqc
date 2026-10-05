-- Add missing column for early check-in before 5h
ALTER TABLE room_pricing_rules 
ADD COLUMN IF NOT EXISTS early_checkin_before_5 numeric DEFAULT 100;

-- Update DEFAULT comments for clarity
COMMENT ON COLUMN room_pricing_rules.early_checkin_before_5 IS 'Phụ thu check-in trước 5h (% giá phòng) - mặc định 100%';
COMMENT ON COLUMN room_pricing_rules.early_checkin_5_9 IS 'Phụ thu check-in 5h-9h (% giá phòng) - mặc định 50%';
COMMENT ON COLUMN room_pricing_rules.early_checkin_9_14 IS 'Phụ thu check-in 9h-14h (% giá phòng) - mặc định 30%';
COMMENT ON COLUMN room_pricing_rules.late_checkout_12_15 IS 'Phụ thu check-out 12h-15h (% giá phòng) - mặc định 30%';
COMMENT ON COLUMN room_pricing_rules.late_checkout_15_18 IS 'Phụ thu check-out 15h-18h (% giá phòng) - mặc định 50%';
COMMENT ON COLUMN room_pricing_rules.late_checkout_after_18 IS 'Phụ thu check-out sau 18h (% giá phòng) - mặc định 100%';