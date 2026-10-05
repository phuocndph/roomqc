-- =====================================================================
-- STATE MACHINE v2 — Rooms / Bookings / Housekeeping Tasks
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROOMS — extend status + new columns
-- ---------------------------------------------------------------------

-- Drop old constraint, build new one accepting BOTH old + new values
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_status_check;

-- Add new columns BEFORE expanding constraint so backfill is safe
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS dnd_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dnd_reason TEXT,
  ADD COLUMN IF NOT EXISTS oos_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS oos_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_deep_clean_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_status_changed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS legacy_status TEXT; -- mirror of legacy 4-state for backward UI

-- Backfill legacy_status from current value
UPDATE public.rooms SET legacy_status = status WHERE legacy_status IS NULL;

-- Migrate data to new state model
UPDATE public.rooms
SET status = CASE status
  WHEN 'vacant'       THEN 'vacant_clean'
  WHEN 'cleaning'     THEN 'vacant_dirty'
  WHEN 'occupied'     THEN 'occupied_clean'
  WHEN 'check_in'     THEN 'occupied_clean'
  WHEN 'check_out'    THEN 'vacant_dirty'
  WHEN 'maintenance'  THEN 'out_of_service'
  WHEN 'out_of_order' THEN 'out_of_order'
  ELSE status
END;

-- New constraint: ONLY new state values (clean cut)
ALTER TABLE public.rooms ADD CONSTRAINT rooms_status_check CHECK (status IN (
  'vacant_clean','vacant_inspected','vacant_dirty',
  'occupied_clean','occupied_dirty',
  'dnd','service_refused','sleep_out',
  'skipper',
  'out_of_order','out_of_service'
));

-- ---------------------------------------------------------------------
-- 2. ROOM_BOOKINGS — sleep_out / skipper support
-- ---------------------------------------------------------------------
ALTER TABLE public.room_bookings
  ADD COLUMN IF NOT EXISTS sleep_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sleep_out_note TEXT,
  ADD COLUMN IF NOT EXISTS skipper_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skipper_marked_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS skipper_note TEXT,
  ADD COLUMN IF NOT EXISTS skipper_amount_loss NUMERIC(15,2);

CREATE INDEX IF NOT EXISTS idx_room_bookings_skipper
  ON public.room_bookings (tenant_id, skipper_marked_at DESC)
  WHERE skipper_marked_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. HOUSEKEEPING_TASKS — rename status semantics (keep old aliases)
-- Map: awaiting_review → completed_pending_review, rework_required → rejected_rework
-- Keep all old values valid for backward compatibility
-- ---------------------------------------------------------------------
ALTER TABLE public.housekeeping_tasks DROP CONSTRAINT IF EXISTS housekeeping_tasks_status_check;
ALTER TABLE public.housekeeping_tasks ADD CONSTRAINT housekeeping_tasks_status_check
  CHECK (status IN (
    'pending','in_progress',
    'completed_pending_review','approved','rejected_rework',
    'completed','cancelled',
    -- legacy aliases (still accepted during rollout)
    'awaiting_review','rework_required'
  ));

-- ---------------------------------------------------------------------
-- 4. HELPER: room status alias (new → legacy 4-state)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_room_status_alias(_status TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _status
    WHEN 'vacant_clean'     THEN 'vacant'
    WHEN 'vacant_inspected' THEN 'vacant'
    WHEN 'vacant_dirty'     THEN 'cleaning'
    WHEN 'occupied_clean'   THEN 'occupied'
    WHEN 'occupied_dirty'   THEN 'occupied'
    WHEN 'dnd'              THEN 'occupied'
    WHEN 'service_refused'  THEN 'occupied'
    WHEN 'sleep_out'        THEN 'occupied'
    WHEN 'skipper'          THEN 'occupied'
    WHEN 'out_of_order'     THEN 'out_of_order'
    WHEN 'out_of_service'   THEN 'maintenance'
    ELSE _status
  END;
$$;

-- Trigger: auto-sync legacy_status whenever status changes
CREATE OR REPLACE FUNCTION public.fn_sync_room_legacy_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.legacy_status := public.fn_room_status_alias(NEW.status);
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.last_status_changed_at := now();
    NEW.last_status_changed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_room_legacy_status ON public.rooms;
CREATE TRIGGER trg_sync_room_legacy_status
  BEFORE UPDATE OF status ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_room_legacy_status();

-- Also sync on insert
CREATE OR REPLACE FUNCTION public.fn_sync_room_legacy_status_ins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.legacy_status := public.fn_room_status_alias(NEW.status);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_room_legacy_status_ins ON public.rooms;
CREATE TRIGGER trg_sync_room_legacy_status_ins
  BEFORE INSERT ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_room_legacy_status_ins();

-- Backfill legacy_status with new mapping
UPDATE public.rooms SET legacy_status = public.fn_room_status_alias(status);

-- ---------------------------------------------------------------------
-- 5. ROOM TRANSITION VALIDATOR
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_valid_room_transition(_from TEXT, _to TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- ANY → out_of_order/out_of_service always allowed (Manager+)
    WHEN _to IN ('out_of_order','out_of_service') THEN true
    -- Same state = no-op allowed
    WHEN _from = _to THEN true
    -- From OOO/OOS only return to dirty/clean
    WHEN _from = 'out_of_order'   AND _to IN ('vacant_dirty','vacant_clean') THEN true
    WHEN _from = 'out_of_service' AND _to IN ('vacant_clean','vacant_dirty') THEN true
    -- Cleaning lifecycle
    WHEN _from = 'vacant_dirty'     AND _to IN ('vacant_clean','occupied_clean') THEN true -- last is rare emergency check-in
    WHEN _from = 'vacant_clean'     AND _to IN ('vacant_inspected','occupied_clean','vacant_dirty') THEN true
    WHEN _from = 'vacant_inspected' AND _to IN ('occupied_clean','vacant_clean','vacant_dirty') THEN true
    -- Occupied transitions
    WHEN _from = 'occupied_clean'   AND _to IN ('occupied_dirty','dnd','sleep_out','skipper','vacant_dirty') THEN true
    WHEN _from = 'occupied_dirty'   AND _to IN ('occupied_clean','dnd','service_refused','sleep_out','skipper','vacant_dirty') THEN true
    WHEN _from = 'dnd'              AND _to IN ('occupied_clean','occupied_dirty','service_refused','vacant_dirty') THEN true
    WHEN _from = 'service_refused'  AND _to IN ('occupied_clean','occupied_dirty','dnd','vacant_dirty') THEN true
    WHEN _from = 'sleep_out'        AND _to IN ('occupied_clean','occupied_dirty','vacant_dirty','skipper') THEN true
    WHEN _from = 'skipper'          AND _to IN ('vacant_dirty') THEN true
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------------
-- 6. ROLE PERMISSION CHECK FOR TRANSITION
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_can_user_transition_room(
  _user_id UUID, _from TEXT, _to TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_owner   BOOLEAN := public.has_role(_user_id, 'owner'::app_role) OR public.has_role(_user_id, 'super_admin'::app_role);
  v_is_manager BOOLEAN := public.has_role(_user_id, 'hotel_manager'::app_role) OR public.has_role(_user_id, 'department_manager'::app_role);
  v_is_staff   BOOLEAN := public.has_role(_user_id, 'staff'::app_role);
BEGIN
  -- Owner / Super admin: all transitions
  IF v_is_owner THEN RETURN true; END IF;

  -- Out-of-order / out-of-service: only manager+
  IF _to IN ('out_of_order','out_of_service') THEN
    RETURN v_is_manager;
  END IF;

  -- Lift OOO/OOS: only manager+
  IF _from IN ('out_of_order','out_of_service') THEN
    RETURN v_is_manager;
  END IF;

  -- Vacant_inspected (QC pass): supervisor / manager+
  IF _to = 'vacant_inspected' THEN
    RETURN v_is_manager;
  END IF;

  -- Skipper: only manager+ (financial implication)
  IF _to = 'skipper' OR _from = 'skipper' THEN
    RETURN v_is_manager;
  END IF;

  -- Manager: any other transition
  IF v_is_manager THEN RETURN true; END IF;

  -- Staff: cleaning + occupied service transitions only
  IF v_is_staff THEN
    -- HK cleaning
    IF _from = 'vacant_dirty' AND _to = 'vacant_clean' THEN RETURN true; END IF;
    IF _from = 'occupied_dirty' AND _to = 'occupied_clean' THEN RETURN true; END IF;
    -- Service refused / DND markers
    IF _to IN ('dnd','service_refused') THEN RETURN true; END IF;
    -- Lift DND (FO function but staff can do it too)
    IF _from = 'dnd' AND _to IN ('occupied_clean','occupied_dirty') THEN RETURN true; END IF;
    -- Check-in/out (FO is typically staff)
    IF _to = 'occupied_clean' AND _from IN ('vacant_clean','vacant_inspected') THEN RETURN true; END IF;
    IF _to = 'vacant_dirty' AND _from LIKE 'occupied_%' THEN RETURN true; END IF;
    IF _to = 'vacant_dirty' AND _from IN ('dnd','service_refused','sleep_out') THEN RETURN true; END IF;
    -- Sleep out
    IF _to = 'sleep_out' OR (_from = 'sleep_out' AND _to LIKE 'occupied_%') THEN RETURN true; END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC: transition_room_status (gateway with full validation)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_room_status(
  _room_id UUID,
  _to_status TEXT,
  _reason TEXT DEFAULT NULL,
  _dnd_until TIMESTAMPTZ DEFAULT NULL,
  _oos_until TIMESTAMPTZ DEFAULT NULL,
  _force BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room       RECORD;
  v_user_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_room FROM public.rooms WHERE id = _room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF v_room.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  -- Validate transition
  IF NOT _force AND NOT public.fn_is_valid_room_transition(v_room.status, _to_status) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % → %', v_room.status, _to_status;
  END IF;

  -- Validate role permission (force=true requires owner)
  IF _force THEN
    IF NOT (public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
      RAISE EXCEPTION 'FORCE_REQUIRES_OWNER';
    END IF;
  ELSIF NOT public.fn_can_user_transition_room(auth.uid(), v_room.status, _to_status) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_FOR_TRANSITION';
  END IF;

  -- Validate DND/OOS deadlines
  IF _to_status = 'dnd' AND _dnd_until IS NOT NULL AND _dnd_until <= now() THEN
    RAISE EXCEPTION 'DND_UNTIL_MUST_BE_FUTURE';
  END IF;
  IF _to_status = 'out_of_service' AND _oos_until IS NOT NULL AND _oos_until <= now() THEN
    RAISE EXCEPTION 'OOS_UNTIL_MUST_BE_FUTURE';
  END IF;

  -- Apply transition (legacy_status auto-synced by trigger)
  UPDATE public.rooms SET
    status = _to_status,
    dnd_until    = CASE WHEN _to_status = 'dnd'             THEN COALESCE(_dnd_until, now() + interval '4 hours') ELSE NULL END,
    dnd_reason   = CASE WHEN _to_status = 'dnd'             THEN _reason ELSE NULL END,
    oos_until    = CASE WHEN _to_status = 'out_of_service'  THEN _oos_until ELSE NULL END,
    oos_reason   = CASE WHEN _to_status IN ('out_of_service','out_of_order') THEN _reason ELSE oos_reason END,
    last_deep_clean_at = CASE
      WHEN v_room.status = 'out_of_service' AND _to_status = 'vacant_clean' THEN now()
      ELSE last_deep_clean_at
    END
  WHERE id = _room_id;

  -- Audit (room_audit handled by trg if rooms has audit; otherwise insert manually)
  INSERT INTO public.audit_log (
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, old_data, new_data, context
  ) VALUES (
    v_room.tenant_id, v_room.hotel_id, 'rooms', _room_id, 'state_change',
    auth.uid(), jsonb_build_object('status', v_room.status),
    jsonb_build_object('status', _to_status),
    jsonb_build_object('reason', _reason, 'force', _force, 'dnd_until', _dnd_until, 'oos_until', _oos_until)
  );

  RETURN jsonb_build_object(
    'room_id', _room_id,
    'from', v_room.status,
    'to', _to_status,
    'legacy_status', public.fn_room_status_alias(_to_status)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 8. TASK TRANSITION VALIDATOR + RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_valid_task_transition(_from TEXT, _to TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _to = 'cancelled' THEN true
    WHEN _from = _to THEN true
    -- Normalize legacy aliases
    WHEN _from = 'pending'      AND _to IN ('in_progress','cancelled') THEN true
    WHEN _from = 'in_progress'  AND _to IN ('completed_pending_review','completed','cancelled') THEN true
    WHEN _from IN ('completed_pending_review','awaiting_review') AND _to IN ('approved','rejected_rework','completed','rework_required') THEN true
    WHEN _from IN ('rejected_rework','rework_required') AND _to IN ('in_progress','cancelled') THEN true
    WHEN _from = 'approved'  AND _to IN ('cancelled') THEN true -- post-approval cancel is rare but allowed
    WHEN _from = 'completed' AND _to IN ('cancelled') THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.transition_task_status(
  _task_id UUID,
  _to_status TEXT,
  _reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task RECORD;
  v_user_tenant UUID;
  v_is_manager BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  IF v_task.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  IF NOT public.fn_is_valid_task_transition(v_task.status, _to_status) THEN
    RAISE EXCEPTION 'INVALID_TASK_TRANSITION: % → %', v_task.status, _to_status;
  END IF;

  v_is_manager := public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'hotel_manager'::app_role)
    OR public.has_role(auth.uid(),'department_manager'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role);

  -- Permission for QC actions
  IF _to_status IN ('approved','rejected_rework') AND NOT v_is_manager THEN
    RAISE EXCEPTION 'QC_REQUIRES_MANAGER';
  END IF;

  -- Cancel only by manager OR original requester
  IF _to_status = 'cancelled' AND NOT v_is_manager AND v_task.requested_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CANCEL_PERMISSION_DENIED';
  END IF;

  UPDATE public.housekeeping_tasks SET
    status = _to_status,
    started_at   = CASE WHEN _to_status = 'in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
    completed_at = CASE WHEN _to_status IN ('approved','completed') THEN COALESCE(completed_at, now()) ELSE completed_at END,
    cancelled_at = CASE WHEN _to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    notes = CASE WHEN _reason IS NOT NULL THEN COALESCE(notes,'') || E'\n[' || now()::text || '] ' || _reason ELSE notes END,
    updated_at = now()
  WHERE id = _task_id;

  RETURN jsonb_build_object('task_id', _task_id, 'from', v_task.status, 'to', _to_status);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. CRON: lift expired DND / OOS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lift_expired_dnd_oos()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dnd_count INT := 0;
  v_oos_count INT := 0;
BEGIN
  WITH dnd_lifted AS (
    UPDATE public.rooms
    SET status = 'occupied_clean', dnd_until = NULL, dnd_reason = NULL
    WHERE status = 'dnd' AND dnd_until IS NOT NULL AND dnd_until < now()
    RETURNING id
  ) SELECT count(*) INTO v_dnd_count FROM dnd_lifted;

  WITH oos_lifted AS (
    UPDATE public.rooms
    SET status = 'vacant_clean', oos_until = NULL, oos_reason = NULL
    WHERE status = 'out_of_service' AND oos_until IS NOT NULL AND oos_until < now()
    RETURNING id
  ) SELECT count(*) INTO v_oos_count FROM oos_lifted;

  -- Audit batch
  INSERT INTO public.audit_log (table_name, record_id, action, actor_id, context)
  VALUES ('rooms', '00000000-0000-0000-0000-000000000000', 'state_change', NULL,
          jsonb_build_object('cron','lift_expired_dnd_oos','dnd_lifted', v_dnd_count, 'oos_lifted', v_oos_count));

  RETURN jsonb_build_object('dnd_lifted', v_dnd_count, 'oos_lifted', v_oos_count);
END;
$$;

-- ---------------------------------------------------------------------
-- 10. PERMISSIONS — revoke from public/anon, grant to authenticated
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.transition_room_status(UUID,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_task_status(UUID,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_can_user_transition_room(UUID,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lift_expired_dnd_oos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_room_legacy_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_room_legacy_status_ins() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_room_status(UUID,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_task_status(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_can_user_transition_room(UUID,TEXT,TEXT) TO authenticated;

-- Indexes for hot queries
CREATE INDEX IF NOT EXISTS idx_rooms_dnd_until ON public.rooms (dnd_until) WHERE status = 'dnd';
CREATE INDEX IF NOT EXISTS idx_rooms_oos_until ON public.rooms (oos_until) WHERE status = 'out_of_service';
CREATE INDEX IF NOT EXISTS idx_rooms_legacy_status ON public.rooms (tenant_id, hotel_id, legacy_status);

-- Audit trigger for rooms (so transitions outside RPC also logged)
DROP TRIGGER IF EXISTS trg_audit_rooms ON public.rooms;
CREATE TRIGGER trg_audit_rooms
  AFTER UPDATE OF status ON public.rooms
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_write_audit_log();