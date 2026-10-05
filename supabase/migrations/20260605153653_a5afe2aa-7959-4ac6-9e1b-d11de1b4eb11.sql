
-- Sprint 1 audit /inventory: atomic FSM for stock_adjustments
-- - Adds public.fn_is_valid_adjustment_transition(_from, _to)
-- - Adds public.transition_adjustment_status(_id, _to, _reason, _force) RPC
-- - Logs every transition via log_state_transition (audit_log table)
-- NOTE: We intentionally DO NOT revoke UPDATE on stock_adjustments.status yet —
-- legacy hooks still write directly. Revoke will happen in Sprint 4 after migration.

CREATE OR REPLACE FUNCTION public.fn_is_valid_adjustment_transition(_from text, _to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Starting checks
    WHEN _from IS NULL AND _to IN ('draft','in_progress') THEN true
    WHEN _from = 'draft'       AND _to IN ('in_progress','cancelled') THEN true
    WHEN _from = 'in_progress' AND _to IN ('completed','cancelled') THEN true
    -- Manager review of a completed adjustment
    WHEN _from = 'completed'   AND _to IN ('approved','rejected','in_progress') THEN true
    -- Allow reopen of approved/rejected only via force flag (handled in RPC)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.transition_adjustment_status(
  _adjustment_id uuid,
  _to_status text,
  _reason text DEFAULT NULL,
  _force boolean DEFAULT false
)
RETURNS public.stock_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _adj public.stock_adjustments;
  _uid uuid := auth.uid();
  _is_super boolean;
  _can_manage boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO _adj FROM public.stock_adjustments WHERE id = _adjustment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADJUSTMENT_NOT_FOUND';
  END IF;

  -- Tenant guard (defence in depth)
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _uid
      AND (u.tenant_id = _adj.tenant_id OR u.user_level_code = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  -- Permissions
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id=_uid AND user_level_code='super_admin')
    INTO _is_super;
  _can_manage := _is_super OR public.has_permission(_uid, 'manage_inventory');

  -- Approve / reject require manager-level permission
  IF _to_status IN ('approved','rejected') AND NOT _can_manage THEN
    RAISE EXCEPTION 'NO_PERMISSION_APPROVE';
  END IF;

  -- Validate transition (skip if forced by manager/super_admin)
  IF NOT (_force AND _can_manage)
     AND NOT public.fn_is_valid_adjustment_transition(_adj.status, _to_status) THEN
    RAISE EXCEPTION 'INVALID_ADJUSTMENT_TRANSITION: % -> %', _adj.status, _to_status;
  END IF;

  UPDATE public.stock_adjustments
  SET
    status = _to_status,
    started_at = CASE
      WHEN _to_status='in_progress' AND started_at IS NULL THEN now()
      ELSE started_at
    END,
    completed_at = CASE
      WHEN _to_status='completed' AND completed_at IS NULL THEN now()
      ELSE completed_at
    END,
    approved_at = CASE
      WHEN _to_status='approved' THEN now()
      ELSE approved_at
    END,
    approved_by = CASE
      WHEN _to_status='approved' THEN _uid
      ELSE approved_by
    END,
    approval_notes = CASE
      WHEN _to_status IN ('approved','rejected') THEN COALESCE(_reason, approval_notes)
      ELSE approval_notes
    END,
    updated_at = now()
  WHERE id = _adjustment_id
  RETURNING * INTO _adj;

  PERFORM public.log_state_transition(
    _adj.tenant_id, _adj.hotel_id, 'stock_adjustments', _adj.id,
    'adjustment_transition', _adj.status, _to_status, _reason,
    jsonb_build_object('forced', _force)
  );

  RETURN _adj;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_adjustment_status(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_valid_adjustment_transition(text, text) TO authenticated;
