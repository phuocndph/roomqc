-- 1. Cập nhật constraint để cho phép status 'draft'
ALTER TABLE public.laundry_batches 
DROP CONSTRAINT IF EXISTS laundry_batches_status_check;

ALTER TABLE public.laundry_batches
ADD CONSTRAINT laundry_batches_status_check 
CHECK (status IN ('draft', 'delivered', 'washing', 'ready', 'received', 'stocked', 'cancelled'));

-- 2. Sửa RPC add_laundry_to_draft_batch với column name đúng
CREATE OR REPLACE FUNCTION public.add_laundry_to_draft_batch(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_laundry_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch_id UUID;
  v_today DATE := CURRENT_DATE;
  v_batch_code TEXT;
  v_request RECORD;
  v_item RECORD;
  v_existing_item_id UUID;
BEGIN
  -- Get the laundry request
  SELECT * INTO v_request
  FROM public.laundry_requests
  WHERE id = p_laundry_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu giặt';
  END IF;

  IF v_request.status = 'added_to_batch' THEN
    RAISE EXCEPTION 'Yêu cầu giặt đã được thêm vào lô khác';
  END IF;

  -- Find or create draft batch for today
  SELECT id INTO v_batch_id
  FROM public.laundry_batches
  WHERE tenant_id = p_tenant_id
    AND hotel_id = p_hotel_id
    AND status = 'draft'
    AND DATE(created_at) = v_today
  LIMIT 1;

  IF v_batch_id IS NULL THEN
    -- Generate batch code
    SELECT 'LB-' || TO_CHAR(v_today, 'YYMMDD') || '-' || 
           LPAD((COUNT(*) + 1)::TEXT, 3, '0')
    INTO v_batch_code
    FROM public.laundry_batches
    WHERE tenant_id = p_tenant_id
      AND DATE(created_at) = v_today;

    -- Create new draft batch
    INSERT INTO public.laundry_batches (
      tenant_id, hotel_id, batch_code, status, total_items, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_batch_code, 'draft', 0, 'Tự động tạo từ kiểm tra phòng'
    )
    RETURNING id INTO v_batch_id;
  END IF;

  -- Add items to batch
  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_request.items) 
    AS x(item_id UUID, item_name TEXT, quantity INTEGER, item_code TEXT)
  LOOP
    -- Check if item already exists in batch
    SELECT id INTO v_existing_item_id
    FROM public.laundry_batch_items
    WHERE batch_id = v_batch_id AND item_id = v_item.item_id;

    IF v_existing_item_id IS NOT NULL THEN
      -- Update existing item quantity
      UPDATE public.laundry_batch_items
      SET quantity_delivered = quantity_delivered + v_item.quantity
      WHERE id = v_existing_item_id;
    ELSE
      -- Insert new item
      INSERT INTO public.laundry_batch_items (
        batch_id, item_id, quantity_delivered
      ) VALUES (
        v_batch_id, v_item.item_id, v_item.quantity
      );
    END IF;
  END LOOP;

  -- Update batch total
  UPDATE public.laundry_batches
  SET total_items = (
    SELECT COALESCE(SUM(quantity_delivered), 0)
    FROM public.laundry_batch_items
    WHERE batch_id = v_batch_id
  ),
  updated_at = now()
  WHERE id = v_batch_id;

  -- Update laundry request status
  UPDATE public.laundry_requests
  SET status = 'added_to_batch',
      laundry_batch_id = v_batch_id,
      added_at = now(),
      updated_at = now()
  WHERE id = p_laundry_request_id;

  RETURN v_batch_id;
END;
$$;