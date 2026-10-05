-- ============================================================
-- Phase: Lockdown cron/helper RPCs + tenant guards for 3 RPCs
-- ============================================================

-- 1) Revoke EXECUTE từ authenticated + anon cho các cron / helper nội bộ.
--    Chỉ service_role được phép gọi (edge function cron dùng service_role key).
DO $$
DECLARE
  fn record;
  fn_names text[] := ARRAY[
    'auto_apply_read_only_after_grace',
    'auto_clear_read_only_after_renewal',
    'auto_close_stale_shifts',
    'auto_offline_inactive_staff',
    'check_expiring_subscriptions',
    'cleanup_expired_otps',
    'cleanup_old_check_sessions',
    'cleanup_orphaned_auth_users',
    'cleanup_rate_limit_hits',
    'cleanup_stale_check_sessions',
    'lift_expired_dnd_oos',
    'assign_default_permissions_to_role',
    '_enqueue_stay_registration_internal',
    '_tc_check_block_conflict',
    '_tc_check_booking_conflict',
    'check_and_update_batch_status',
    'check_and_update_order_status',
    'allocate_linen_fifo',
    'calculate_staff_statistics',
    'calculate_tenant_storage'
  ];
  sig text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(fn_names)
  LOOP
    sig := format('public.%I(%s)', fn.proname, fn.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $$;

-- 2) apply_room_standards: thêm tenant guard.
CREATE OR REPLACE FUNCTION public.apply_room_standards(p_room_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type text;
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_caller_tenant uuid;
  v_added integer := 0;
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT room_type, tenant_id, hotel_id
  INTO v_room_type, v_tenant_id, v_hotel_id
  FROM rooms
  WHERE id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  SELECT tenant_id INTO v_caller_tenant FROM users WHERE id = auth.uid();
  IF v_caller_tenant IS NULL OR v_caller_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  WITH upserted AS (
    INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition, assigned_at)
    SELECT
      p_room_id,
      rts.item_id,
      rts.quantity,
      rts.quantity,
      'good',
      NOW()
    FROM room_type_standards rts
    JOIN items i ON i.id = rts.item_id AND i.hotel_id = v_hotel_id
    WHERE rts.room_type = v_room_type
      AND rts.tenant_id = v_tenant_id
      AND rts.hotel_id = v_hotel_id
    ON CONFLICT (room_id, item_id)
    DO UPDATE SET
      standard_quantity = EXCLUDED.standard_quantity,
      quantity = GREATEST(room_items.quantity, EXCLUDED.quantity)
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT
    COUNT(*) FILTER (WHERE is_insert)::integer,
    COUNT(*) FILTER (WHERE NOT is_insert)::integer
  INTO v_added, v_updated
  FROM upserted;

  RETURN jsonb_build_object('success', true, 'added', v_added, 'updated', v_updated);
END;
$function$;

-- 3) bulk_delete_items: thêm tenant guard.
CREATE OR REPLACE FUNCTION public.bulk_delete_items(p_item_ids uuid[], p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count integer := 0;
  v_failed_count integer := 0;
  v_errors text[] := '{}';
  v_item_id uuid;
  v_item_tenant uuid;
  v_caller_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT tenant_id INTO v_caller_tenant FROM users WHERE id = auth.uid();
  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  FOREACH v_item_id IN ARRAY p_item_ids LOOP
    BEGIN
      SELECT tenant_id INTO v_item_tenant FROM items WHERE id = v_item_id;

      IF v_item_tenant IS NULL OR v_item_tenant <> v_caller_tenant THEN
        v_failed_count := v_failed_count + 1;
        v_errors := array_append(v_errors, 'Item ' || v_item_id || ' không thuộc tenant');
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM items
        WHERE id = v_item_id
          AND (quantity_in_use > 0 OR quantity_in_laundry > 0)
      ) THEN
        v_failed_count := v_failed_count + 1;
        v_errors := array_append(v_errors, 'Item ' || v_item_id || ' đang sử dụng');
      ELSE
        UPDATE items SET
          status = 'discontinued',
          updated_at = now()
        WHERE id = v_item_id;

        v_deleted_count := v_deleted_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_errors := array_append(v_errors, SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'failed_count', v_failed_count,
    'errors', v_errors
  );
END;
$function$;

-- Re-grant để client (authenticated) vẫn gọi được 2 RPC trên (đã có guard tenant bên trong).
REVOKE EXECUTE ON FUNCTION public.apply_room_standards(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_room_standards(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bulk_delete_items(uuid[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.bulk_delete_items(uuid[], uuid) TO authenticated, service_role;
