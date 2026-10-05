-- Step 1: Relax audit_log.action CHECK to accept any snake_case action token
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action ~ '^[a-z][a-z0-9_.]{1,63}$');

-- Step 2: Fix undo_quick_room_check to call log_state_transition with correct args
CREATE OR REPLACE FUNCTION public.undo_quick_room_check(_check_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check public.room_checks%ROWTYPE;
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
  v_window_minutes int := 10;
  v_age_seconds numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_check FROM public.room_checks WHERE id = _check_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check_not_found';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_uid;
  IF v_tenant IS NULL OR v_tenant <> v_check.tenant_id THEN
    RAISE EXCEPTION 'forbidden_tenant';
  END IF;

  SELECT user_level INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_check.checked_by <> v_uid
     AND COALESCE(v_role,'') NOT IN ('tenant_owner','manager','super_admin') THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  IF COALESCE(v_check.check_mode, '') <> 'quick' THEN
    RAISE EXCEPTION 'not_quick_check';
  END IF;

  v_age_seconds := EXTRACT(EPOCH FROM (now() - v_check.checked_at));
  IF v_age_seconds > v_window_minutes * 60 THEN
    RAISE EXCEPTION 'undo_window_expired:%', v_window_minutes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_checks
    WHERE room_id = v_check.room_id
      AND checked_at > v_check.checked_at
      AND id <> v_check.id
  ) THEN
    RAISE EXCEPTION 'newer_check_exists';
  END IF;

  UPDATE public.room_checks
     SET status = 'undone',
         notes = COALESCE(notes,'') ||
                 CASE WHEN _reason IS NOT NULL
                      THEN E'\n[Hoàn tác] ' || _reason
                      ELSE E'\n[Hoàn tác]' END
   WHERE id = _check_id;

  BEGIN
    PERFORM public.log_state_transition(
      v_check.tenant_id, v_check.hotel_id, 'room_checks', _check_id,
      'undo_quick', v_check.status, 'undone', _reason,
      jsonb_build_object('actor', v_uid, 'room_id', v_check.room_id, 'check_mode', v_check.check_mode)
    );
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'check_id', _check_id,
    'status', 'undone',
    'room_id', v_check.room_id
  );
END;
$function$;