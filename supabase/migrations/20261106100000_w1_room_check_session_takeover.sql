-- W1 (2026-11-06): a manager could not take over another user's room-check
-- session. RLS only lets users delete their own room_check_sessions row, so
-- the client-side "delete then insert" removed nothing (HTTP 204, 0 rows) and
-- the insert hit the room_id unique key (409). The room stayed locked by an
-- abandoned staff session in both the Lean overview and the legacy wizard.
--
-- This RPC performs the takeover atomically for the same actors the UI offers
-- it to (owner/super_admin, hotel/department managers), scoped to a live
-- actor, the room's tenant/hotel and rooms:update.

CREATE OR REPLACE FUNCTION public.take_over_room_check_session(
  p_room_id uuid,
  p_check_type text,
  p_user_name text
)
RETURNS public.room_check_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_user public.users%ROWTYPE;
  v_room public.rooms%ROWTYPE;
  v_session public.room_check_sessions%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT private.business_actor_is_live() THEN
    RAISE EXCEPTION 'ROOM_CHECK_TAKEOVER_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_actor;

  -- Lock the room so two concurrent takeovers serialise.
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND
     OR v_room.tenant_id IS DISTINCT FROM v_user.tenant_id
     OR NOT private.business_hotel_scope(v_room.tenant_id, v_room.hotel_id) THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_user_permission(v_actor, 'rooms', 'update') THEN
    RAISE EXCEPTION 'ROOM_CHECK_TAKEOVER_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_user.user_level_code IN ('super_admin', 'tenant_owner', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_actor
        AND ur.role::text IN ('super_admin', 'owner', 'hotel_manager', 'department_manager')
    )
  ) THEN
    RAISE EXCEPTION 'ROOM_CHECK_TAKEOVER_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_check_type IS NULL OR p_check_type NOT IN ('daily', 'checkin', 'checkout', 'maintenance') THEN
    RAISE EXCEPTION 'INVALID_CHECK_TYPE' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.room_check_sessions WHERE room_id = p_room_id;

  INSERT INTO public.room_check_sessions (room_id, user_id, user_name, check_type, tenant_id)
  VALUES (
    p_room_id,
    v_actor,
    left(coalesce(nullif(btrim(p_user_name), ''), 'Quản lý'), 120),
    p_check_type,
    v_room.tenant_id
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_room_check_session(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_over_room_check_session(uuid, text, text) TO authenticated;
