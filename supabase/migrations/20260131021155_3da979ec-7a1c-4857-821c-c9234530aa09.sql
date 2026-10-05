-- Update distribution_orders status constraint to include 'released' and 'closed'
ALTER TABLE distribution_orders 
DROP CONSTRAINT IF EXISTS distribution_orders_status_check;

ALTER TABLE distribution_orders 
ADD CONSTRAINT distribution_orders_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text,
  'released'::text,
  'in_progress'::text,
  'completed'::text,
  'closed'::text,
  'cancelled'::text
]));