-- Add new statuses 'ready' and 'stocked' to laundry_batches
ALTER TABLE laundry_batches 
DROP CONSTRAINT IF EXISTS laundry_batches_status_check;

ALTER TABLE laundry_batches
ADD CONSTRAINT laundry_batches_status_check 
CHECK (status IN ('delivered', 'washing', 'ready', 'received', 'stocked', 'cancelled'));

COMMENT ON COLUMN laundry_batches.status IS 
'Trạng thái: delivered (đã giao), washing (đang giặt), ready (sẵn sàng nhận), received (đã nhận về), stocked (đã nhập kho), cancelled (đã hủy)';

-- Add index for better query performance on status
CREATE INDEX IF NOT EXISTS idx_laundry_batches_status ON laundry_batches(status);