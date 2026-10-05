
-- RPC to atomically decrement quantity_in_stock and increment quantity_lost
CREATE OR REPLACE FUNCTION public.atomic_item_lost(
  p_item_id UUID,
  p_quantity INT
)
RETURNS TABLE(quantity_before INT, quantity_after INT, unit_price NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INT;
  v_after INT;
  v_price NUMERIC;
BEGIN
  -- Lock row and get current values
  SELECT i.quantity_in_stock, i.unit_price
  INTO v_before, v_price
  FROM items i
  WHERE i.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  v_after := GREATEST(0, v_before - p_quantity);

  UPDATE items
  SET quantity_in_stock = v_after,
      quantity_lost = COALESCE(quantity_lost, 0) + p_quantity
  WHERE id = p_item_id;

  RETURN QUERY SELECT v_before, v_after, v_price;
END;
$$;

-- RPC to atomically decrement quantity_in_stock for consumed items
CREATE OR REPLACE FUNCTION public.atomic_item_consumed(
  p_item_id UUID,
  p_quantity INT
)
RETURNS TABLE(quantity_before INT, quantity_after INT, unit_price NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INT;
  v_after INT;
  v_price NUMERIC;
BEGIN
  SELECT i.quantity_in_stock, i.unit_price
  INTO v_before, v_price
  FROM items i
  WHERE i.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  v_after := GREATEST(0, v_before - p_quantity);

  UPDATE items
  SET quantity_in_stock = v_after
  WHERE id = p_item_id;

  RETURN QUERY SELECT v_before, v_after, v_price;
END;
$$;

-- RPC to atomically move stock to laundry
CREATE OR REPLACE FUNCTION public.atomic_item_to_laundry(
  p_item_id UUID,
  p_quantity INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock INT;
  v_actual_deduct INT;
BEGIN
  SELECT quantity_in_stock INTO v_stock
  FROM items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  v_actual_deduct := LEAST(p_quantity, COALESCE(v_stock, 0));

  UPDATE items
  SET quantity_in_laundry = COALESCE(quantity_in_laundry, 0) + p_quantity,
      quantity_in_stock = GREATEST(0, COALESCE(quantity_in_stock, 0) - v_actual_deduct)
  WHERE id = p_item_id;
END;
$$;
