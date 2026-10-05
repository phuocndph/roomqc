CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- Save wrapper definitions, move the old implementations out of the exposed
-- schema, then rewrite the wrapper calls to the private schema. Moving the
-- functions preserves their OIDs for any internal dependencies/triggers.
CREATE TEMP TABLE _roomqc_rpc_wrapper_defs (
  proname text NOT NULL,
  identity_args text NOT NULL,
  definition text NOT NULL
) ON COMMIT DROP;

INSERT INTO _roomqc_rpc_wrapper_defs (proname, identity_args, definition)
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid),
       pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_inbound_transaction', 'create_outbound_transaction',
    'create_laundry_batch_with_items', 'create_laundry_return_transaction',
    'create_laundry_loss_transaction', 'add_laundry_to_draft_batch',
    'create_warehouse_transfer', 'create_stock_adjustment',
    'record_booking_payment', 'confirm_booking_payment_manual',
    'update_room_status_safe', 'confirm_receive_order',
    'confirm_room_delivery', 'undo_room_delivery_confirmation',
    'close_route_if_complete', 'mark_cannot_access',
    'setup_room_initial', 'apply_room_standards', 'approve_tenant',
    'create_booking_v2'
  );

DO $$
DECLARE
  v_regproc regprocedure;
BEGIN
  FOR v_regproc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND right(p.proname, 10) = '_unchecked'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA private', v_regproc);
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
  v_definition text;
  v_internal_name text;
  v_internal_names text[] := ARRAY[
    'create_inbound_transaction_unchecked',
    'create_outbound_transaction_unchecked',
    'create_laundry_batch_with_items_unchecked',
    'create_laundry_return_transaction_unchecked',
    'create_laundry_loss_transaction_unchecked',
    'add_laundry_to_draft_batch_unchecked',
    'create_warehouse_transfer_unchecked',
    'create_stock_adjustment_unchecked',
    'record_booking_payment_unchecked',
    'confirm_booking_payment_manual_unchecked',
    'update_room_status_safe_unchecked',
    'confirm_receive_order_unchecked',
    'confirm_room_delivery_unchecked',
    'undo_room_delivery_confirmation_unchecked',
    'close_route_if_complete_unchecked',
    'mark_cannot_access_unchecked',
    'setup_room_initial_unchecked',
    'apply_room_standards_unchecked',
    'approve_tenant_unchecked',
    'create_booking_v2_unchecked'
  ];
BEGIN
  FOR r IN SELECT proname, identity_args, definition FROM _roomqc_rpc_wrapper_defs LOOP
    v_definition := r.definition;
    FOREACH v_internal_name IN ARRAY v_internal_names LOOP
      v_definition := replace(
        v_definition,
        'public.' || v_internal_name,
        'private.' || v_internal_name
      );
    END LOOP;
    EXECUTE v_definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_regproc regprocedure;
BEGIN
  FOR v_regproc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND right(p.proname, 10) = '_unchecked'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_regproc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_regproc);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
