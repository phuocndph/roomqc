-- 1) email_notifications: restrict SELECT to the recipient or to owners/managers
DROP POLICY IF EXISTS "Users can view their email notifications" ON public.email_notifications;

CREATE POLICY "Users can view their email notifications"
ON public.email_notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_super_admin(auth.uid())
  OR (
    tenant_id = get_current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_level_code IN ('tenant_owner', 'manager')
    )
  )
);

-- 2) Prevent privilege escalation: non-owners cannot change their own (or others')
--    salary fields. Implemented as a BEFORE UPDATE trigger so it cannot be
--    bypassed by selectively omitting columns in PostgREST patches.
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_salary_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_level text;
  caller_is_super boolean;
BEGIN
  -- Service role / migrations / triggers with no auth context: allow.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_level_code, COALESCE(is_super_admin, false)
    INTO caller_level, caller_is_super
    FROM public.users
   WHERE id = caller_id;

  IF caller_is_super OR caller_level = 'tenant_owner' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.monthly_salary_vnd, -1) IS DISTINCT FROM COALESCE(OLD.monthly_salary_vnd, -1) THEN
    RAISE EXCEPTION 'SALARY_CHANGE_NOT_ALLOWED'
      USING HINT = 'Chỉ chủ doanh nghiệp mới được chỉnh lương cố định.';
  END IF;

  IF COALESCE(NEW.hourly_wage_vnd, -1) IS DISTINCT FROM COALESCE(OLD.hourly_wage_vnd, -1) THEN
    RAISE EXCEPTION 'WAGE_CHANGE_NOT_ALLOWED'
      USING HINT = 'Chỉ chủ doanh nghiệp mới được chỉnh lương giờ.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_salary_change ON public.users;
CREATE TRIGGER trg_prevent_unauthorized_salary_change
BEFORE UPDATE OF monthly_salary_vnd, hourly_wage_vnd ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unauthorized_salary_change();