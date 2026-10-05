-- 1) hotels.qc_mode
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='hk_qc_mode') THEN
    CREATE TYPE public.hk_qc_mode AS ENUM ('self','peer','strict');
  END IF;
END $$;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS qc_mode public.hk_qc_mode NOT NULL DEFAULT 'self';

COMMENT ON COLUMN public.hotels.qc_mode IS
  'Chế độ QC housekeeping: self=tự đóng, peer=đồng nghiệp duyệt, strict=chỉ quản lý duyệt';

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- 3) Effective permissions (union từ roles + user_permissions grants)
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
RETURNS TABLE(module text, action text, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.module::text, p.action::text, ('role:'||r.code)::text AS source
  FROM public.user_roles ur
  JOIN public.roles r ON r.code = ur.role::text
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
  UNION
  SELECT DISTINCT up.module::text, up.action::text, 'user_grant'::text
  FROM public.user_permissions up
  WHERE up.user_id = _user_id AND COALESCE(up.enabled, true) = true;
$$;

COMMENT ON FUNCTION public.get_effective_permissions(uuid) IS
  'Union quyền hiệu lực của user từ mọi role + grant trực tiếp';

-- 4) View v_user_effective_roles
DROP VIEW IF EXISTS public.v_user_effective_roles;
CREATE VIEW public.v_user_effective_roles
WITH (security_invoker=on) AS
SELECT
  u.id AS user_id,
  u.tenant_id,
  u.hotel_id,
  COALESCE(array_agg(ur.role::text ORDER BY ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles,
  bool_or(ur.role::text = 'super_admin') AS is_super_admin,
  bool_or(ur.role::text = 'owner') AS is_owner,
  bool_or(ur.role::text IN ('hotel_manager','department_manager')) AS is_manager,
  bool_or(ur.role::text = 'staff') AS is_staff
FROM public.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
GROUP BY u.id, u.tenant_id, u.hotel_id;

-- 5) is_qc_manager
CREATE OR REPLACE FUNCTION public.is_qc_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _user_id
      AND COALESCE(u.user_level_code,'') IN ('super_admin','tenant_owner','manager')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('super_admin','owner','hotel_manager','department_manager')
  );
$$;

-- 6) complete_task
CREATE OR REPLACE FUNCTION public.complete_task(_task_id uuid, _note text DEFAULT NULL)
RETURNS public.housekeeping_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.housekeeping_tasks;
  _uid uuid := auth.uid();
  _qc public.hk_qc_mode;
  _target text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO _task FROM public.housekeeping_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _uid AND (u.tenant_id = _task.tenant_id OR u.user_level_code='super_admin')
  ) THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  IF _task.assigned_to IS DISTINCT FROM _uid
     AND NOT public.has_permission(_uid, 'manage_housekeeping') THEN
    RAISE EXCEPTION 'NO_PERMISSION_COMPLETE';
  END IF;

  SELECT qc_mode INTO _qc FROM public.hotels WHERE id = _task.hotel_id;
  _qc := COALESCE(_qc, 'self');

  _target := CASE WHEN _qc = 'self' THEN 'completed' ELSE 'completed_pending_review' END;

  RETURN public.transition_task_status(_task_id, _target, _note, false);
END $$;

-- 7) approve_task
CREATE OR REPLACE FUNCTION public.approve_task(_task_id uuid, _note text DEFAULT NULL)
RETURNS public.housekeeping_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.housekeeping_tasks;
  _uid uuid := auth.uid();
  _qc public.hk_qc_mode;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO _task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _uid AND (u.tenant_id = _task.tenant_id OR u.user_level_code='super_admin')
  ) THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  SELECT qc_mode INTO _qc FROM public.hotels WHERE id = _task.hotel_id;
  _qc := COALESCE(_qc, 'self');

  IF _qc = 'peer' AND _task.assigned_to = _uid THEN
    RAISE EXCEPTION 'PEER_REVIEW_SELF_FORBIDDEN';
  END IF;

  IF _qc = 'strict' THEN
    IF NOT public.is_qc_manager(_uid) THEN RAISE EXCEPTION 'NO_PERMISSION_QC_STRICT'; END IF;
  ELSE
    IF NOT public.has_permission(_uid, 'manage_housekeeping') THEN
      RAISE EXCEPTION 'NO_PERMISSION_QC';
    END IF;
  END IF;

  RETURN public.transition_task_status(_task_id, 'approved', _note, false);
END $$;

-- 8) reject_task
CREATE OR REPLACE FUNCTION public.reject_task(_task_id uuid, _reason text)
RETURNS public.housekeeping_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.housekeeping_tasks;
  _uid uuid := auth.uid();
  _qc public.hk_qc_mode;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
  END IF;

  SELECT * INTO _task FROM public.housekeeping_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = _uid AND (u.tenant_id = _task.tenant_id OR u.user_level_code='super_admin')
  ) THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;

  SELECT qc_mode INTO _qc FROM public.hotels WHERE id = _task.hotel_id;
  _qc := COALESCE(_qc, 'self');

  IF _qc = 'peer' AND _task.assigned_to = _uid THEN
    RAISE EXCEPTION 'PEER_REVIEW_SELF_FORBIDDEN';
  END IF;

  IF _qc = 'strict' THEN
    IF NOT public.is_qc_manager(_uid) THEN RAISE EXCEPTION 'NO_PERMISSION_QC_STRICT'; END IF;
  ELSE
    IF NOT public.has_permission(_uid, 'manage_housekeeping') THEN
      RAISE EXCEPTION 'NO_PERMISSION_QC';
    END IF;
  END IF;

  RETURN public.transition_task_status(_task_id, 'rejected_rework', _reason, false);
END $$;

-- 9) Grants
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_qc_manager(uuid) TO authenticated;
GRANT SELECT ON public.v_user_effective_roles TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hotels' AND column_name='qc_mode')
    THEN RAISE EXCEPTION 'qc_mode missing'; END IF;
  RAISE NOTICE 'Multi-role + QC mode v2 OK';
END $$;