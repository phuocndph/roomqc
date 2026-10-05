-- Keep the existing business logic but put an authenticated, tenant-scoped
-- boundary in front of every client-callable SECURITY DEFINER write RPC.

CREATE OR REPLACE FUNCTION public.assert_rpc_hotel(
  p_tenant_id uuid,
  p_hotel_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_hotel_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.hotels h
       WHERE h.id = p_hotel_id AND h.tenant_id = p_tenant_id
     ) THEN
    RAISE EXCEPTION 'HOTEL_MISMATCH' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_rpc_items(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(item_id uuid, quantity integer)
  LOOP
    IF v_item.item_id IS NULL OR v_item.quantity IS NULL
       OR v_item.quantity <= 0 OR v_item.quantity > 1000000 THEN
      RAISE EXCEPTION 'INVALID_ITEM_QUANTITY' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = v_item.item_id
        AND i.tenant_id = p_tenant_id
        AND i.hotel_id = p_hotel_id
    ) THEN
      RAISE EXCEPTION 'ITEM_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_rpc_hotel(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_rpc_items(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_rpc_hotel(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_rpc_items(uuid, uuid, jsonb) TO service_role;

ALTER FUNCTION public.create_inbound_transaction(
  uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text[], text[], text, uuid
) RENAME TO create_inbound_transaction_unchecked;
ALTER FUNCTION public.create_outbound_transaction(
  uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text, text, text[], text[], text, uuid
) RENAME TO create_outbound_transaction_unchecked;
ALTER FUNCTION public.create_laundry_batch_with_items(
  uuid, uuid, uuid, date, date, uuid, text, text, jsonb
) RENAME TO create_laundry_batch_with_items_unchecked;
ALTER FUNCTION public.create_laundry_return_transaction(
  uuid, uuid, text, text, uuid, jsonb, uuid, text
) RENAME TO create_laundry_return_transaction_unchecked;
ALTER FUNCTION public.create_laundry_loss_transaction(
  uuid, uuid, uuid, jsonb, text, uuid, text
) RENAME TO create_laundry_loss_transaction_unchecked;
ALTER FUNCTION public.add_laundry_to_draft_batch(uuid, uuid, uuid)
  RENAME TO add_laundry_to_draft_batch_unchecked;
ALTER FUNCTION public.create_warehouse_transfer(
  uuid, uuid, uuid, uuid, jsonb, text, uuid
) RENAME TO create_warehouse_transfer_unchecked;
ALTER FUNCTION public.create_stock_adjustment(
  uuid, uuid, text, date, uuid, uuid[], uuid[], text
) RENAME TO create_stock_adjustment_unchecked;

CREATE OR REPLACE FUNCTION public.create_inbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_documents text[] DEFAULT NULL,
  p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_to_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF p_to_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_to_warehouse_id AND w.tenant_id = p_tenant_id
      AND w.hotel_id = p_hotel_id AND w.is_active = true
  ) THEN
    RAISE EXCEPTION 'WAREHOUSE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_inbound_transaction_unchecked(
    p_tenant_id, p_hotel_id, p_transaction_category, p_from_location,
    p_to_location, p_created_by, p_items, p_related_type, p_related_id,
    p_documents, p_photos, p_notes, p_to_warehouse_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_outbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_recipient_signature text DEFAULT NULL,
  p_documents text[] DEFAULT NULL,
  p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_from_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF p_from_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_from_warehouse_id AND w.tenant_id = p_tenant_id
      AND w.hotel_id = p_hotel_id AND w.is_active = true
  ) THEN
    RAISE EXCEPTION 'WAREHOUSE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF p_related_type = 'room' AND NOT EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = p_related_id AND r.tenant_id = p_tenant_id AND r.hotel_id = p_hotel_id
  ) THEN
    RAISE EXCEPTION 'ROOM_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF p_related_type = 'supplement_request' AND NOT EXISTS (
    SELECT 1 FROM public.supplement_requests sr
    WHERE sr.id = p_related_id AND sr.tenant_id = p_tenant_id AND sr.hotel_id = p_hotel_id
  ) THEN
    RAISE EXCEPTION 'SUPPLEMENT_REQUEST_MISMATCH' USING ERRCODE = '42501';
  END IF;

  RETURN public.create_outbound_transaction_unchecked(
    p_tenant_id, p_hotel_id, p_transaction_category, p_from_location,
    p_to_location, p_created_by, p_items, p_related_type, p_related_id,
    p_recipient_name, p_recipient_signature, p_documents, p_photos,
    p_notes, p_from_warehouse_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_laundry_batch_with_items(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_vendor_id uuid,
  p_delivery_date date,
  p_expected_return_date date,
  p_delivery_staff_id uuid,
  p_receiver_name text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  -- The selected delivery staff may be different from the user submitting
  -- the form; authenticate the submitter and validate the selected staff
  -- independently.
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, auth.uid(), false);
  IF p_delivery_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_delivery_staff_id AND u.tenant_id = p_tenant_id
      AND (u.hotel_id = p_hotel_id OR EXISTS (
        SELECT 1 FROM public.user_hotels uh
        WHERE uh.user_id = u.id AND uh.hotel_id = p_hotel_id
      )) AND u.status IS DISTINCT FROM 'inactive'
  ) THEN
    RAISE EXCEPTION 'DELIVERY_STAFF_MISMATCH' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF NOT EXISTS (
    SELECT 1 FROM public.laundry_vendors v
    WHERE v.id = p_vendor_id AND v.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'VENDOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_laundry_batch_with_items_unchecked(
    p_tenant_id, p_hotel_id, p_vendor_id, p_delivery_date,
    p_expected_return_date, p_delivery_staff_id, p_receiver_name,
    p_notes, p_items
  );
END;
$$;

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
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF p_related_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.laundry_batches b
    WHERE b.id = p_related_id AND b.tenant_id = p_tenant_id AND b.hotel_id = p_hotel_id
  ) THEN
    RAISE EXCEPTION 'LAUNDRY_BATCH_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_laundry_return_transaction_unchecked(
    p_tenant_id, p_hotel_id, p_from_location, p_to_location,
    p_created_by, p_items, p_related_id, p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_laundry_loss_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_loss_type text,
  p_related_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF p_loss_type NOT IN ('lost', 'damaged') THEN
    RAISE EXCEPTION 'INVALID_LOSS_TYPE' USING ERRCODE = '22023';
  END IF;
  IF p_related_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.laundry_batches b
    WHERE b.id = p_related_id AND b.tenant_id = p_tenant_id AND b.hotel_id = p_hotel_id
  ) THEN
    RAISE EXCEPTION 'LAUNDRY_BATCH_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_laundry_loss_transaction_unchecked(
    p_tenant_id, p_hotel_id, p_created_by, p_items,
    p_loss_type, p_related_id, p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_laundry_to_draft_batch(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_laundry_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, auth.uid(), false);
  IF NOT EXISTS (
    SELECT 1 FROM public.laundry_requests r
    WHERE r.id = p_laundry_request_id AND r.tenant_id = p_tenant_id
      AND r.hotel_id = p_hotel_id
  ) THEN
    RAISE EXCEPTION 'LAUNDRY_REQUEST_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.add_laundry_to_draft_batch_unchecked(
    p_tenant_id, p_hotel_id, p_laundry_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF p_from_warehouse_id IS NULL OR p_to_warehouse_id IS NULL
     OR p_from_warehouse_id = p_to_warehouse_id
     OR NOT EXISTS (
       SELECT 1 FROM public.warehouses w
       WHERE w.id = p_from_warehouse_id AND w.tenant_id = p_tenant_id
         AND w.hotel_id = p_hotel_id AND w.is_active = true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.warehouses w
       WHERE w.id = p_to_warehouse_id AND w.tenant_id = p_tenant_id
         AND w.hotel_id = p_hotel_id AND w.is_active = true
     ) THEN
    RAISE EXCEPTION 'WAREHOUSE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_warehouse_transfer_unchecked(
    p_tenant_id, p_hotel_id, p_from_warehouse_id, p_to_warehouse_id,
    p_items, p_notes, p_created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_stock_adjustment(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_adjustment_type text,
  p_scheduled_date date,
  p_created_by uuid,
  p_assigned_to uuid[],
  p_item_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_item_id uuid;
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);
  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  FOREACH v_item_id IN ARRAY p_item_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = v_item_id AND i.tenant_id = p_tenant_id AND i.hotel_id = p_hotel_id
    ) THEN
      RAISE EXCEPTION 'ITEM_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF p_assigned_to IS NOT NULL THEN
    FOREACH v_user_id IN ARRAY p_assigned_to LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = v_user_id AND u.tenant_id = p_tenant_id
          AND (u.hotel_id = p_hotel_id OR EXISTS (
            SELECT 1 FROM public.user_hotels uh
            WHERE uh.user_id = u.id AND uh.hotel_id = p_hotel_id
          )) AND u.status IS DISTINCT FROM 'inactive'
      ) THEN
        RAISE EXCEPTION 'ASSIGNEE_MISMATCH' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  RETURN public.create_stock_adjustment_unchecked(
    p_tenant_id, p_hotel_id, p_adjustment_type, p_scheduled_date,
    p_created_by, p_assigned_to, p_item_ids, p_notes
  );
END;
$$;

ALTER FUNCTION public.record_booking_payment(
  uuid, uuid, uuid, numeric, text, text, jsonb, numeric
) RENAME TO record_booking_payment_unchecked;
ALTER FUNCTION public.confirm_booking_payment_manual(uuid, uuid, numeric, numeric)
  RENAME TO confirm_booking_payment_manual_unchecked;
ALTER FUNCTION public.update_room_status_safe(uuid, text, timestamptz)
  RENAME TO update_room_status_safe_unchecked;

CREATE OR REPLACE FUNCTION public.record_booking_payment(
  p_booking_id uuid,
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT b.tenant_id, b.hotel_id INTO v_booking
  FROM public.room_bookings b
  WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.tenant_id IS DISTINCT FROM p_tenant_id
     OR v_booking.hotel_id IS DISTINCT FROM p_hotel_id THEN
    RAISE EXCEPTION 'BOOKING_MISMATCH' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, auth.uid(), false);
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  RETURN public.record_booking_payment_unchecked(
    p_booking_id, p_tenant_id, p_hotel_id, p_amount, p_payment_method,
    p_transaction_reference, p_metadata, p_total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_booking_payment_manual(
  p_payment_id uuid,
  p_booking_id uuid,
  p_amount numeric,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT bp.tenant_id, bp.hotel_id, bp.booking_id
    INTO v_payment
  FROM public.booking_payments bp
  WHERE bp.id = p_payment_id;
  IF NOT FOUND OR v_payment.booking_id IS DISTINCT FROM p_booking_id THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_rpc_actor(v_payment.tenant_id, v_payment.hotel_id, auth.uid(), false);
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  RETURN public.confirm_booking_payment_manual_unchecked(
    p_payment_id, p_booking_id, p_amount, p_total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_room_status_safe(
  p_room_id uuid,
  p_new_status text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room record;
BEGIN
  SELECT r.tenant_id, r.hotel_id INTO v_room
  FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_room.tenant_id, v_room.hotel_id, auth.uid(), false);
  IF p_new_status IS NULL OR p_new_status NOT IN (
    'available', 'occupied', 'dirty', 'cleaning', 'maintenance',
    'out_of_order', 'out_of_service', 'inspected', 'reserved', 'blocked'
  ) THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS' USING ERRCODE = '22023';
  END IF;
  RETURN public.update_room_status_safe_unchecked(
    p_room_id, p_new_status, p_expected_updated_at
  );
END;
$$;

ALTER FUNCTION public.confirm_receive_order(uuid, uuid, jsonb)
  RENAME TO confirm_receive_order_unchecked;
ALTER FUNCTION public.confirm_room_delivery(uuid, uuid)
  RENAME TO confirm_room_delivery_unchecked;
ALTER FUNCTION public.undo_room_delivery_confirmation(uuid, uuid)
  RENAME TO undo_room_delivery_confirmation_unchecked;
ALTER FUNCTION public.close_route_if_complete(uuid, uuid)
  RENAME TO close_route_if_complete_unchecked;
ALTER FUNCTION public.mark_cannot_access(uuid, text, text, uuid)
  RENAME TO mark_cannot_access_unchecked;

CREATE OR REPLACE FUNCTION public.assert_distribution_actor(
  p_room_order_id uuid,
  p_actor_id uuid,
  OUT tenant_id uuid,
  OUT hotel_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
BEGIN
  SELECT o.tenant_id, o.hotel_id, o.assigned_to
    INTO v_order
  FROM public.distribution_order_rooms r
  JOIN public.distribution_orders o ON o.id = r.distribution_order_id
  WHERE r.id = p_room_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_order.tenant_id, v_order.hotel_id, p_actor_id, false);
  IF v_order.assigned_to IS NOT NULL
     AND p_actor_id IS NOT NULL
     AND v_order.assigned_to IS DISTINCT FROM p_actor_id
     AND NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'ROUTE_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  tenant_id := v_order.tenant_id;
  hotel_id := v_order.hotel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_room_delivery(
  p_room_order_id uuid,
  p_confirmed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
BEGIN
  PERFORM public.assert_distribution_actor(p_room_order_id, p_confirmed_by);
  RETURN public.confirm_room_delivery_unchecked(p_room_order_id, p_confirmed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(
  p_distribution_order_room_id uuid,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
BEGIN
  PERFORM public.assert_distribution_actor(
    p_distribution_order_room_id, p_performed_by
  );
  RETURN public.undo_room_delivery_confirmation_unchecked(
    p_distribution_order_room_id, p_performed_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_cannot_access(
  p_room_order_id uuid,
  p_exception_type text,
  p_exception_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  PERFORM public.assert_distribution_actor(p_room_order_id, v_actor);
  RETURN public.mark_cannot_access_unchecked(
    p_room_order_id, p_exception_type, p_exception_reason, v_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_route_if_complete(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  SELECT o.tenant_id, o.hotel_id, o.assigned_to INTO v_order
  FROM public.distribution_orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_order.tenant_id, v_order.hotel_id, v_actor, false);
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to IS DISTINCT FROM v_actor
     AND NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'ROUTE_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.close_route_if_complete_unchecked(p_order_id, v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_receive_order(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_adjustments jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  SELECT o.tenant_id, o.hotel_id, o.assigned_to INTO v_order
  FROM public.distribution_orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_order.tenant_id, v_order.hotel_id, v_actor, false);
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to IS DISTINCT FROM v_actor
     AND NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'ROUTE_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.confirm_receive_order_unchecked(p_order_id, v_actor, p_adjustments);
END;
$$;

ALTER FUNCTION public.setup_room_initial(uuid, uuid, boolean)
  RENAME TO setup_room_initial_unchecked;
ALTER FUNCTION public.apply_room_standards(uuid, uuid)
  RENAME TO apply_room_standards_unchecked;
ALTER FUNCTION public.approve_tenant(uuid, uuid)
  RENAME TO approve_tenant_unchecked;
ALTER FUNCTION public.create_booking_v2(jsonb, jsonb)
  RENAME TO create_booking_v2_unchecked;

CREATE OR REPLACE FUNCTION public.setup_room_initial(
  p_room_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reset_quantities boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room record;
  v_actor uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT r.tenant_id, r.hotel_id INTO v_room
  FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_room.tenant_id, v_room.hotel_id, v_actor, false);
  RETURN public.setup_room_initial_unchecked(p_room_id, v_actor, p_reset_quantities);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_room_standards(
  p_room_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room record;
  v_actor uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT r.tenant_id, r.hotel_id INTO v_room
  FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_room.tenant_id, v_room.hotel_id, v_actor, false);
  RETURN public.apply_room_standards_unchecked(p_room_id, v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tenant(
  p_tenant_id uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.rpc_request_is_trusted()
     AND (p_admin_id IS NULL OR auth.uid() IS DISTINCT FROM p_admin_id
          OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE' USING ERRCODE = '42501';
  END IF;
  RETURN public.approve_tenant_unchecked(p_tenant_id, p_admin_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_booking_v2(
  p_bookings jsonb,
  p_guest jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking jsonb;
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_room_id uuid;
BEGIN
  IF p_bookings IS NULL OR jsonb_typeof(p_bookings) <> 'array'
     OR jsonb_array_length(p_bookings) = 0 THEN
    RAISE EXCEPTION 'BOOKINGS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := NULLIF(p_bookings -> 0 ->> 'tenant_id', '')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  FOR v_booking IN SELECT value FROM jsonb_array_elements(p_bookings)
  LOOP
    IF (v_booking ->> 'tenant_id')::uuid IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;
    v_hotel_id := NULLIF(v_booking ->> 'hotel_id', '')::uuid;
    v_room_id := NULLIF(v_booking ->> 'room_id', '')::uuid;
    PERFORM public.assert_rpc_hotel(v_tenant_id, v_hotel_id);
    IF v_room_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = v_room_id AND r.tenant_id = v_tenant_id AND r.hotel_id = v_hotel_id
    ) THEN
      RAISE EXCEPTION 'ROOM_MISMATCH' USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_rpc_actor(v_tenant_id, v_hotel_id, auth.uid(), false);
  END LOOP;

  RETURN public.create_booking_v2_unchecked(p_bookings, p_guest);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_distribution_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_distribution_actor(uuid, uuid)
  TO service_role;

-- The old implementations are callable only by trusted server-side code.
REVOKE ALL ON FUNCTION public.create_inbound_transaction_unchecked(
  uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text[], text[], text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_outbound_transaction_unchecked(
  uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text, text, text[], text[], text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_laundry_batch_with_items_unchecked(
  uuid, uuid, uuid, date, date, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_laundry_return_transaction_unchecked(
  uuid, uuid, text, text, uuid, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_laundry_loss_transaction_unchecked(
  uuid, uuid, uuid, jsonb, text, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_laundry_to_draft_batch_unchecked(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_warehouse_transfer_unchecked(
  uuid, uuid, uuid, uuid, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stock_adjustment_unchecked(
  uuid, uuid, text, date, uuid, uuid[], uuid[], text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_booking_payment_unchecked(
  uuid, uuid, uuid, numeric, text, text, jsonb, numeric
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_booking_payment_manual_unchecked(
  uuid, uuid, numeric, numeric
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_room_status_safe_unchecked(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_receive_order_unchecked(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_room_delivery_unchecked(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_room_delivery_confirmation_unchecked(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_route_if_complete_unchecked(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_cannot_access_unchecked(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.setup_room_initial_unchecked(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_room_standards_unchecked(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_tenant_unchecked(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_booking_v2_unchecked(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_inbound_transaction(
  uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text[], text[], text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_outbound_transaction(
  uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text, text, text[], text[], text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_laundry_batch_with_items(
  uuid, uuid, uuid, date, date, uuid, text, text, jsonb
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_laundry_return_transaction(
  uuid, uuid, text, text, uuid, jsonb, uuid, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_laundry_loss_transaction(
  uuid, uuid, uuid, jsonb, text, uuid, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_laundry_to_draft_batch(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_warehouse_transfer(
  uuid, uuid, uuid, uuid, jsonb, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_stock_adjustment(
  uuid, uuid, text, date, uuid, uuid[], uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_booking_payment(
  uuid, uuid, uuid, numeric, text, text, jsonb, numeric
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment_manual(uuid, uuid, numeric, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_room_status_safe(uuid, text, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_receive_order(uuid, uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_room_delivery(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_room_delivery_confirmation(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_route_if_complete(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_cannot_access(uuid, text, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.setup_room_initial(uuid, uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_room_standards(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_tenant(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_v2(jsonb, jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
