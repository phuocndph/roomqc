-- Security hardening: set stable search_path for trigger function
CREATE OR REPLACE FUNCTION public.stock_adjustment_items_apply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_before_stock numeric;
  v_after_stock numeric;
  v_delta numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    SELECT i.tenant_id,
           i.hotel_id,
           COALESCE(i.quantity_in_stock, 0)
      INTO v_tenant_id,
           v_hotel_id,
           v_before_stock
    FROM public.items i
    WHERE i.id = NEW.item_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_after_stock := COALESCE(NEW.actual_quantity, v_before_stock);
    v_delta := v_after_stock - v_before_stock;

    IF v_delta <> 0 THEN
      INSERT INTO public.inventory_transactions (
        tenant_id,
        hotel_id,
        item_id,
        transaction_type,
        transaction_category,
        quantity,
        quantity_before,
        quantity_after,
        created_by,
        related_type,
        related_id,
        notes
      )
      SELECT
        v_tenant_id,
        v_hotel_id,
        NEW.item_id,
        CASE WHEN v_delta > 0 THEN 'in' ELSE 'out' END,
        'adjustment',
        ABS(v_delta),
        v_before_stock,
        v_after_stock,
        sa.created_by,
        'stock_adjustment',
        NEW.adjustment_id,
        'Điều chỉnh từ kiểm kê: ' || COALESCE(NEW.discrepancy_reason, '')
      FROM public.stock_adjustments sa
      WHERE sa.id = NEW.adjustment_id;

      UPDATE public.items
      SET
        quantity_in_stock = v_after_stock,
        quantity_total = v_after_stock
          + COALESCE(quantity_in_use, 0)
          + COALESCE(quantity_in_laundry, 0)
          + COALESCE(quantity_damaged, 0)
          + COALESCE(quantity_lost, 0)
          + COALESCE(quantity_pending, 0)
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;