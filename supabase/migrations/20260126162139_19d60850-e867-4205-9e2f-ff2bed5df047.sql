-- Thêm column liên kết checkout_inspection_id vào housekeeping_tasks
ALTER TABLE housekeeping_tasks 
ADD COLUMN IF NOT EXISTS checkout_inspection_id UUID REFERENCES checkout_inspection_requests(id);

-- Index cho performance
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_checkout_inspection 
ON housekeeping_tasks(checkout_inspection_id) 
WHERE checkout_inspection_id IS NOT NULL;