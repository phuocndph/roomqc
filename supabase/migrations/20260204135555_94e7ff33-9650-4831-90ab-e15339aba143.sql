-- RPC to send a draft batch: update with vendor info and change status to delivered
CREATE OR REPLACE FUNCTION public.send_draft_batch(
  p_batch_id UUID,
  p_vendor_id UUID,
  p_delivery_date DATE,
  p_expected_return_date DATE,
  p_delivery_staff_id UUID,
  p_receiver_name TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_vendor RECORD;
  v_price_per_kg NUMERIC;
  v_estimated_cost NUMERIC;
BEGIN
  -- Get batch (must be draft)
  SELECT * INTO v_batch FROM laundry_batches WHERE id = p_batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy lô giặt';
  END IF;
  
  IF v_batch.status != 'draft' THEN
    RAISE EXCEPTION 'Chỉ có thể gửi lô giặt ở trạng thái nháp. Trạng thái hiện tại: %', v_batch.status;
  END IF;
  
  -- Check if batch has items
  IF COALESCE(v_batch.total_items, 0) = 0 THEN
    RAISE EXCEPTION 'Lô giặt chưa có đồ. Vui lòng thêm đồ giặt trước khi gửi.';
  END IF;
  
  -- Get vendor for pricing
  SELECT * INTO v_vendor FROM laundry_vendors WHERE id = p_vendor_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn vị giặt';
  END IF;
  
  -- Calculate estimated cost from vendor contract info
  v_price_per_kg := COALESCE((v_vendor.contract_info->>'price_per_kg')::numeric, 0);
  v_estimated_cost := COALESCE(v_batch.total_weight_kg, 0) * v_price_per_kg;
  
  -- Update batch with vendor info and change status
  UPDATE laundry_batches SET
    vendor_id = p_vendor_id,
    delivery_date = p_delivery_date,
    expected_return_date = p_expected_return_date,
    delivery_staff_id = p_delivery_staff_id,
    receiver_name = p_receiver_name,
    notes = COALESCE(p_notes, notes),
    estimated_cost = v_estimated_cost,
    status = 'delivered',
    updated_at = now()
  WHERE id = p_batch_id;
  
  -- Update vendor stats
  UPDATE laundry_vendors SET
    total_orders = COALESCE(total_orders, 0) + 1,
    total_value = COALESCE(total_value, 0) + v_estimated_cost,
    updated_at = now()
  WHERE id = p_vendor_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'delivered',
    'estimated_cost', v_estimated_cost
  );
END;
$$;