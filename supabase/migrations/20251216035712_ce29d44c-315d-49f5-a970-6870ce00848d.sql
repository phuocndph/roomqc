-- Fix: create_laundry_return_transaction must preserve items_quantities_valid constraint
-- Approach: always keep quantity_total aligned with bucket sums.
-- If quantity_in_laundry is lower than the returned quantity (data previously inconsistent), we auto-repair
-- by increasing quantity_total by the difference so that total = sum(buckets).

CREATE OR REPLACE FUNCTION public.create_laundry_return_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_code text;
  v_item jsonb;
  v_item_id uuid;
  v_quantity integer;

  v_stock integer;
  v_laundry integer;
  v_in_use integer;
  v_damaged integer;
  v_lost integer;
  v_pending integer;
  v_total integer;
  v_unit_price numeric;

  v_laundry_decrease integer;
  v_new_stock integer;
  v_new_laundry integer;
  v_new_total integer;

  v_results jsonb := '[]'::jsonb;
BEGIN
  v_transaction_code := 'LR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || lpad(floor(random() * 10000)::text, 4, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    SELECT
      COALESCE(quantity_in_stock, 0),
      COALESCE(quantity_in_laundry, 0),
      COALESCE(quantity_in_use, 0),
      COALESCE(quantity_damaged, 0),
      COALESCE(quantity_lost, 0),
      COALESCE(quantity_pending, 0),
      COALESCE(quantity_total, 0),
      COALESCE(unit_price, 0)
    INTO v_stock, v_laundry, v_in_use, v_damaged, v_lost, v_pending, v_total, v_unit_price
    FROM items
    WHERE id = v_item_id;

    -- Decrease laundry only as much as available (auto-repair if laundry bucket is missing)
    v_laundry_decrease := LEAST(v_laundry, v_quantity);

    v_new_stock := v_stock + v_quantity;
    v_new_laundry := v_laundry - v_laundry_decrease;

    -- Keep total aligned with bucket sum change
    -- delta_sum = +v_quantity (stock) - v_laundry_decrease (laundry)
    v_new_total := v_total + (v_quantity - v_laundry_decrease);

    UPDATE items
    SET
      quantity_in_stock = v_new_stock,
      quantity_in_laundry = v_new_laundry,
      quantity_total = v_new_total,
      updated_at = now()
    WHERE id = v_item_id;

    INSERT INTO inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_code,
      transaction_type,
      transaction_category,
      quantity,
      quantity_before,
      quantity_after,
      unit_price,
      total_value,
      from_location,
      to_location,
      related_type,
      related_id,
      notes,
      created_by,
      transaction_date
    ) VALUES (
      p_tenant_id,
      p_hotel_id,
      v_item_id,
      v_transaction_code,
      'in',
      'return',
      v_quantity,
      v_stock,
      v_new_stock,
      v_unit_price,
      v_quantity * v_unit_price,
      p_from_location,
      p_to_location,
      'laundry_batch',
      p_related_id,
      COALESCE(p_notes, 'Nhập kho từ giặt'),
      p_created_by,
      now()
    );

    v_results := v_results || jsonb_build_object(
      'item_id', v_item_id,
      'quantity', v_quantity,
      'laundry_before', v_laundry,
      'laundry_decrease', v_laundry_decrease,
      'new_stock', v_new_stock,
      'new_laundry', v_new_laundry,
      'new_total', v_new_total
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'items_processed', v_results
  );
END;
$$;


-- Fix: create_laundry_loss_transaction must NOT reduce quantity_total (lost/damaged are included in total by constraint)
-- We move from laundry -> lost/damaged. If laundry is insufficient (data inconsistent), we auto-repair by increasing total.

CREATE OR REPLACE FUNCTION public.create_laundry_loss_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_loss_type text, -- 'lost' hoặc 'damaged'
  p_related_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_code text;
  v_item jsonb;
  v_item_id uuid;
  v_quantity integer;

  v_laundry integer;
  v_lost integer;
  v_damaged integer;
  v_total integer;
  v_unit_price numeric;

  v_laundry_decrease integer;
  v_new_laundry integer;
  v_new_total integer;

  v_results jsonb := '[]'::jsonb;
BEGIN
  v_transaction_code := 'LL-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || lpad(floor(random() * 10000)::text, 4, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    SELECT
      COALESCE(quantity_in_laundry, 0),
      COALESCE(quantity_lost, 0),
      COALESCE(quantity_damaged, 0),
      COALESCE(quantity_total, 0),
      COALESCE(unit_price, 0)
    INTO v_laundry, v_lost, v_damaged, v_total, v_unit_price
    FROM items
    WHERE id = v_item_id;

    v_laundry_decrease := LEAST(v_laundry, v_quantity);
    v_new_laundry := v_laundry - v_laundry_decrease;

    -- delta_sum = +v_quantity (lost/damaged) - v_laundry_decrease (laundry)
    v_new_total := v_total + (v_quantity - v_laundry_decrease);

    IF p_loss_type = 'lost' THEN
      UPDATE items
      SET
        quantity_in_laundry = v_new_laundry,
        quantity_lost = v_lost + v_quantity,
        quantity_total = v_new_total,
        updated_at = now()
      WHERE id = v_item_id;
    ELSE
      UPDATE items
      SET
        quantity_in_laundry = v_new_laundry,
        quantity_damaged = v_damaged + v_quantity,
        quantity_total = v_new_total,
        updated_at = now()
      WHERE id = v_item_id;
    END IF;

    INSERT INTO inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_code,
      transaction_type,
      transaction_category,
      quantity,
      quantity_before,
      quantity_after,
      unit_price,
      total_value,
      from_location,
      to_location,
      related_type,
      related_id,
      notes,
      created_by,
      transaction_date
    ) VALUES (
      p_tenant_id,
      p_hotel_id,
      v_item_id,
      v_transaction_code,
      'out',
      'laundry',
      v_quantity,
      v_laundry,
      v_new_laundry,
      v_unit_price,
      v_quantity * v_unit_price,
      'Đơn vị giặt',
      CASE WHEN p_loss_type = 'lost' THEN 'Mất mát' ELSE 'Hư hỏng' END,
      'laundry_batch',
      p_related_id,
      COALESCE(p_notes, 'Items ' || p_loss_type || ' từ giặt'),
      p_created_by,
      now()
    );

    v_results := v_results || jsonb_build_object(
      'item_id', v_item_id,
      'quantity', v_quantity,
      'loss_type', p_loss_type,
      'laundry_before', v_laundry,
      'laundry_decrease', v_laundry_decrease,
      'new_laundry', v_new_laundry,
      'new_total', v_new_total
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'items_processed', v_results
  );
END;
$$;