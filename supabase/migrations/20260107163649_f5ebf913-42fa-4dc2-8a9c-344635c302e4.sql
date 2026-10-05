-- Create RPC to safely delete transaction and reverse inventory changes
CREATE OR REPLACE FUNCTION public.delete_inventory_transaction(
  p_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_hours_since_creation NUMERIC;
BEGIN
  -- Get transaction details
  SELECT * INTO v_transaction
  FROM inventory_transactions
  WHERE id = p_transaction_id;
  
  IF v_transaction IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy giao dịch');
  END IF;
  
  -- Check 24-hour limit
  v_hours_since_creation := EXTRACT(EPOCH FROM (NOW() - v_transaction.created_at)) / 3600;
  
  IF v_hours_since_creation > 24 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy giao dịch trong vòng 24 giờ');
  END IF;
  
  -- Reverse the inventory change based on transaction type
  IF v_transaction.transaction_type = 'inbound' THEN
    -- Inbound was adding to stock, so we subtract
    UPDATE items
    SET 
      quantity_in_stock = GREATEST(0, COALESCE(quantity_in_stock, 0) - v_transaction.quantity),
      quantity_total = GREATEST(0, COALESCE(quantity_total, 0) - v_transaction.quantity),
      updated_at = NOW()
    WHERE id = v_transaction.item_id;
    
  ELSIF v_transaction.transaction_type = 'outbound' THEN
    -- Outbound was removing from stock, so we add back
    UPDATE items
    SET 
      quantity_in_stock = COALESCE(quantity_in_stock, 0) + v_transaction.quantity,
      quantity_total = COALESCE(quantity_total, 0) + v_transaction.quantity,
      updated_at = NOW()
    WHERE id = v_transaction.item_id;
  END IF;
  
  -- Delete the transaction record
  DELETE FROM inventory_transactions WHERE id = p_transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_transaction.item_id,
    'reversed_quantity', v_transaction.quantity,
    'transaction_type', v_transaction.transaction_type
  );
END;
$$;