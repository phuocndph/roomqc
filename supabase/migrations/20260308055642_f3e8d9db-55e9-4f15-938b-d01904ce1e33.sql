
-- Update atomic_item_to_laundry to also decrement warehouse_stock
CREATE OR REPLACE FUNCTION public.atomic_item_to_laundry(p_item_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock INT;
  v_actual_deduct INT;
  v_hotel_id UUID;
  v_tenant_id UUID;
  v_default_warehouse_id UUID;
BEGIN
  SELECT quantity_in_stock, hotel_id, tenant_id INTO v_stock, v_hotel_id, v_tenant_id
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

  -- Also decrement warehouse_stock for the default warehouse of this hotel
  SELECT id INTO v_default_warehouse_id
  FROM warehouses
  WHERE hotel_id = v_hotel_id AND tenant_id = v_tenant_id AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_default_warehouse_id IS NOT NULL THEN
    UPDATE warehouse_stock
    SET quantity = GREATEST(0, quantity - v_actual_deduct),
        updated_at = now()
    WHERE warehouse_id = v_default_warehouse_id AND item_id = p_item_id;
  END IF;
END;
$$;

-- Update atomic_item_lost to also decrement warehouse_stock
CREATE OR REPLACE FUNCTION public.atomic_item_lost(p_item_id uuid, p_quantity integer)
RETURNS TABLE(quantity_before integer, quantity_after integer, unit_price numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INT;
  v_after INT;
  v_price NUMERIC;
  v_hotel_id UUID;
  v_tenant_id UUID;
  v_default_warehouse_id UUID;
BEGIN
  SELECT i.quantity_in_stock, i.unit_price, i.hotel_id, i.tenant_id
  INTO v_before, v_price, v_hotel_id, v_tenant_id
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

  -- Also decrement warehouse_stock for the default warehouse
  SELECT id INTO v_default_warehouse_id
  FROM warehouses
  WHERE hotel_id = v_hotel_id AND tenant_id = v_tenant_id AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_default_warehouse_id IS NOT NULL THEN
    UPDATE warehouse_stock
    SET quantity = GREATEST(0, quantity - p_quantity),
        updated_at = now()
    WHERE warehouse_id = v_default_warehouse_id AND item_id = p_item_id;
  END IF;

  RETURN QUERY SELECT v_before, v_after, v_price;
END;
$$;

-- Update atomic_item_consumed to also decrement warehouse_stock
CREATE OR REPLACE FUNCTION public.atomic_item_consumed(p_item_id uuid, p_quantity integer)
RETURNS TABLE(quantity_before integer, quantity_after integer, unit_price numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INT;
  v_after INT;
  v_price NUMERIC;
  v_hotel_id UUID;
  v_tenant_id UUID;
  v_default_warehouse_id UUID;
BEGIN
  SELECT i.quantity_in_stock, i.unit_price, i.hotel_id, i.tenant_id
  INTO v_before, v_price, v_hotel_id, v_tenant_id
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

  -- Also decrement warehouse_stock for the default warehouse
  SELECT id INTO v_default_warehouse_id
  FROM warehouses
  WHERE hotel_id = v_hotel_id AND tenant_id = v_tenant_id AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_default_warehouse_id IS NOT NULL THEN
    UPDATE warehouse_stock
    SET quantity = GREATEST(0, quantity - p_quantity),
        updated_at = now()
    WHERE warehouse_id = v_default_warehouse_id AND item_id = p_item_id;
  END IF;

  RETURN QUERY SELECT v_before, v_after, v_price;
END;
$$;
