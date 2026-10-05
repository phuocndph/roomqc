DO $$
DECLARE
  r record;
  v_names text[] := ARRAY[
    'create_inbound_transaction', 'create_outbound_transaction',
    'create_laundry_batch_with_items', 'create_laundry_return_transaction',
    'create_laundry_loss_transaction', 'add_laundry_to_draft_batch',
    'create_warehouse_transfer', 'create_stock_adjustment',
    'record_booking_payment', 'confirm_booking_payment_manual',
    'update_room_status_safe', 'confirm_receive_order',
    'confirm_room_delivery', 'undo_room_delivery_confirmation',
    'close_route_if_complete', 'mark_cannot_access',
    'setup_room_initial', 'apply_room_standards', 'approve_tenant',
    'create_booking_v2', 'create_distribution_order'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(v_names)
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      r.proname, r.identity_args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.proname, r.identity_args
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
