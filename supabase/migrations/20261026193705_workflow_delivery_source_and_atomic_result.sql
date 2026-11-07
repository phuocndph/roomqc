-- Forward-only delivery authority, canonical source witness and atomic task/result.
-- Source RPC keeps its existing signature; actor/session/hotel are checked live.
-- Configured workflow execution and legacy source reconciliation remain explicit follow-up work.
-- Delivery source, authorization and effects stay in one database transaction.
CREATE TABLE private.workflow_delivery_results (
  stop_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL,
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  source_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(stop_id,delivered_at)
);
ALTER TABLE private.workflow_delivery_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workflow_delivery_results FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_workflow_delivery_actor()
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE;
  v_profile public.users%ROWTYPE; v_session auth.sessions%ROWTYPE; v_role text;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR v_actor IS NULL
    OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.status IS DISTINCT FROM 'active'
    OR v_profile.deleted_at IS NOT NULL OR COALESCE(v_profile.account_locked,false)
    OR COALESCE(v_profile.is_super_admin,false) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor ORDER BY role FOR SHARE;
  v_role:=CASE v_profile.user_level_code WHEN 'tenant_owner' THEN 'owner'
    WHEN 'manager' THEN 'hotel_manager' WHEN 'hotel_manager' THEN 'hotel_manager'
    WHEN 'department_manager' THEN 'department_manager' WHEN 'staff' THEN 'staff' END;
  IF v_role IS NULL OR v_profile.role::text IS DISTINCT FROM v_role
    OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_actor AND r.role::text=v_role)
    OR EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_actor AND r.role::text='super_admin') THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_session FROM auth.sessions WHERE user_id=v_actor
    AND id::text=auth.jwt()->>'session_id' FOR SHARE;
  IF NOT FOUND OR (v_session.not_after IS NOT NULL AND v_session.not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_hotels WHERE user_id=v_actor ORDER BY hotel_id FOR SHARE;
  RETURN v_profile;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_workflow_delivery_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.complete_delivery_workflow(p_stop_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_order public.distribution_orders%ROWTYPE;
  v_stop public.distribution_order_rooms%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_result jsonb; v_task uuid; v_tasks uuid[]; v_item_count integer; v_legacy boolean:=false;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  -- Read only the order identity before the source lock. The joined source is
  -- re-read after locking, and every scope decision uses that locked version.
  SELECT * INTO v_stop FROM public.distribution_order_rooms WHERE id=p_stop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM public.distribution_orders WHERE id=v_stop.distribution_order_id FOR SHARE;
  SELECT * INTO v_room FROM public.rooms WHERE id=v_stop.room_id FOR SHARE;
  PERFORM 1 FROM public.hotels WHERE id=v_order.hotel_id FOR SHARE;
  IF v_order.id IS NULL OR v_room.id IS NULL OR v_order.tenant_id IS DISTINCT FROM v_actor.tenant_id
    OR v_room.tenant_id IS DISTINCT FROM v_order.tenant_id OR v_room.hotel_id IS DISTINCT FROM v_order.hotel_id
    OR NOT EXISTS(SELECT 1 FROM public.hotels h WHERE h.id=v_order.hotel_id
      AND h.tenant_id=v_order.tenant_id AND h.status='active')
    OR NOT (
      (v_actor.role::text='owner' AND v_actor.user_level_code='tenant_owner'
        AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_actor.id AND r.role::text='owner'))
      OR EXISTS(SELECT 1 FROM public.user_hotels h WHERE h.user_id=v_actor.id AND h.hotel_id=v_order.hotel_id)
    ) OR (NOT public.is_distribution_leader(v_actor.id) AND v_order.assigned_to IS DISTINCT FROM v_actor.id) THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  -- Wall clock matters after waiting for a business lock, including on replay.
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id
    AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_stop.delivered_at IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_COMPLETED' USING ERRCODE='22023';
  END IF;
  SELECT result INTO v_result FROM private.workflow_delivery_results
    WHERE stop_id=p_stop_id AND delivered_at=v_stop.delivered_at;
  IF FOUND THEN RETURN v_result||jsonb_build_object('replayed',true); END IF;
  IF v_stop.status IS DISTINCT FROM 'delivered' OR v_stop.stop_status IS DISTINCT FROM 'delivered'
    OR v_stop.delivered_by IS NULL OR v_stop.delivered_by IS DISTINCT FROM v_actor.id
    OR v_order.status NOT IN ('released','in_progress','completed') THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_COMPLETED' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workflows w WHERE w.tenant_id=v_order.tenant_id
    AND w.status='active' AND w.trigger_type='event' AND w.trigger_event='delivery_stop_completed') THEN
    RAISE EXCEPTION 'WORKFLOW_ENGINE_REQUIRED' USING ERRCODE='PT409';
  END IF;
  -- Lock children before deriving item count; labels/counts never come from the request.
  PERFORM 1 FROM public.distribution_order_items WHERE distribution_order_room_id=p_stop_id ORDER BY id FOR SHARE;
  SELECT count(*)::integer INTO v_item_count FROM public.distribution_order_items WHERE distribution_order_room_id=p_stop_id;
  SELECT array_agg(t.id ORDER BY t.id) INTO v_tasks FROM public.housekeeping_tasks t
    WHERE t.distribution_order_room_id=p_stop_id AND t.task_type='delivery_confirmation'
      AND t.created_at>=v_stop.delivered_at;
  IF cardinality(v_tasks)>1 THEN
    RAISE EXCEPTION 'WORKFLOW_LEGACY_RESULT_REQUIRES_REVIEW' USING ERRCODE='PT409';
  END IF;
  IF cardinality(v_tasks)=1 THEN
    SELECT id INTO v_task FROM public.housekeeping_tasks WHERE id=v_tasks[1]
      AND tenant_id=v_order.tenant_id AND hotel_id=v_order.hotel_id AND room_id=v_stop.room_id FOR SHARE;
    IF v_task IS NULL THEN RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    v_legacy:=true;
  ELSE
    INSERT INTO public.housekeeping_tasks(tenant_id,hotel_id,room_id,task_type,title,description,
      priority,status,distribution_order_room_id,requested_by)
    VALUES(v_order.tenant_id,v_order.hotel_id,v_stop.room_id,'delivery_confirmation',
      'Xác nhận nhận hàng - P.'||v_room.room_number,
      'Phiếu '||v_order.order_code||' - '||v_item_count::text||' sản phẩm',
      'high','pending',p_stop_id,v_actor.id) RETURNING id INTO v_task;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id
    AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  v_result:=jsonb_build_object('success',true,'executed',1,'task_id',v_task,'legacy_adopted',v_legacy,'replayed',false);
  INSERT INTO private.workflow_delivery_results(stop_id,delivered_at,tenant_id,hotel_id,actor_id,session_id,source_snapshot,result)
  VALUES(p_stop_id,v_stop.delivered_at,v_order.tenant_id,v_order.hotel_id,v_actor.id,
    (auth.jwt()->>'session_id')::uuid,
    jsonb_build_object('source','distribution_order_rooms','stop_id',p_stop_id,'order_id',v_order.id,
      'room_id',v_room.id,'hotel_id',v_order.hotel_id,'tenant_id',v_order.tenant_id,
      'delivered_at',v_stop.delivered_at,'delivered_by',v_stop.delivered_by,'item_count',v_item_count),v_result);
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id
    AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.complete_delivery_workflow(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- The event witness is minted by the guarded source command, never a client.
CREATE TABLE private.workflow_delivery_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL,
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  room_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  source_snapshot jsonb NOT NULL,
  source_result jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(stop_id,delivered_at)
);
ALTER TABLE private.workflow_delivery_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workflow_delivery_sources FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.deliver_stop(uuid,uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.deliver_stop(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.deliver_stop(p_stop_id uuid,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_order public.distribution_orders%ROWTYPE;
  v_stop public.distribution_order_rooms%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_result jsonb; v_source private.workflow_delivery_sources%ROWTYPE;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_actor.id THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_stop FROM public.distribution_order_rooms WHERE id=p_stop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM public.distribution_orders WHERE id=v_stop.distribution_order_id FOR UPDATE;
  SELECT * INTO v_room FROM public.rooms WHERE id=v_stop.room_id FOR SHARE;
  PERFORM 1 FROM public.hotels WHERE id=v_order.hotel_id FOR SHARE;
  IF v_order.id IS NULL OR v_room.id IS NULL OR v_order.tenant_id IS DISTINCT FROM v_actor.tenant_id
    OR v_room.tenant_id IS DISTINCT FROM v_order.tenant_id OR v_room.hotel_id IS DISTINCT FROM v_order.hotel_id
    OR NOT EXISTS(SELECT 1 FROM public.hotels h WHERE h.id=v_order.hotel_id
      AND h.tenant_id=v_order.tenant_id AND h.status='active')
    OR NOT (
      (v_actor.role::text='owner' AND v_actor.user_level_code='tenant_owner'
        AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_actor.id AND r.role::text='owner'))
      OR EXISTS(SELECT 1 FROM public.user_hotels h WHERE h.user_id=v_actor.id AND h.hotel_id=v_order.hotel_id)
    ) OR (NOT public.is_distribution_leader(v_actor.id) AND v_order.assigned_to IS DISTINCT FROM v_actor.id) THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id
    AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_stop.status IN ('delivered','confirmed') AND v_stop.stop_status='delivered' THEN
    SELECT * INTO v_source FROM private.workflow_delivery_sources
      WHERE stop_id=p_stop_id AND delivered_at=v_stop.delivered_at AND actor_id=v_actor.id;
    IF FOUND THEN RETURN v_source.source_result||jsonb_build_object('replayed',true,'workflow_source_id',v_source.id); END IF;
  END IF;
  v_result:=private.deliver_stop(p_stop_id,v_actor.id);
  SELECT * INTO v_stop FROM public.distribution_order_rooms WHERE id=p_stop_id;
  IF v_result->>'success' IS DISTINCT FROM 'true' OR v_stop.delivered_at IS NULL
    OR v_stop.status IS DISTINCT FROM 'delivered' OR v_stop.stop_status IS DISTINCT FROM 'delivered'
    OR v_stop.delivered_by IS DISTINCT FROM v_actor.id THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_COMPLETED' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.workflow_delivery_sources(stop_id,delivered_at,tenant_id,hotel_id,room_id,
    actor_id,session_id,source_snapshot,source_result)
  VALUES(p_stop_id,v_stop.delivered_at,v_order.tenant_id,v_order.hotel_id,v_room.id,v_actor.id,
    (auth.jwt()->>'session_id')::uuid,
    jsonb_build_object('source','distribution_order_rooms','stop_id',p_stop_id,'order_id',v_order.id,
      'room_id',v_room.id,'hotel_id',v_order.hotel_id,'tenant_id',v_order.tenant_id,
      'delivered_at',v_stop.delivered_at,'delivered_by',v_actor.id,'room_number',v_room.room_number,
      'order_code',v_order.order_code),v_result)
  RETURNING * INTO v_source;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id
    AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_result||jsonb_build_object('replayed',false,'workflow_source_id',v_source.id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.deliver_stop(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.deliver_stop(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.complete_delivery_workflow(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.complete_delivery_workflow(p_stop_id uuid,p_tenant_id uuid DEFAULT NULL,p_hotel_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_stop public.distribution_order_rooms%ROWTYPE;
  v_order public.distribution_orders%ROWTYPE; v_source private.workflow_delivery_sources%ROWTYPE;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  SELECT * INTO v_stop FROM public.distribution_order_rooms WHERE id=p_stop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM public.distribution_orders WHERE id=v_stop.distribution_order_id FOR SHARE;
  IF v_order.id IS NULL OR v_order.tenant_id IS DISTINCT FROM v_actor.tenant_id
    OR (p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_order.tenant_id)
    OR (p_hotel_id IS NOT NULL AND p_hotel_id IS DISTINCT FROM v_order.hotel_id)
    OR NOT (
      (v_actor.role::text='owner' AND v_actor.user_level_code='tenant_owner'
        AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_actor.id AND r.role::text='owner'))
      OR EXISTS(SELECT 1 FROM public.user_hotels h WHERE h.user_id=v_actor.id AND h.hotel_id=v_order.hotel_id)
    ) OR (NOT public.is_distribution_leader(v_actor.id) AND v_order.assigned_to IS DISTINCT FROM v_actor.id) THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  IF v_stop.delivered_at IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_COMPLETED' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_source FROM private.workflow_delivery_sources
    WHERE stop_id=p_stop_id AND delivered_at=v_stop.delivered_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_REQUIRES_REVIEW' USING ERRCODE='PT409';
  END IF;
  IF v_source.actor_id IS DISTINCT FROM v_actor.id OR v_source.tenant_id IS DISTINCT FROM v_order.tenant_id
    OR v_source.hotel_id IS DISTINCT FROM v_order.hotel_id OR v_source.room_id IS DISTINCT FROM v_stop.room_id
    OR v_stop.delivered_by IS DISTINCT FROM v_source.actor_id THEN
    RAISE EXCEPTION 'WORKFLOW_SOURCE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  RETURN private.complete_delivery_workflow(p_stop_id)||jsonb_build_object('workflow_source_id',v_source.id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.complete_delivery_workflow(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_delivery_workflow(uuid,uuid,uuid) TO authenticated;
