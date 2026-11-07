-- P0 (found 2026-11-07): SECURITY DEFINER functions that take p_tenant_id
-- from the client returned another tenant's data (staff names/emails,
-- dashboards, reports) because they never checked who was calling.
--
-- Fix: one shared guard, injected at the top of each affected function.
--   * service role / database owner sessions and trigger-internal calls pass;
--   * signed-in users pass only for their own tenant while active;
--   * the super-admin reconciliation panel requires a super admin.
-- A function the app never calls loses EXECUTE for client roles instead.

CREATE OR REPLACE FUNCTION private.assert_tenant_scope(p_tenant_id uuid, p_mode text DEFAULT 'tenant')
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.rpc_request_is_trusted() OR pg_trigger_depth() > 0 THEN
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TENANT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  IF p_mode = 'super_admin' THEN
    IF COALESCE(public.is_super_admin(v_uid), false) THEN RETURN; END IF;
    RAISE EXCEPTION 'TENANT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid
      AND u.tenant_id = p_tenant_id
      AND u.status = 'active'
      AND u.deleted_at IS NULL
      AND NOT COALESCE(u.account_locked, false)
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'TENANT_SCOPE_DENIED' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION private.assert_tenant_scope(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.assert_tenant_scope(uuid, text) TO authenticated, service_role;

DO $guard$
DECLARE
  v_targets jsonb := jsonb_build_object(
    'admin_subscription_reconciliation', 'super_admin',
    'check_tenant_can_add', 'tenant',
    'generate_guest_invoice_number', 'tenant',
    'generate_laundry_request_code', 'tenant',
    'generate_lost_found_item_code', 'tenant',
    'generate_supplement_request_code', 'tenant',
    'get_abc_analysis', 'tenant',
    'get_all_warehouse_stock_summary', 'tenant',
    'get_categories_with_stats', 'tenant',
    'get_daily_occupancy_trend', 'tenant',
    'get_dashboard_stats', 'tenant',
    'get_hotels_breakdown_stats', 'tenant',
    'get_inventory_dashboard_stats', 'tenant',
    'get_inventory_report', 'tenant',
    'get_inventory_transactions_filtered', 'tenant',
    'get_inventory_value_over_time', 'tenant',
    'get_items_filtered', 'tenant',
    'get_laundry_dashboard_stats', 'tenant',
    'get_laundry_report', 'tenant',
    'get_low_stock_by_warehouses', 'tenant',
    'get_low_stock_items', 'tenant',
    'get_maintenance_dashboard', 'tenant',
    'get_maintenance_report', 'tenant',
    'get_monthly_laundry_expenses', 'tenant',
    'get_recent_activities', 'tenant',
    'get_room_checks_report', 'tenant',
    'get_rooms_filtered', 'tenant',
    'get_rooms_report_stats', 'tenant',
    'get_stock_audit_report', 'tenant',
    'get_top_items', 'tenant',
    'get_turnover_analysis', 'tenant',
    'get_users_by_hotel', 'tenant',
    'log_activity', 'tenant',
    'queue_email_notification', 'tenant',
    'sync_categories_for_hotel', 'tenant',
    'validate_plan_change', 'tenant'
  );
  v_name text;
  v_mode text;
  v_oid oid;
  v_def text;
  v_new text;
  v_count integer;
BEGIN
  FOR v_name, v_mode IN SELECT key, value #>> '{}' FROM jsonb_each(v_targets) LOOP
    SELECT count(*) INTO v_count FROM pg_proc
    WHERE proname = v_name AND pronamespace = 'public'::regnamespace;
    IF v_count = 0 THEN
      RAISE NOTICE 'tenant scope guard: % not present, skipped', v_name;
      CONTINUE;
    END IF;

    FOR v_oid IN SELECT oid FROM pg_proc WHERE proname = v_name AND pronamespace = 'public'::regnamespace LOOP
      IF (SELECT lanname FROM pg_language l JOIN pg_proc p ON p.prolang = l.oid WHERE p.oid = v_oid) <> 'plpgsql' THEN
        RAISE EXCEPTION 'tenant scope guard: % is not plpgsql', v_name;
      END IF;
      IF pg_get_function_identity_arguments(v_oid) !~ '^p_tenant_id uuid' THEN
        RAISE EXCEPTION 'tenant scope guard: % does not start with p_tenant_id', v_name;
      END IF;

      v_def := pg_get_functiondef(v_oid);
      IF v_def ~ 'tenant_scope_guard' THEN
        CONTINUE; -- already guarded
      END IF;

      -- The first BEGIN after the body delimiter opens the top-level block.
      v_new := regexp_replace(
        v_def,
        '(AS \$function\$.*?\mBEGIN\M)',
        '\1' || E'\n  PERFORM private.assert_tenant_scope(p_tenant_id, ' || quote_literal(v_mode) || '); -- tenant_scope_guard',
        'i'
      );
      IF v_new = v_def THEN
        RAISE EXCEPTION 'tenant scope guard: no top-level BEGIN found in %', v_name;
      END IF;
      EXECUTE v_new;
    END LOOP;
  END LOOP;

  -- Every listed function that exists must now carry the guard.
  SELECT count(*) INTO v_count
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND v_targets ? p.proname
    AND p.prosrc !~ 'tenant_scope_guard';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'tenant scope guard: % function(s) left unguarded', v_count;
  END IF;
END;
$guard$;

-- Not called by the app or by other functions: close it to client roles.
DO $$
BEGIN
  IF to_regprocedure('public.create_default_categories(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.create_default_categories(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;
