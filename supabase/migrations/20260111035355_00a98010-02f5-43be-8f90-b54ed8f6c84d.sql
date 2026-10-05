-- Drop old constraint and add new one with 'internal_transfer' for warehouse transfers
ALTER TABLE inventory_transactions 
DROP CONSTRAINT IF EXISTS inventory_transactions_category_check;

ALTER TABLE inventory_transactions 
ADD CONSTRAINT inventory_transactions_category_check 
CHECK (
  (transaction_category IS NULL) OR 
  (transaction_category = ANY (ARRAY[
    'purchase', 
    'laundry', 
    'room_assign', 
    'staff_assign',
    'maintenance', 
    'disposal', 
    'return', 
    'adjustment', 
    'other',
    'warehouse_release',
    'room_deliver',
    'return_to_stock',
    'internal_transfer'
  ]))
);