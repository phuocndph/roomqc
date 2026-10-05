-- ─────────────────────────────────────────────────────────────
-- undo_quick_room_check — cho phép user vừa gửi quick path
-- huỷ kết quả trong cửa sổ thời gian ngắn (mặc định 10 phút).
-- Atomic + audit log + chỉ chính người gửi (hoặc supervisor) mới huỷ được.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.undo_quick_room_check(
  _check_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Tenant guard
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_uid;
  IF v_tenant IS NULL OR v_tenant <> v_check.tenant_id THEN
    RAISE EXCEPTION 'forbidden_tenant';
  END IF;

  -- Quyền: chính người gửi hoặc owner/manager
  SELECT user_level INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_check.checked_by <> v_uid
     AND COALESCE(v_role,'') NOT IN ('tenant_owner','manager','super_admin') THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  -- Chỉ undo được quick check
  IF COALESCE(v_check.check_mode, '') <> 'quick' THEN
    RAISE EXCEPTION 'not_quick_check';
  END IF;

  -- Cửa sổ thời gian
  v_age_seconds := EXTRACT(EPOCH FROM (now() - v_check.checked_at));
  IF v_age_seconds > v_window_minutes * 60 THEN
    RAISE EXCEPTION 'undo_window_expired:%', v_window_minutes;
  END IF;

  -- Đã có check mới hơn cho phòng này → không cho undo (tránh ghi đè im lặng)
  IF EXISTS (
    SELECT 1 FROM public.room_checks
    WHERE room_id = v_check.room_id
      AND checked_at > v_check.checked_at
      AND id <> v_check.id
  ) THEN
    RAISE EXCEPTION 'newer_check_exists';
  END IF;

  -- Soft delete: đánh dấu undone (giữ audit), không xoá row
  UPDATE public.room_checks
     SET status = 'undone',
         notes = COALESCE(notes,'') ||
                 CASE WHEN _reason IS NOT NULL
                      THEN E'\n[Hoàn tác] ' || _reason
                      ELSE E'\n[Hoàn tác]' END
   WHERE id = _check_id;

  -- Audit (best-effort qua helper nếu có)
  BEGIN
    PERFORM public.log_state_transition(
      'room_check', _check_id,
      v_check.status, 'undone',
      v_uid, COALESCE(_reason, 'undo quick check'),
      jsonb_build_object('room_id', v_check.room_id, 'check_mode', v_check.check_mode)
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
$$;

REVOKE ALL ON FUNCTION public.undo_quick_room_check(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_quick_room_check(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.undo_quick_room_check IS
  'Lean Room Check: huỷ một quick check vừa gửi trong cửa sổ 10 phút. Bị chặn nếu đã có check mới hơn.';