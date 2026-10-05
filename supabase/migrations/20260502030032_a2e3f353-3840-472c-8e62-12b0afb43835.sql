-- =====================================================================
-- Room Check Lean v1 — minimal schema additions
-- =====================================================================

-- 1) Bổ sung cột cho room_checks (tất cả nullable / có default → an toàn)
ALTER TABLE public.room_checks
  ADD COLUMN IF NOT EXISTS task_id uuid NULL
    REFERENCES public.housekeeping_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS summary_ok_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_issue_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minibar_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Constraint cho status (Lean: chỉ 2 trạng thái hợp lệ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'room_checks_status_check'
  ) THEN
    ALTER TABLE public.room_checks
      ADD CONSTRAINT room_checks_status_check
      CHECK (status IN ('submitted', 'reopened'));
  END IF;
END $$;

-- 2) Index hỗ trợ rate-limit Quick Path
CREATE INDEX IF NOT EXISTS idx_room_checks_quick_rate_limit
  ON public.room_checks (room_id, check_mode, checked_at DESC)
  WHERE check_mode = 'quick';

CREATE INDEX IF NOT EXISTS idx_room_checks_task_id
  ON public.room_checks (task_id)
  WHERE task_id IS NOT NULL;

-- 3) Trigger updated_at (dùng helper sẵn có nếu có)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_room_checks_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_room_checks_set_updated_at
      BEFORE UPDATE ON public.room_checks
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) Backfill summary counters cho rows cũ (đếm jsonb buckets)
UPDATE public.room_checks
SET
  summary_issue_count = COALESCE(jsonb_array_length(items_missing), 0)
                      + COALESCE(jsonb_array_length(items_damaged), 0)
                      + COALESCE(jsonb_array_length(items_lost), 0),
  minibar_count = COALESCE(jsonb_array_length(items_consumed), 0)
WHERE summary_issue_count = 0 AND summary_ok_count = 0 AND minibar_count = 0;

-- 5) Cấu hình Lean cho mỗi hotel — gộp vào hotels.settings.room_check
--    Không phá enum photo_evidence_mode hiện có; settings là lớp bổ sung granular.
UPDATE public.hotels
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'room_check', COALESCE(settings->'room_check', '{}'::jsonb) || jsonb_build_object(
    'quick_path_enabled', COALESCE((settings->'room_check'->>'quick_path_enabled')::boolean, true),
    'quick_path_rate_limit_minutes', COALESCE((settings->'room_check'->>'quick_path_rate_limit_minutes')::int, 30),
    'photo_required_damaged_lost', COALESCE((settings->'room_check'->>'photo_required_damaged_lost')::boolean, true),
    'photo_required_missing_replace', COALESCE((settings->'room_check'->>'photo_required_missing_replace')::boolean, false),
    'photo_required_consumed_chargeable', COALESCE((settings->'room_check'->>'photo_required_consumed_chargeable')::boolean, false)
  )
)
WHERE settings IS DISTINCT FROM (
  COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
    'room_check', COALESCE(settings->'room_check', '{}'::jsonb)
  )
) OR settings->'room_check' IS NULL;

-- 6) Helper function: kiểm tra rate-limit Quick Path (server-side guard, dùng sau)
CREATE OR REPLACE FUNCTION public.can_perform_quick_check(_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hotel_id uuid;
  _limit_min int;
  _last_quick timestamptz;
BEGIN
  SELECT hotel_id INTO _hotel_id FROM public.rooms WHERE id = _room_id;
  IF _hotel_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE((settings->'room_check'->>'quick_path_rate_limit_minutes')::int, 30)
    INTO _limit_min
  FROM public.hotels WHERE id = _hotel_id;

  SELECT MAX(checked_at) INTO _last_quick
  FROM public.room_checks
  WHERE room_id = _room_id AND check_mode = 'quick';

  RETURN _last_quick IS NULL
      OR _last_quick < (now() - (_limit_min || ' minutes')::interval);
END $$;

GRANT EXECUTE ON FUNCTION public.can_perform_quick_check(uuid) TO authenticated;

COMMENT ON COLUMN public.room_checks.task_id IS 'Lean: optional link to housekeeping task that spawned this check';
COMMENT ON COLUMN public.room_checks.summary_ok_count IS 'Lean: denormalized count of items confirmed OK (for list views)';
COMMENT ON COLUMN public.room_checks.summary_issue_count IS 'Lean: denormalized count of issues (missing+damaged+lost)';
COMMENT ON COLUMN public.room_checks.minibar_count IS 'Lean: denormalized count of consumed/chargeable items';
COMMENT ON COLUMN public.room_checks.status IS 'Lean: submitted (default) | reopened';
