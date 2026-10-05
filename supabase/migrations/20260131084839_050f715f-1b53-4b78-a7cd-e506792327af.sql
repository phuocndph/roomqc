-- Fix confirm_receive_order to also update batch status
CREATE OR REPLACE FUNCTION public.confirm_receive_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order_status text;
  v_assigned_to uuid;
BEGIN
  -- Get current user
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Get order info
  SELECT status, assigned_to INTO v_order_status, v_assigned_to
  FROM distribution_orders
  WHERE id = p_order_id;

  IF v_order_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Check if user is assigned
  IF v_assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'NOT_ASSIGNED';
  END IF;

  -- Check status
  IF v_order_status != 'released' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Order must be in released status';
  END IF;

  -- Update order status to in_progress
  UPDATE distribution_orders
  SET status = 'in_progress',
      received_at = now(),
      received_by = v_actor_id,
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = p_order_id;

  -- Update all batches to 'received' (FIX: This was missing!)
  UPDATE distribution_order_batches
  SET status = 'received',
      received_at = now(),
      received_by = v_actor_id,
      updated_at = now()
  WHERE distribution_order_id = p_order_id
    AND status = 'handed_over';

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_status', 'in_progress'
  );
END;
$$;

-- Hotfix: Fix stuck orders where order is in_progress but batches are still handed_over
UPDATE distribution_order_batches
SET status = 'received',
    received_at = COALESCE(received_at, now()),
    updated_at = now()
WHERE distribution_order_id IN (
  SELECT id FROM distribution_orders WHERE status = 'in_progress'
)
AND status = 'handed_over';