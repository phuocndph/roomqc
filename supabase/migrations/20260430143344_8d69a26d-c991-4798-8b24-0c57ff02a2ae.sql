-- =====================================================================
-- HOUSEKEEPING QC v1 — Schema + RPC + Audit + RLS
-- Backward compatible: cột mới đều có default an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. AUDIT LOG (unified)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  hotel_id UUID,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert','update','delete','state_change','qc_action')),
  actor_id UUID,
  actor_role TEXT,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_table_record
  ON public.audit_log (tenant_id, table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner views all tenant audit"
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR actor_id = auth.uid()
      OR hotel_id IN (SELECT hotel_id FROM public.user_hotels WHERE user_id = auth.uid())
    )
  );

-- Insert chỉ qua trigger SECURITY DEFINER, không cấp policy insert cho user

-- ---------------------------------------------------------------------
-- 2. QC SLA SETTINGS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qc_sla_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'checkout_inspection','cleaning','checkin_prep','amenity_request','delivery_confirmation','other','all'
  )),
  qc_required BOOLEAN NOT NULL DEFAULT false,
  sla_minutes INTEGER NOT NULL DEFAULT 30 CHECK (sla_minutes BETWEEN 1 AND 1440),
  max_rework_count INTEGER NOT NULL DEFAULT 3 CHECK (max_rework_count BETWEEN 1 AND 10),
  auto_escalate BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, hotel_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_qc_sla_tenant_hotel
  ON public.qc_sla_settings (tenant_id, hotel_id);

ALTER TABLE public.qc_sla_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read SLA"
  ON public.qc_sla_settings FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Owner/Manager manage SLA"
  ON public.qc_sla_settings FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'hotel_manager'::app_role)
      OR public.has_role(auth.uid(), 'department_manager'::app_role)
    )
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE TRIGGER trg_qc_sla_updated_at
  BEFORE UPDATE ON public.qc_sla_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. QC REVIEWS (rework history)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  hotel_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES public.housekeeping_tasks(id) ON DELETE CASCADE,
  room_check_id UUID REFERENCES public.room_checks(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','force_approved')),
  rework_iteration INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  reject_categories TEXT[] DEFAULT '{}'::text[],
  score_override INTEGER CHECK (score_override IS NULL OR score_override BETWEEN 1 AND 5),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_reviews_task ON public.qc_reviews (task_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_reviews_reviewer ON public.qc_reviews (reviewer_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_reviews_tenant_hotel ON public.qc_reviews (tenant_id, hotel_id, reviewed_at DESC);

ALTER TABLE public.qc_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read qc_reviews"
  ON public.qc_reviews FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Insert chỉ qua RPC SECURITY DEFINER

-- ---------------------------------------------------------------------
-- 4. EXTEND housekeeping_tasks
-- ---------------------------------------------------------------------
ALTER TABLE public.housekeeping_tasks
  ADD COLUMN IF NOT EXISTS qc_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qc_status TEXT,
  ADD COLUMN IF NOT EXISTS rework_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awaiting_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qc_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id);

-- Mở rộng status check constraint (drop & recreate)
ALTER TABLE public.housekeeping_tasks DROP CONSTRAINT IF EXISTS housekeeping_tasks_status_check;
ALTER TABLE public.housekeeping_tasks ADD CONSTRAINT housekeeping_tasks_status_check
  CHECK (status IN ('pending','in_progress','awaiting_review','rework_required','completed','cancelled'));

ALTER TABLE public.housekeeping_tasks DROP CONSTRAINT IF EXISTS housekeeping_tasks_qc_status_check;
ALTER TABLE public.housekeeping_tasks ADD CONSTRAINT housekeeping_tasks_qc_status_check
  CHECK (qc_status IS NULL OR qc_status IN ('not_required','pending_review','approved','rejected','force_approved'));

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_qc_due
  ON public.housekeeping_tasks (qc_due_at)
  WHERE status = 'awaiting_review';

CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_awaiting
  ON public.housekeeping_tasks (tenant_id, hotel_id, awaiting_review_at)
  WHERE status = 'awaiting_review';

-- ---------------------------------------------------------------------
-- 5. EXTEND room_checks
-- ---------------------------------------------------------------------
ALTER TABLE public.room_checks
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS hotel_id UUID,
  ADD COLUMN IF NOT EXISTS qc_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qc_status TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_override INTEGER CHECK (score_override IS NULL OR score_override BETWEEN 1 AND 5);

ALTER TABLE public.room_checks DROP CONSTRAINT IF EXISTS room_checks_qc_status_check;
ALTER TABLE public.room_checks ADD CONSTRAINT room_checks_qc_status_check
  CHECK (qc_status IS NULL OR qc_status IN ('not_required','pending_review','approved','rejected','force_approved'));

-- Mở rộng check_type cho phép giá trị mới (delivery, replenish đã dùng ở client)
ALTER TABLE public.room_checks DROP CONSTRAINT IF EXISTS room_checks_type_check;
ALTER TABLE public.room_checks ADD CONSTRAINT room_checks_type_check
  CHECK (check_type IN ('daily','checkin','checkout','maintenance','delivery','replenish','periodic'));

-- Backfill tenant_id/hotel_id cho row cũ
UPDATE public.room_checks rc
SET tenant_id = r.tenant_id, hotel_id = r.hotel_id
FROM public.rooms r
WHERE rc.room_id = r.id AND rc.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_room_checks_tenant_hotel
  ON public.room_checks (tenant_id, hotel_id, checked_at DESC);

-- ---------------------------------------------------------------------
-- 6. AUDIT TRIGGER FUNCTION
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role TEXT;
  v_tenant UUID;
  v_hotel UUID;
  v_changed TEXT[];
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'state_change' ELSE 'update' END;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_old) o
    WHERE o.value IS DISTINCT FROM (v_new -> o.key);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_new := NULL;
  END IF;

  -- Lấy tenant/hotel từ NEW hoặc OLD
  v_tenant := COALESCE((v_new->>'tenant_id')::uuid, (v_old->>'tenant_id')::uuid);
  v_hotel := COALESCE((v_new->>'hotel_id')::uuid, (v_old->>'hotel_id')::uuid);

  SELECT user_level_code INTO v_actor_role FROM public.users WHERE id = v_actor;

  INSERT INTO public.audit_log (
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, actor_role, old_data, new_data, changed_fields
  ) VALUES (
    v_tenant, v_hotel, TG_TABLE_NAME,
    COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid),
    v_action, v_actor, v_actor_role, v_old, v_new, v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_housekeeping_tasks ON public.housekeeping_tasks;
CREATE TRIGGER trg_audit_housekeeping_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_write_audit_log();

DROP TRIGGER IF EXISTS trg_audit_room_checks ON public.room_checks;
CREATE TRIGGER trg_audit_room_checks
  AFTER INSERT OR UPDATE OR DELETE ON public.room_checks
  FOR EACH ROW EXECUTE FUNCTION public.fn_write_audit_log();

DROP TRIGGER IF EXISTS trg_audit_qc_reviews ON public.qc_reviews;
CREATE TRIGGER trg_audit_qc_reviews
  AFTER INSERT ON public.qc_reviews
  FOR EACH ROW EXECUTE FUNCTION public.fn_write_audit_log();

-- ---------------------------------------------------------------------
-- 7. HELPER: resolve qc settings
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_qc_settings(
  _tenant_id UUID, _hotel_id UUID, _task_type TEXT
) RETURNS TABLE (qc_required BOOLEAN, sla_minutes INTEGER, max_rework_count INTEGER, auto_escalate BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.qc_required, s.sla_minutes, s.max_rework_count, s.auto_escalate
  FROM public.qc_sla_settings s
  WHERE s.tenant_id = _tenant_id
    AND (s.hotel_id = _hotel_id OR s.hotel_id IS NULL)
    AND (s.task_type = _task_type OR s.task_type = 'all')
  ORDER BY (s.hotel_id IS NOT NULL) DESC, (s.task_type <> 'all') DESC
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC: submit_room_check_for_qc
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_room_check_for_qc(
  _task_id UUID,
  _room_check_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task RECORD;
  v_settings RECORD;
  v_qc_required BOOLEAN;
  v_sla INTEGER := 30;
BEGIN
  SELECT * INTO v_task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;

  -- Resolve QC settings
  SELECT * INTO v_settings FROM public.resolve_qc_settings(v_task.tenant_id, v_task.hotel_id, v_task.task_type);
  v_qc_required := COALESCE(v_settings.qc_required, v_task.task_type = 'checkout_inspection');
  v_sla := COALESCE(v_settings.sla_minutes, 30);

  IF v_qc_required THEN
    UPDATE public.housekeeping_tasks
    SET status = 'awaiting_review',
        qc_required = true,
        qc_status = 'pending_review',
        awaiting_review_at = now(),
        qc_due_at = now() + (v_sla || ' minutes')::interval,
        room_check_id = COALESCE(_room_check_id, room_check_id),
        updated_at = now()
    WHERE id = _task_id;

    UPDATE public.room_checks
    SET qc_required = true, qc_status = 'pending_review'
    WHERE id = _room_check_id;

    RETURN jsonb_build_object('status','awaiting_review','qc_due_at', now() + (v_sla || ' minutes')::interval);
  ELSE
    UPDATE public.housekeeping_tasks
    SET status = 'completed',
        qc_status = 'not_required',
        completed_at = now(),
        room_check_id = COALESCE(_room_check_id, room_check_id),
        updated_at = now()
    WHERE id = _task_id;

    UPDATE public.room_checks
    SET qc_status = 'not_required' WHERE id = _room_check_id;

    RETURN jsonb_build_object('status','completed');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 9. RPC: qc_approve_task
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qc_approve_task(
  _task_id UUID,
  _score_override INTEGER DEFAULT NULL,
  _notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task RECORD;
  v_user_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  IF v_task.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;
  IF v_task.status <> 'awaiting_review' THEN RAISE EXCEPTION 'INVALID_STATE: % cannot be approved', v_task.status; END IF;

  -- Permission: manager or owner
  IF NOT (public.has_role(auth.uid(),'owner'::app_role)
       OR public.has_role(auth.uid(),'hotel_manager'::app_role)
       OR public.has_role(auth.uid(),'department_manager'::app_role)
       OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  INSERT INTO public.qc_reviews (
    tenant_id, hotel_id, task_id, room_check_id, reviewer_id,
    decision, rework_iteration, reason, score_override
  ) VALUES (
    v_task.tenant_id, v_task.hotel_id, _task_id, v_task.room_check_id, auth.uid(),
    'approved', v_task.rework_count, _notes, _score_override
  );

  UPDATE public.housekeeping_tasks
  SET status = 'completed',
      qc_status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = _task_id;

  UPDATE public.room_checks
  SET qc_status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      score_override = COALESCE(_score_override, score_override)
  WHERE id = v_task.room_check_id;

  RETURN jsonb_build_object('status','completed','qc_status','approved');
END;
$$;

-- ---------------------------------------------------------------------
-- 10. RPC: qc_reject_task (rework loop)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qc_reject_task(
  _task_id UUID,
  _reason TEXT,
  _categories TEXT[] DEFAULT '{}'::text[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task RECORD;
  v_settings RECORD;
  v_max_rework INTEGER := 3;
  v_user_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  IF v_task.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;
  IF v_task.status <> 'awaiting_review' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  IF NOT (public.has_role(auth.uid(),'owner'::app_role)
       OR public.has_role(auth.uid(),'hotel_manager'::app_role)
       OR public.has_role(auth.uid(),'department_manager'::app_role)
       OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT * INTO v_settings FROM public.resolve_qc_settings(v_task.tenant_id, v_task.hotel_id, v_task.task_type);
  v_max_rework := COALESCE(v_settings.max_rework_count, 3);

  INSERT INTO public.qc_reviews (
    tenant_id, hotel_id, task_id, room_check_id, reviewer_id,
    decision, rework_iteration, reason, reject_categories
  ) VALUES (
    v_task.tenant_id, v_task.hotel_id, _task_id, v_task.room_check_id, auth.uid(),
    'rejected', v_task.rework_count + 1, _reason, _categories
  );

  -- Nếu vượt max_rework → đẩy về rework_required nhưng đánh dấu cần force_approve
  UPDATE public.housekeeping_tasks
  SET status = 'rework_required',
      qc_status = 'rejected',
      rework_count = rework_count + 1,
      awaiting_review_at = NULL,
      qc_due_at = NULL,
      priority = CASE WHEN rework_count + 1 >= v_max_rework THEN 'urgent' ELSE priority END,
      updated_at = now()
  WHERE id = _task_id;

  UPDATE public.room_checks
  SET qc_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = v_task.room_check_id;

  RETURN jsonb_build_object(
    'status','rework_required',
    'rework_count', v_task.rework_count + 1,
    'max_rework', v_max_rework,
    'requires_force_approve', (v_task.rework_count + 1) >= v_max_rework
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 11. RPC: qc_force_approve (Owner/Manager override after max rework)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qc_force_approve(
  _task_id UUID,
  _reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task RECORD;
  v_user_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED_MIN_10'; END IF;

  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  IF v_task.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  IF NOT (public.has_role(auth.uid(),'owner'::app_role)
       OR public.has_role(auth.uid(),'hotel_manager'::app_role)
       OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_OWNER_OR_MANAGER_ONLY';
  END IF;

  INSERT INTO public.qc_reviews (
    tenant_id, hotel_id, task_id, room_check_id, reviewer_id,
    decision, rework_iteration, reason
  ) VALUES (
    v_task.tenant_id, v_task.hotel_id, _task_id, v_task.room_check_id, auth.uid(),
    'force_approved', v_task.rework_count, _reason
  );

  UPDATE public.housekeeping_tasks
  SET status = 'completed',
      qc_status = 'force_approved',
      approved_at = now(),
      approved_by = auth.uid(),
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = _task_id;

  UPDATE public.room_checks
  SET qc_status = 'force_approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = v_task.room_check_id;

  RETURN jsonb_build_object('status','completed','qc_status','force_approved');
END;
$$;

-- ---------------------------------------------------------------------
-- 12. RPC: qc_escalate_overdue (cron)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qc_escalate_overdue()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH escalated AS (
    UPDATE public.housekeeping_tasks
    SET priority = 'urgent', updated_at = now()
    WHERE status = 'awaiting_review'
      AND qc_due_at IS NOT NULL
      AND qc_due_at < now()
      AND priority <> 'urgent'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM escalated;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- 13. Default SLA seed: bật QC mặc định cho checkout_inspection toàn tenant
-- ---------------------------------------------------------------------
INSERT INTO public.qc_sla_settings (tenant_id, hotel_id, task_type, qc_required, sla_minutes, max_rework_count, auto_escalate)
SELECT t.id, NULL, 'checkout_inspection', true, 30, 3, true
FROM public.tenants t
ON CONFLICT (tenant_id, hotel_id, task_type) DO NOTHING;

-- ---------------------------------------------------------------------
-- 14. Grant execute on RPCs
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.submit_room_check_for_qc(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qc_approve_task(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qc_reject_task(UUID, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qc_force_approve(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_qc_settings(UUID, UUID, TEXT) TO authenticated;