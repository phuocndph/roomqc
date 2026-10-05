-- Cho phép vendor_id là NULL cho draft batches
ALTER TABLE public.laundry_batches 
  ALTER COLUMN vendor_id DROP NOT NULL;

-- Cho phép delivery_date là NULL cho draft batches
ALTER TABLE public.laundry_batches 
  ALTER COLUMN delivery_date DROP NOT NULL;

-- Đặt default 0 cho total_weight_kg
ALTER TABLE public.laundry_batches 
  ALTER COLUMN total_weight_kg SET DEFAULT 0;