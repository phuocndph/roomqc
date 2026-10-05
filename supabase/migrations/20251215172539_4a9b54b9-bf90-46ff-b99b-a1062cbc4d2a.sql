-- Drop old constraint and add new one that includes quantity_pending
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_quantities_valid;

ALTER TABLE items ADD CONSTRAINT items_quantities_valid CHECK (
  quantity_total = (
    COALESCE(quantity_in_stock, 0) + 
    COALESCE(quantity_in_use, 0) + 
    COALESCE(quantity_in_laundry, 0) + 
    COALESCE(quantity_damaged, 0) + 
    COALESCE(quantity_lost, 0) + 
    COALESCE(quantity_pending, 0)
  )
  AND quantity_total >= 0 
  AND COALESCE(quantity_in_stock, 0) >= 0 
  AND COALESCE(quantity_in_use, 0) >= 0 
  AND COALESCE(quantity_in_laundry, 0) >= 0 
  AND COALESCE(quantity_damaged, 0) >= 0 
  AND COALESCE(quantity_lost, 0) >= 0
  AND COALESCE(quantity_pending, 0) >= 0
);