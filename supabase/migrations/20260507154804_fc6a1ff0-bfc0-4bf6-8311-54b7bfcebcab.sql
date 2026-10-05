
CREATE OR REPLACE FUNCTION public.submit_room_check_lean(
  _room_id uuid,
  _check_type text,
  _started_at timestamp with time zone,
  _notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}'::text[],
  _items_missing jsonb DEFAULT '[]'::jsonb,
  _items_damaged jsonb DEFAULT '[]'::jsonb,
  _items_lost jsonb DEFAULT '[]'::jsonb,
  _items_consumed jsonb DEFAULT '[]'::jsonb,
  _items_replaced jsonb DEFAULT '[]'::jsonb,
  _items_sent_to_laundry jsonb DEFAULT '[]'::jsonb,
  _task_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_user_tenant uuid;
  v_task_tenant uuid;
  v_last_check timestamptz;
  v_ok_count int;
  v_issue_count int;
  v_minibar_count int;
  v_total_items int;
  v_distinct_issue_items int;
  v_check_id uuid;
  v_req_dl boolean;
  v_req_mr boolean;
  v_req_cc boolean;
  v_missing_item text;
  v_bucket text;
  v_arr jsonb;
  v_entry jsonb;
  v_id_map jsonb := '{}'::jsonb;
  v_new_id uuid;
  v_source_id uuid;
  v_kind text;
  v_client_id text;
  v_source_client_id text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.tenant_id, r.hotel_id INTO v_tenant_id, v_hotel_id
  FROM public.rooms r WHERE r.id = _room_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.tenant_id INTO v_user_tenant FROM public.users u WHERE u.id = v_user_id;
  IF v_user_tenant IS NULL OR v_user_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF _task_id IS NOT NULL THEN
    SELECT t.tenant_id INTO v_task_tenant FROM public.tasks t WHERE t.id = _task_id;
    IF v_task_tenant IS NULL OR v_task_tenant <> v_tenant_id THEN
      RAISE EXCEPTION 'task_tenant_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT
    COALESCE((h.settings->'room_check'->>'photo_required_damaged_lost')::boolean, true),
    COALESCE((h.settings->'room_check'->>'photo_required_missing_replace')::boolean, false),
    COALESCE((h.settings->'room_check'->>'photo_required_consumed_chargeable')::boolean, false)
  INTO v_req_dl, v_req_mr, v_req_cc
  FROM public.hotels h WHERE h.id = v_hotel_id;

  IF v_req_dl THEN
    SELECT e->>'item_name' INTO v_missing_item
    FROM jsonb_array_elements(_items_damaged || _items_lost) e
    WHERE COALESCE(jsonb_array_length(e->'photos'), 0) = 0
    LIMIT 1;
    IF v_missing_item IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:damaged_lost:%', v_missing_item USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_req_mr THEN
    SELECT e->>'item_name' INTO v_missing_item
    FROM jsonb_array_elements(_items_missing || _items_replaced) e
    WHERE COALESCE(jsonb_array_length(e->'photos'), 0) = 0
    LIMIT 1;
    IF v_missing_item IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:missing_replace:%', v_missing_item USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_req_cc THEN
    SELECT e->>'item_name' INTO v_missing_item
    FROM jsonb_array_elements(_items_consumed) e
    WHERE COALESCE((e->>'charge_to_guest')::boolean, false) = true
      AND COALESCE(jsonb_array_length(e->'photos'), 0) = 0
    LIMIT 1;
    IF v_missing_item IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:consumed_chargeable:%', v_missing_item USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT MAX(checked_at) INTO v_last_check
  FROM public.room_checks WHERE room_id = _room_id;
  IF v_last_check IS NOT NULL AND v_last_check > _started_at THEN
    RAISE EXCEPTION 'conflict_room_updated' USING ERRCODE = 'P0001';
  END IF;

  v_issue_count :=
      jsonb_array_length(_items_missing)
    + jsonb_array_length(_items_damaged)
    + jsonb_array_length(_items_lost)
    + jsonb_array_length(_items_consumed)
    + jsonb_array_length(_items_replaced)
    + jsonb_array_length(_items_sent_to_laundry);

  SELECT COUNT(*) INTO v_minibar_count
  FROM jsonb_array_elements(_items_consumed) e
  WHERE COALESCE((e->'extra'->>'minibar')::boolean, false) = true
     OR COALESCE(e->>'ui_action', '') LIKE 'minibar.%';

  SELECT COUNT(*) INTO v_total_items
  FROM public.room_items ri WHERE ri.room_id = _room_id;

  WITH all_buckets AS (
    SELECT e FROM jsonb_array_elements(_items_missing) e
    UNION ALL SELECT e FROM jsonb_array_elements(_items_damaged) e
    UNION ALL SELECT e FROM jsonb_array_elements(_items_lost) e
    UNION ALL SELECT e FROM jsonb_array_elements(_items_consumed) e
    UNION ALL SELECT e FROM jsonb_array_elements(_items_replaced) e
    UNION ALL SELECT e FROM jsonb_array_elements(_items_sent_to_laundry) e
  )
  SELECT COUNT(DISTINCT NULLIF(e->>'item_id','')::uuid) INTO v_distinct_issue_items
  FROM all_buckets
  WHERE COALESCE(e->>'issue_role','primary_issue') = 'primary_issue'
    AND NULLIF(e->>'item_id','') IS NOT NULL;

  v_ok_count := GREATEST(v_total_items - COALESCE(v_distinct_issue_items, 0), 0);

  INSERT INTO public.room_checks (
    id, tenant_id, hotel_id, room_id, checked_by,
    check_type, check_mode, status,
    notes, photos,
    items_missing, items_damaged, items_lost,
    items_consumed, items_replaced, items_sent_to_laundry,
    started_at, checked_at,
    summary_ok_count, summary_issue_count, minibar_count,
    items_complete, task_id
  ) VALUES (
    gen_random_uuid(), v_tenant_id, v_hotel_id, _room_id, v_user_id,
    _check_type, 'lean', 'submitted',
    _notes, _photos,
    _items_missing, _items_damaged, _items_lost,
    _items_consumed, _items_replaced, _items_sent_to_laundry,
    _started_at, now(),
    v_ok_count, v_issue_count, v_minibar_count,
    (v_issue_count = 0), _task_id
  ) RETURNING id INTO v_check_id;

  FOR v_bucket, v_arr IN
    SELECT * FROM (VALUES
      ('items_missing', _items_missing),
      ('items_damaged', _items_damaged),
      ('items_lost', _items_lost),
      ('items_consumed', _items_consumed),
      ('items_replaced', _items_replaced),
      ('items_sent_to_laundry', _items_sent_to_laundry)
    ) AS t(b, a)
  LOOP
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_arr)
    LOOP
      IF COALESCE(v_entry->>'issue_role','primary_issue') <> 'primary_issue' THEN CONTINUE; END IF;
      v_kind := CASE v_bucket
        WHEN 'items_missing' THEN 'missing'
        WHEN 'items_damaged' THEN 'damaged'
        WHEN 'items_lost' THEN 'lost'
        WHEN 'items_consumed' THEN 'consumed'
        WHEN 'items_replaced' THEN 'replaced'
        WHEN 'items_sent_to_laundry' THEN 'sent_to_laundry'
      END;
      v_client_id := v_entry->>'id';
      INSERT INTO public.room_check_issues (
        tenant_id, hotel_id, room_check_id, room_id,
        item_id, item_name, item_type, asset_group,
        bucket, ui_action, sub_reason, issue_role, kind,
        quantity, charge_to_guest, needs_review,
        photos, notes, source, extra, client_issue_id
      ) VALUES (
        v_tenant_id, v_hotel_id, v_check_id, _room_id,
        NULLIF(v_entry->>'item_id','')::uuid,
        v_entry->>'item_name', v_entry->>'item_type', v_entry->>'asset_group',
        v_bucket, v_entry->>'ui_action', v_entry->>'sub_reason',
        'primary_issue', v_kind,
        (v_entry->>'quantity')::numeric,
        CASE WHEN v_entry ? 'charge_to_guest' THEN (v_entry->>'charge_to_guest')::boolean ELSE NULL END,
        COALESCE((v_entry->>'needs_review')::boolean, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_entry->'photos','[]'::jsonb))), '{}'::text[]),
        v_entry->>'notes', v_entry->>'source',
        COALESCE(v_entry->'extra','{}'::jsonb),
        v_client_id
      ) RETURNING id INTO v_new_id;
      IF v_client_id IS NOT NULL AND v_client_id <> '' THEN
        v_id_map := v_id_map || jsonb_build_object(v_client_id, v_new_id::text);
      END IF;
    END LOOP;
  END LOOP;

  FOR v_bucket, v_arr IN
    SELECT * FROM (VALUES
      ('items_missing', _items_missing),
      ('items_damaged', _items_damaged),
      ('items_lost', _items_lost),
      ('items_consumed', _items_consumed),
      ('items_replaced', _items_replaced),
      ('items_sent_to_laundry', _items_sent_to_laundry)
    ) AS t(b, a)
  LOOP
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_arr)
    LOOP
      IF COALESCE(v_entry->>'issue_role','primary_issue') <> 'derived_action' THEN CONTINUE; END IF;
      v_kind := CASE v_bucket
        WHEN 'items_missing' THEN 'missing'
        WHEN 'items_damaged' THEN 'damaged'
        WHEN 'items_lost' THEN 'lost'
        WHEN 'items_consumed' THEN 'consumed'
        WHEN 'items_replaced' THEN 'replaced'
        WHEN 'items_sent_to_laundry' THEN 'sent_to_laundry'
      END;
      v_source_client_id := v_entry->>'source_issue_client_id';
      v_source_id := NULL;
      IF v_source_client_id IS NOT NULL AND v_id_map ? v_source_client_id THEN
        v_source_id := (v_id_map->>v_source_client_id)::uuid;
      END IF;
      INSERT INTO public.room_check_issues (
        tenant_id, hotel_id, room_check_id, room_id,
        item_id, item_name, item_type, asset_group,
        bucket, ui_action, sub_reason, issue_role, kind,
        quantity, charge_to_guest, needs_review,
        photos, notes, source, source_issue_id, extra, client_issue_id
      ) VALUES (
        v_tenant_id, v_hotel_id, v_check_id, _room_id,
        NULLIF(v_entry->>'item_id','')::uuid,
        v_entry->>'item_name', v_entry->>'item_type', v_entry->>'asset_group',
        v_bucket, v_entry->>'ui_action', v_entry->>'sub_reason',
        'derived_action', v_kind,
        (v_entry->>'quantity')::numeric,
        CASE WHEN v_entry ? 'charge_to_guest' THEN (v_entry->>'charge_to_guest')::boolean ELSE NULL END,
        COALESCE((v_entry->>'needs_review')::boolean, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_entry->'photos','[]'::jsonb))), '{}'::text[]),
        v_entry->>'notes', v_entry->>'source',
        v_source_id,
        COALESCE(v_entry->'extra','{}'::jsonb),
        v_entry->>'id'
      );
    END LOOP;
  END LOOP;

  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'lean_submit', NULL, 'submitted', _notes,
    jsonb_build_object('actor', v_user_id, 'check_type', _check_type, 'issue_count', v_issue_count, 'minibar_count', v_minibar_count, 'ok_count', v_ok_count)
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'summary_ok_count', v_ok_count,
    'summary_issue_count', v_issue_count,
    'summary_minibar_count', v_minibar_count
  );
END $function$;
