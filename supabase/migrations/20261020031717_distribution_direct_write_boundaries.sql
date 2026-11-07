-- Forward-only boundary: client code performs distribution state/inventory
-- transitions through guarded RPCs, never arbitrary REST row writes. Preserve
-- the existing assignee/manager notes edit, with a live actor/session check.
-- Remove column grants too: revoking a table grant alone is not sufficient.
DO $block$
DECLARE v_table text; v_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['distribution_orders','distribution_order_rooms',
    'distribution_order_items','distribution_order_batches'] LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) INTO v_columns
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=to_regclass('public.'||v_table) AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',
      v_columns,v_columns,v_columns,v_table);
  END LOOP;
END;
$block$;
GRANT UPDATE (notes) ON TABLE public.distribution_orders TO authenticated;

CREATE FUNCTION private.distribution_direct_note_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  -- RLS still decides which row is visible. This also rejects a stale session,
  -- a locked profile, and a manager with no membership in the order's hotel.
  PERFORM private.distribution_command_actor(OLD.id,auth.uid(),false);
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.distribution_direct_note_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER distribution_direct_note_guard
  BEFORE UPDATE ON public.distribution_orders
  FOR EACH ROW WHEN (current_user IN ('anon','authenticated'))
  EXECUTE FUNCTION private.distribution_direct_note_guard();

-- Preserve the single-supplement reverse link in the same transaction as order
-- creation. The client must not need a broad UPDATE grant or a second write.
CREATE OR REPLACE FUNCTION public.create_distribution_order(
  p_tenant_id uuid,p_hotel_id uuid,p_created_by uuid,p_assigned_to uuid,
  p_rooms jsonb,p_notes text DEFAULT NULL,p_auto_release boolean DEFAULT false,
  p_supplement_request_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid; v_result jsonb;
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id,p_hotel_id);
  v_actor:=private.distribution_active_actor(p_tenant_id,p_hotel_id,p_created_by,true);
  v_result:=private.create_distribution_order(p_tenant_id,p_hotel_id,v_actor,
    p_assigned_to,p_rooms,p_notes,p_auto_release,p_supplement_request_ids);
  IF cardinality(p_supplement_request_ids)=1 AND v_result->>'success'='true' THEN
    UPDATE public.distribution_orders SET supplement_request_id=p_supplement_request_ids[1]
      WHERE id=(v_result->>'order_id')::uuid AND tenant_id=p_tenant_id AND hotel_id=p_hotel_id;
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_distribution_order(uuid,uuid,uuid,uuid,jsonb,text,boolean,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_distribution_order(uuid,uuid,uuid,uuid,jsonb,text,boolean,uuid[]) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
