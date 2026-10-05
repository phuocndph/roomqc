-- (1) Trigger chặn leo quyền trên public.users
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_level text;
  caller_is_super boolean;
BEGIN
  -- Bỏ qua khi không có auth (service_role / migration / trigger nội bộ)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  caller_is_super := public.is_super_admin(auth.uid());
  IF caller_is_super THEN
    RETURN NEW;
  END IF;

  SELECT user_level_code INTO caller_level FROM public.users WHERE id = auth.uid();

  IF TG_OP = 'UPDATE' THEN
    -- Cấm thay đổi các cờ siêu nhạy cảm
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR COALESCE(NEW.is_primary_owner, false) IS DISTINCT FROM COALESCE(OLD.is_primary_owner, false)
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Không có quyền thay đổi trường nhạy cảm của tài khoản' USING ERRCODE = '42501';
    END IF;

    -- Chỉ cho phép đổi user_level_code / role nếu caller có quyền quản lý target
    IF (NEW.user_level_code IS DISTINCT FROM OLD.user_level_code
        OR NEW.role IS DISTINCT FROM OLD.role) THEN
      IF NOT public.can_manage_user(auth.uid(), NEW.id) THEN
        RAISE EXCEPTION 'Không có quyền thay đổi vai trò người dùng' USING ERRCODE = '42501';
      END IF;
      -- Không được nâng cấp lên tenant_owner trừ khi caller là tenant_owner
      IF NEW.user_level_code = 'tenant_owner' AND caller_level <> 'tenant_owner' THEN
        RAISE EXCEPTION 'Chỉ chủ khách sạn mới gán được cấp Chủ khách sạn' USING ERRCODE = '42501';
      END IF;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.is_super_admin = true OR COALESCE(NEW.is_primary_owner, false) = true THEN
      RAISE EXCEPTION 'Không có quyền tạo tài khoản cấp cao nhất' USING ERRCODE = '42501';
    END IF;
    IF caller_level IS NULL OR caller_level NOT IN ('tenant_owner', 'manager') THEN
      RAISE EXCEPTION 'Chỉ chủ khách sạn hoặc quản lý mới tạo được tài khoản' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_level_code = 'tenant_owner' AND caller_level <> 'tenant_owner' THEN
      RAISE EXCEPTION 'Chỉ chủ khách sạn mới tạo được tài khoản Chủ khách sạn' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_user_priv_esc ON public.users;
CREATE TRIGGER trg_prevent_user_priv_esc
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_privilege_escalation();

-- (2) Siết policy INSERT users (chỉ owner/manager hoặc super admin)
DROP POLICY IF EXISTS users_insert_in_tenant ON public.users;
CREATE POLICY users_insert_in_tenant ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      tenant_id = public.get_current_user_tenant_id()
      AND (
        public.is_tenant_owner()
        OR public.has_user_level(auth.uid(), 'manager')
      )
    )
  );

-- (3) Promo codes — chỉ cho authenticated, chặn anon
DROP POLICY IF EXISTS "Authenticated users can view active promo codes" ON public.promotional_codes;
CREATE POLICY "Authenticated users can view active promo codes"
  ON public.promotional_codes FOR SELECT TO authenticated
  USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));

-- (4) Reminder tables — thêm policy cho super admin
CREATE POLICY "Super admins manage reminder templates"
  ON public.reminder_email_templates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage reminder rules"
  ON public.reminder_automation_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));