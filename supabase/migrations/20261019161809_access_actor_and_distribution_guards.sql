-- Forward-only access fixes from the full catalog review. Do not modify the
-- checksums of historical migrations or grant direct access to private tables.
CREATE OR REPLACE FUNCTION private.room_setup_owner(p_hotel_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;
BEGIN
  SELECT h.tenant_id INTO v_tenant FROM public.hotels h
  JOIN public.users u ON u.tenant_id=h.tenant_id AND u.id=auth.uid()
  JOIN auth.users au ON au.id=u.id
  WHERE h.id=p_hotel_id AND h.status='active' AND u.status='active'
    AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
    AND au.email_confirmed_at IS NOT NULL
    AND (au.banned_until IS NULL OR au.banned_until<=now())
    AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=u.id AND ur.role='owner')
    AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
      AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()));
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu đang hoạt động được thiết lập khách sạn này.' USING ERRCODE='42501';
  END IF;
  RETURN v_tenant;
END;
$fn$;
REVOKE ALL ON FUNCTION private.room_setup_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.subscription_quote_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;
BEGIN
  SELECT u.tenant_id INTO v_tenant FROM public.users u JOIN auth.users au ON au.id=u.id
    WHERE u.id=auth.uid() AND u.status='active' AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
      AND au.email_confirmed_at IS NOT NULL AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='owner')
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
        AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN v_tenant;
END;
$fn$;
REVOKE ALL ON FUNCTION private.subscription_quote_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_support_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor)
    OR NOT EXISTS(SELECT 1 FROM public.users u JOIN auth.users au ON au.id=u.id
      WHERE u.id=v_actor AND u.status='active' AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
        AND au.email_confirmed_at IS NOT NULL AND (au.banned_until IS NULL OR au.banned_until<=now()))
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor
      AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now())) THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION public.platform_support_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_support_actor() TO authenticated;

-- The 2025 route policy migration dropped "from their tenant", but the real
-- legacy names say "in their tenant". Both permissive policy sets survived and
-- OR-combined: the broad tenant policy defeated leader/assignee restrictions.
-- Remove only those four legacy policies; keep the intended role/assignee
-- policies, including UPDATE WITH CHECK, and all table grants unchanged.
DROP POLICY IF EXISTS "Users can view distribution orders in their tenant" ON public.distribution_orders;
DROP POLICY IF EXISTS "Users can create distribution orders in their tenant" ON public.distribution_orders;
DROP POLICY IF EXISTS "Users can update distribution orders in their tenant" ON public.distribution_orders;
DROP POLICY IF EXISTS "Users can delete distribution orders in their tenant" ON public.distribution_orders;

-- These read-only RPCs previously ran as the table owner. The actual UI calls
-- them instead of REST: honor the same row policies, including nested items.
ALTER FUNCTION public.get_distribution_order_detail(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_distribution_orders_filtered(uuid,uuid,text,uuid,integer,date,text,integer,integer) SECURITY INVOKER;

-- Keep the list and count on one authorization source (RLS), not a stale list
-- of UI level labels that hides legitimate hotel/department managers' routes.
CREATE OR REPLACE FUNCTION public.get_distribution_orders_filtered(
  p_tenant_id uuid,p_hotel_id uuid DEFAULT NULL,p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,p_floor integer DEFAULT NULL,p_shift_date date DEFAULT NULL,
  p_shift_code text DEFAULT NULL,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0
) RETURNS TABLE(id uuid,order_code text,status text,floor integer,shift_date date,shift_code text,
  total_rooms integer,total_items integer,rooms_completed integer,assigned_to uuid,assigned_to_name text,
  created_by uuid,created_by_name text,notes text,released_at timestamptz,started_at timestamptz,
  completed_at timestamptz,created_at timestamptz,hotel_id uuid,hotel_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT d.id,d.order_code,d.status,d.floor,d.shift_date,d.shift_code,d.total_rooms,d.total_items,
    d.rooms_completed,d.assigned_to,a.full_name,d.created_by,c.full_name,d.notes,d.released_at,
    d.started_at,d.completed_at,d.created_at,d.hotel_id,h.name
  FROM public.distribution_orders d
  LEFT JOIN public.users a ON a.id=d.assigned_to LEFT JOIN public.users c ON c.id=d.created_by
  LEFT JOIN public.hotels h ON h.id=d.hotel_id
  WHERE d.tenant_id=p_tenant_id AND (p_hotel_id IS NULL OR d.hotel_id=p_hotel_id)
    AND (p_status IS NULL OR d.status=p_status) AND (p_assigned_to IS NULL OR d.assigned_to=p_assigned_to)
    AND (p_floor IS NULL OR d.floor=p_floor) AND (p_shift_date IS NULL OR d.shift_date=p_shift_date)
    AND (p_shift_code IS NULL OR d.shift_code=p_shift_code)
  ORDER BY d.created_at DESC,d.id DESC LIMIT greatest(1,least(coalesce(p_limit,25),100)) OFFSET greatest(coalesce(p_offset,0),0);
$fn$;
CREATE OR REPLACE FUNCTION public.get_distribution_orders_count(
  p_tenant_id uuid,p_hotel_id uuid DEFAULT NULL,p_status text DEFAULT NULL,p_assigned_to uuid DEFAULT NULL,
  p_floor integer DEFAULT NULL,p_shift_date date DEFAULT NULL,p_shift_code text DEFAULT NULL
) RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT count(*)::integer FROM public.distribution_orders d
  WHERE d.tenant_id=p_tenant_id AND (p_hotel_id IS NULL OR d.hotel_id=p_hotel_id)
    AND (p_status IS NULL OR d.status=p_status) AND (p_assigned_to IS NULL OR d.assigned_to=p_assigned_to)
    AND (p_floor IS NULL OR d.floor=p_floor) AND (p_shift_date IS NULL OR d.shift_date=p_shift_date)
    AND (p_shift_code IS NULL OR d.shift_code=p_shift_code);
$fn$;

CREATE OR REPLACE FUNCTION public.create_distribution_order(
  p_tenant_id uuid,p_hotel_id uuid,p_created_by uuid,p_assigned_to uuid,
  p_rooms jsonb,p_notes text DEFAULT NULL,p_auto_release boolean DEFAULT false,
  p_supplement_request_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id,p_hotel_id);
  -- Match the INSERT policy: staff may execute assigned work, not create routes.
  v_actor:=private.distribution_active_actor(p_tenant_id,p_hotel_id,p_created_by,true);
  RETURN private.create_distribution_order(p_tenant_id,p_hotel_id,v_actor,
    p_assigned_to,p_rooms,p_notes,p_auto_release,p_supplement_request_ids);
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_distribution_order(uuid,uuid,uuid,uuid,jsonb,text,boolean,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_distribution_order(uuid,uuid,uuid,uuid,jsonb,text,boolean,uuid[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.distribution_active_actor(p_tenant_id uuid,p_hotel_id uuid,p_actor_id uuid,p_manage boolean)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  v_actor:=public.assert_rpc_actor(p_tenant_id,p_hotel_id,p_actor_id,p_manage);
  IF NOT public.rpc_request_is_trusted() AND NOT EXISTS(
    SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
    WHERE u.id=v_actor AND u.status='active' AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
      AND a.email_confirmed_at IS NOT NULL AND (a.banned_until IS NULL OR a.banned_until<=now())
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id AND s.id::text=auth.jwt()->>'session_id'
        AND (s.not_after IS NULL OR s.not_after>now()))) THEN
    RAISE EXCEPTION 'DISTRIBUTION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.distribution_active_actor(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.distribution_command_actor(p_order_id uuid,p_actor_id uuid,p_manage boolean)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_order record; v_actor uuid;
BEGIN
  SELECT tenant_id,hotel_id,assigned_to INTO v_order FROM public.distribution_orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  v_actor:=private.distribution_active_actor(v_order.tenant_id,v_order.hotel_id,p_actor_id,p_manage);
  IF NOT public.rpc_request_is_trusted() AND NOT public.is_distribution_leader(v_actor)
    AND v_order.assigned_to IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'DISTRIBUTION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.distribution_command_actor(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve existing inventory transactions; only guarded public wrappers may
-- reach the old implementation. Raw definer calls must not bypass row policies.
ALTER FUNCTION public.cancel_distribution_order(uuid,uuid) SET SCHEMA private;
ALTER FUNCTION public.update_distribution_order(uuid,uuid,text,jsonb) SET SCHEMA private;
ALTER FUNCTION public.confirm_warehouse_delivery(uuid,uuid,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.cancel_distribution_order(uuid,uuid),
  private.update_distribution_order(uuid,uuid,text,jsonb),private.confirm_warehouse_delivery(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cancel_distribution_order(p_order_id uuid,p_cancelled_by uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  v_actor:=private.distribution_command_actor(p_order_id,p_cancelled_by,true);
  RETURN private.cancel_distribution_order(p_order_id,v_actor);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.update_distribution_order(p_order_id uuid,p_assigned_to uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,p_rooms jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid; v_order record; v_room jsonb; v_item jsonb;
BEGIN
  v_actor:=private.distribution_command_actor(p_order_id,auth.uid(),true);
  SELECT tenant_id,hotel_id INTO v_order FROM public.distribution_orders WHERE id=p_order_id;
  IF p_assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u
    WHERE u.id=p_assigned_to AND u.tenant_id=v_order.tenant_id AND u.status='active' AND u.deleted_at IS NULL
      AND NOT COALESCE(u.account_locked,false) AND (u.hotel_id=v_order.hotel_id
        OR EXISTS(SELECT 1 FROM public.user_hotels h WHERE h.user_id=u.id AND h.hotel_id=v_order.hotel_id))) THEN
    RAISE EXCEPTION 'ASSIGNEE_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF p_rooms IS NOT NULL THEN
    IF jsonb_typeof(p_rooms)<>'array' OR jsonb_array_length(p_rooms)>200 THEN
      RAISE EXCEPTION 'INVALID_ROOMS' USING ERRCODE='22023'; END IF;
    FOR v_room IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.rooms r WHERE r.id=(v_room->>'room_id')::uuid
        AND r.tenant_id=v_order.tenant_id AND r.hotel_id=v_order.hotel_id) THEN
        RAISE EXCEPTION 'ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
      IF jsonb_typeof(v_room->'items') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE='22023'; END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_room->'items') LOOP
        IF NOT EXISTS(SELECT 1 FROM public.items i WHERE i.id=(v_item->>'item_id')::uuid
          AND i.tenant_id=v_order.tenant_id AND i.hotel_id=v_order.hotel_id) THEN
          RAISE EXCEPTION 'ITEM_MISMATCH' USING ERRCODE='42501'; END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN private.update_distribution_order(p_order_id,p_assigned_to,p_notes,p_rooms);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.confirm_warehouse_delivery(p_room_order_id uuid,p_delivered_by uuid,
  p_item_confirmations jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_order uuid; v_actor uuid;
BEGIN
  SELECT distribution_order_id INTO v_order FROM public.distribution_order_rooms WHERE id=p_room_order_id;
  v_actor:=private.distribution_command_actor(v_order,p_delivered_by,true);
  RETURN private.confirm_warehouse_delivery(p_room_order_id,v_actor,p_item_confirmations);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_distribution_order(uuid,uuid),
  public.update_distribution_order(uuid,uuid,text,jsonb),public.confirm_warehouse_delivery(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_distribution_order(uuid,uuid),
  public.update_distribution_order(uuid,uuid,text,jsonb),public.confirm_warehouse_delivery(uuid,uuid,jsonb) TO authenticated,service_role;

-- Email administration deliberately keeps its existing profile-based authority
-- model, while checking the caller's current Auth account/session on every action.
CREATE OR REPLACE FUNCTION public.email_admin_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.users u JOIN auth.users au ON au.id=u.id
    WHERE u.id=v_actor AND u.is_super_admin IS TRUE AND u.status='active'
      AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
      AND au.email_confirmed_at IS NOT NULL
      AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
        AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()))
  ) THEN RAISE EXCEPTION 'ACTIVE_EMAIL_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION public.email_admin_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.email_admin_actor() TO authenticated;
NOTIFY pgrst,'reload schema';
