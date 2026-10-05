-- Phase 2 — State Machine v2 completion: tasks lifecycle + sleep_out/skipper booking flags
-- Idempotent migration. Designed to roll forward without breaking existing data.

-- =================================================================
-- A) housekeeping_tasks: enforce new status values + transition RPC
-- =================================================================

-- Drop any old status check constraints
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.housekeeping_tasks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.housekeeping_tasks DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.housekeeping_tasks
  ADD CONSTRAINT housekeeping_tasks_status_v2_chk
  CHECK (status IN (
    'pending',
    'in_progress',
    'completed_pending_review',
    'approved',
    'rejected_rework',
    'completed',          -- legacy + auto-approve path (no QC required)
    'cancelled'
  ));

-- Add reject reason + index for queue views
ALTER TABLE public.housekeeping_tasks
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid;

CREATE INDEX IF NOT EXISTS idx_hktasks_status_hotel
  ON public.housekeeping_tasks (hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_hktasks_pending_review
  ON public.housekeeping_tasks (hotel_id, awaiting_review_at)
  WHERE status = 'completed_pending_review';

-- Atomic transition RPC — single source of truth for task state changes
CREATE OR REPLACE FUNCTION public.transition_task_status(
  _task_id uuid,
  _to_status text,
  _reason text DEFAULT NULL,
  _force boolean DEFAULT false
) RETURNS public.housekeeping_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.housekeeping_tasks;
  _uid uuid := auth.uid();
  _is_super boolean;
  _can_qc boolean;
  _can_manage boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO _task FROM public.housekeeping_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  -- Tenant guard (defence in depth on top of RLS)
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _uid
      AND (u.tenant_id = _task.tenant_id OR u.user_level_code = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  -- Validate transition
  IF NOT _force AND NOT public.fn_is_valid_task_transition(_task.status, _to_status) THEN
    RAISE EXCEPTION 'INVALID_TASK_TRANSITION: % -> %', _task.status, _to_status;
  END IF;

  -- Permission rules
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id=_uid AND user_level_code='super_admin')
    INTO _is_super;
  _can_manage := _is_super OR public.has_permission(_uid, 'manage_housekeeping');
  _can_qc     := _can_manage; -- per spec: any user with manage_housekeeping can approve/reject

  IF _to_status IN ('approved','rejected_rework') AND NOT _can_qc THEN
    RAISE EXCEPTION 'NO_PERMISSION_QC';
  END IF;

  IF _to_status = 'cancelled' AND NOT _can_manage AND _task.assigned_to IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'NO_PERMISSION_CANCEL';
  END IF;

  -- Apply updates depending on target state
  UPDATE public.housekeeping_tasks
  SET
    status = _to_status,
    started_at = CASE WHEN _to_status='in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
    awaiting_review_at = CASE WHEN _to_status='completed_pending_review' THEN now() ELSE awaiting_review_at END,
    approved_at = CASE WHEN _to_status='approved' THEN now() ELSE approved_at END,
    approved_by = CASE WHEN _to_status='approved' THEN _uid ELSE approved_by END,
    completed_at = CASE
      WHEN _to_status IN ('approved','completed') AND completed_at IS NULL THEN now()
      ELSE completed_at
    END,
    rejected_at = CASE WHEN _to_status='rejected_rework' THEN now() ELSE rejected_at END,
    rejected_by = CASE WHEN _to_status='rejected_rework' THEN _uid ELSE rejected_by END,
    rejection_reason = CASE WHEN _to_status='rejected_rework' THEN _reason ELSE rejection_reason END,
    rework_count = CASE WHEN _to_status='rejected_rework' THEN COALESCE(rework_count,0)+1 ELSE rework_count END,
    cancelled_at = CASE WHEN _to_status='cancelled' THEN now() ELSE cancelled_at END,
    qc_status = CASE
      WHEN _to_status='approved' THEN 'approved'
      WHEN _to_status='rejected_rework' THEN 'rejected'
      WHEN _to_status='completed_pending_review' THEN 'pending'
      ELSE qc_status
    END,
    updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;

  -- Audit
  PERFORM public.log_state_transition(
    _task.tenant_id, _task.hotel_id, 'housekeeping_tasks', _task.id,
    'task_transition', _task.status, _to_status, _reason,
    jsonb_build_object('forced', _force)
  );

  RETURN _task;
END $$;

GRANT EXECUTE ON FUNCTION public.transition_task_status(uuid, text, text, boolean) TO authenticated;

-- =================================================================
-- B) room_bookings: sleep_out + skipper support
-- =================================================================

-- Drop legacy status check
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.room_bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.room_bookings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.room_bookings
  ADD CONSTRAINT room_bookings_status_v2_chk
  CHECK (status IN (
    'confirmed',
    'checked_in',
    'sleep_out',
    'skipper',
    'checked_out',
    'cancelled',
    'no_show'
  ));

ALTER TABLE public.room_bookings
  ADD COLUMN IF NOT EXISTS sleep_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS sleep_out_reason text,
  ADD COLUMN IF NOT EXISTS skipper_at timestamptz,
  ADD COLUMN IF NOT EXISTS skipper_reason text,
  ADD COLUMN IF NOT EXISTS skipper_amount_owed numeric(14,0);

-- Trigger: when booking flips to sleep_out / skipper, sync rooms.status
CREATE OR REPLACE FUNCTION public.fn_sync_room_status_on_booking_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('sleep_out','skipper') THEN
    UPDATE public.rooms
    SET status = NEW.status,
        last_status_changed_at = now(),
        last_status_changed_by = auth.uid()
    WHERE id = NEW.room_id
      AND status NOT IN ('out_of_order','out_of_service','dnd');

    PERFORM public.log_state_transition(
      NEW.tenant_id, NEW.hotel_id, 'room_bookings', NEW.id,
      'booking_flag_sync_room', OLD.status, NEW.status,
      CASE WHEN NEW.status='sleep_out' THEN NEW.sleep_out_reason ELSE NEW.skipper_reason END,
      jsonb_build_object('room_id', NEW.room_id)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_room_status_on_booking_flag ON public.room_bookings;
CREATE TRIGGER trg_sync_room_status_on_booking_flag
  AFTER UPDATE OF status ON public.room_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_room_status_on_booking_flag();

-- Atomic RPC for FO to flip booking to sleep_out / skipper / clear
CREATE OR REPLACE FUNCTION public.transition_booking_status(
  _booking_id uuid,
  _to_status text,
  _reason text DEFAULT NULL,
  _amount_owed numeric DEFAULT NULL
) RETURNS public.room_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.room_bookings;
  _uid uuid := auth.uid();
  _can_manage boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO _b FROM public.room_bookings WHERE id=_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=_uid
      AND (u.tenant_id=_b.tenant_id OR u.user_level_code='super_admin')
  ) THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  -- Allowed transitions for booking status (FO-driven)
  IF NOT (
    (_b.status = 'checked_in' AND _to_status IN ('sleep_out','skipper','checked_out'))
    OR (_b.status = 'sleep_out' AND _to_status IN ('checked_in','checked_out','skipper'))
    OR (_b.status = 'skipper'   AND _to_status IN ('checked_out'))
    OR (_b.status = 'confirmed' AND _to_status IN ('cancelled','no_show'))
  ) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TRANSITION: % -> %', _b.status, _to_status;
  END IF;

  -- Permission: skipper / sleep_out require manage_bookings (FO/Manager/Owner)
  _can_manage := EXISTS(SELECT 1 FROM public.users WHERE id=_uid AND user_level_code IN ('super_admin','tenant_owner'))
                 OR public.has_permission(_uid, 'manage_bookings');
  IF _to_status IN ('sleep_out','skipper') AND NOT _can_manage THEN
    RAISE EXCEPTION 'NO_PERMISSION_BOOKING_FLAG';
  END IF;

  UPDATE public.room_bookings SET
    status = _to_status,
    sleep_out_at = CASE WHEN _to_status='sleep_out' THEN now() ELSE sleep_out_at END,
    sleep_out_reason = CASE WHEN _to_status='sleep_out' THEN _reason ELSE sleep_out_reason END,
    skipper_at = CASE WHEN _to_status='skipper' THEN now() ELSE skipper_at END,
    skipper_reason = CASE WHEN _to_status='skipper' THEN _reason ELSE skipper_reason END,
    skipper_amount_owed = CASE WHEN _to_status='skipper' THEN COALESCE(_amount_owed, skipper_amount_owed) ELSE skipper_amount_owed END,
    updated_at = now()
  WHERE id=_booking_id
  RETURNING * INTO _b;

  PERFORM public.log_state_transition(
    _b.tenant_id, _b.hotel_id, 'room_bookings', _b.id,
    'booking_transition', _b.status, _to_status, _reason, '{}'::jsonb
  );

  RETURN _b;
END $$;

GRANT EXECUTE ON FUNCTION public.transition_booking_status(uuid, text, text, numeric) TO authenticated;