
-- ============================================================================
-- Phase 1: Lean Replenish + Delivery RPC foundation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- submit_replenish_lean
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_replenish_lean(
  _room_id uuid,
  _items jsonb DEFAULT '[]'::jsonb,
  _cleaning_requested boolean DEFAULT false,
  _notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}'::text[],
  _task_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_tenant_id   uuid;
  v_hotel_id    uuid;
  v_check_id    uuid;
  v_item        jsonb;
  v_issue_count int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Resolve tenant + hotel from room, ensure same tenant as caller
  SELECT r.tenant_id, r.hotel_id
    INTO v_tenant_id, v_hotel_id
  FROM rooms r
  WHERE r.id = _room_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_user_id AND u.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  -- Insert main room_check row
  INSERT INTO room_checks (
    tenant_id, hotel_id, room_id, checked_by, check_type, check_mode,
    started_at, checked_at, notes, photos,
    summary_ok_count, summary_issue_count, status, task_id
  ) VALUES (
    v_tenant_id, v_hotel_id, _room_id, v_user_id, 'replenish', 'lean',
    now(), now(), _notes, COALESCE(_photos, '{}'::text[]),
    0, 0, 'completed', _task_id
  )
  RETURNING id INTO v_check_id;

  -- Insert issues per replenish item (missing / replaced)
  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
    LOOP
      INSERT INTO room_check_issues (
        tenant_id, hotel_id, room_check_id, room_id,
        item_id, item_name, bucket, ui_action, sub_reason,
        quantity, photos, notes, source, client_issue_id, extra
      ) VALUES (
        v_tenant_id, v_hotel_id, v_check_id, _room_id,
        NULLIF(v_item->>'item_id','')::uuid,
        COALESCE(v_item->>'item_name', ''),
        COALESCE(v_item->>'bucket', 'missing_replace'),
        COALESCE(v_item->>'ui_action', 'replenish'),
        v_item->>'sub_reason',
        COALESCE((v_item->>'qty')::numeric, 1),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'photos')), '{}'::text[]),
        v_item->>'notes',
        'replenish_lean',
        v_item->>'client_issue_id',
        COALESCE(v_item->'extra', '{}'::jsonb)
      );
      v_issue_count := v_issue_count + 1;
    END LOOP;
  END IF;

  -- Update summary counts
  UPDATE room_checks
     SET summary_issue_count = v_issue_count,
         summary_ok_count    = GREATEST(0, COALESCE((_items->>'__ok_count')::int, 0))
   WHERE id = v_check_id;

  -- Complete linked task (if any) via state machine RPC
  IF _task_id IS NOT NULL THEN
    BEGIN
      PERFORM public.transition_task_status(_task_id, 'completed', 'replenish_lean', false);
    EXCEPTION WHEN OTHERS THEN
      -- task transition lỗi không rollback check; ghi audit để theo dõi
      PERFORM public.log_state_transition(
        v_tenant_id, v_hotel_id, 'housekeeping_tasks', _task_id,
        'replenish_task_skip', NULL, NULL, SQLERRM, jsonb_build_object('check_id', v_check_id)
      );
    END;
  END IF;

  -- Audit
  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'replenish_submit_lean', NULL, 'completed', NULL,
    jsonb_build_object(
      'room_id', _room_id,
      'issue_count', v_issue_count,
      'cleaning_requested', _cleaning_requested,
      'task_id', _task_id
    )
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'room_id', _room_id,
    'issue_count', v_issue_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_replenish_lean(uuid, jsonb, boolean, text, text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_replenish_lean(uuid, jsonb, boolean, text, text[], uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- submit_delivery_lean
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_delivery_lean(
  _room_id uuid,
  _distribution_order_room_id uuid,
  _items_actual jsonb DEFAULT NULL,    -- reserved; forward to confirm_warehouse_delivery
  _notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}'::text[],
  _task_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_tenant_id  uuid;
  v_hotel_id   uuid;
  v_dor_room   uuid;
  v_check_id   uuid;
  v_confirm    jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Validate distribution_order_room belongs to a tenant the user can access
  SELECT r.tenant_id, r.hotel_id, dor.id
    INTO v_tenant_id, v_hotel_id, v_dor_room
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.id = _distribution_order_room_id
    AND dor.room_id = _room_id;

  IF v_dor_room IS NULL THEN
    RAISE EXCEPTION 'DELIVERY_ORDER_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_user_id AND u.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  -- 1) Record room_check (audit-of-record for the delivery acceptance)
  INSERT INTO room_checks (
    tenant_id, hotel_id, room_id, checked_by, check_type, check_mode,
    started_at, checked_at, notes, photos,
    summary_ok_count, summary_issue_count, status, task_id
  ) VALUES (
    v_tenant_id, v_hotel_id, _room_id, v_user_id, 'delivery', 'lean',
    now(), now(), _notes, COALESCE(_photos, '{}'::text[]),
    0, 0, 'completed', _task_id
  )
  RETURNING id INTO v_check_id;

  -- 2) Forward to existing confirm RPC to bump stock + status
  IF _items_actual IS NOT NULL AND jsonb_typeof(_items_actual) = 'array' THEN
    v_confirm := public.confirm_warehouse_delivery(
      _distribution_order_room_id, v_user_id, _items_actual
    );
  ELSE
    v_confirm := public.confirm_delivery_from_room_check(
      _distribution_order_room_id, v_user_id
    );
  END IF;

  -- 3) Complete linked task if provided
  IF _task_id IS NOT NULL THEN
    BEGIN
      PERFORM public.transition_task_status(_task_id, 'completed', 'delivery_lean', false);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.log_state_transition(
        v_tenant_id, v_hotel_id, 'housekeeping_tasks', _task_id,
        'delivery_task_skip', NULL, NULL, SQLERRM, jsonb_build_object('check_id', v_check_id)
      );
    END;
  END IF;

  -- 4) Audit
  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'delivery_submit_lean', NULL, 'completed', NULL,
    jsonb_build_object(
      'room_id', _room_id,
      'distribution_order_room_id', _distribution_order_room_id,
      'confirm_result', v_confirm,
      'task_id', _task_id
    )
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'room_id', _room_id,
    'distribution_order_room_id', _distribution_order_room_id,
    'confirm', v_confirm
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_delivery_lean(uuid, uuid, jsonb, text, text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_delivery_lean(uuid, uuid, jsonb, text, text[], uuid) TO authenticated;
