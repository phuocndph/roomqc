-- Create RPC to increment quantity_in_laundry for an item
CREATE OR REPLACE FUNCTION public.increment_quantity_in_laundry(
  p_item_id UUID,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE items
  SET 
    quantity_in_laundry = COALESCE(quantity_in_laundry, 0) + p_quantity,
    quantity_in_stock = GREATEST(0, COALESCE(quantity_in_stock, 0) - p_quantity),
    updated_at = NOW()
  WHERE id = p_item_id;
END;
$$;