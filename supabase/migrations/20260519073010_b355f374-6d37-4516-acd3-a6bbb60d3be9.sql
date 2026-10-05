-- =========================================================
-- HOTFIX 1.0.21 — Security
-- =========================================================

-- ------- #1 Realtime: chặn broadcast/presence cross-tenant -------
-- Project hiện chỉ dùng postgres_changes (đã RLS theo từng bảng nguồn).
-- Drop các policy cũ trên realtime.messages rồi tạo policy chặt:
--   - authenticated only
--   - chỉ cho phép extension = 'postgres_changes'
--   - chặn broadcast/presence (không dùng trong app)

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    BEGIN
      FOR r IN
        SELECT polname FROM pg_policy WHERE polrelid = 'realtime.messages'::regclass
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', r.polname);
      END LOOP;

      EXECUTE 'CREATE POLICY "rt_postgres_changes_only_authenticated" ON realtime.messages FOR SELECT TO authenticated USING (extension = ''postgres_changes'')';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping realtime.messages policies: migration role is not the table owner';
    END;
  END IF;
END$$;

-- Anonymous không được nhận realtime ở bất kỳ extension nào
-- (không tạo policy = deny by default).

-- ------- #2 user_roles: chặn owner cấp super_admin -------

DROP POLICY IF EXISTS "Owners can manage roles in their tenant" ON public.user_roles;

-- Super admins toàn quyền
CREATE POLICY "Super admins manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Owner: chỉ trong tenant của mình, và TUYỆT ĐỐI không được gán super_admin
CREATE POLICY "Owners manage non-super-admin roles in their tenant"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    AND role <> 'super_admin'::app_role
    AND EXISTS (
      SELECT 1
      FROM public.users u1
      JOIN public.users u2 ON u1.tenant_id = u2.tenant_id
      WHERE u1.id = auth.uid() AND u2.id = user_roles.user_id
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    AND role <> 'super_admin'::app_role
    AND EXISTS (
      SELECT 1
      FROM public.users u1
      JOIN public.users u2 ON u1.tenant_id = u2.tenant_id
      WHERE u1.id = auth.uid() AND u2.id = user_roles.user_id
    )
  );

-- Audit: ghi log mọi thay đổi user_roles
CREATE OR REPLACE FUNCTION public.log_user_roles_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.super_admin_activity_log (
    actor_user_id, action, table_name, record_id, old_values, new_values, created_at
  ) VALUES (
    auth.uid(),
    TG_OP,
    'user_roles',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    now()
  );
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Không chặn nghiệp vụ nếu log fail (vd: bảng audit thiếu cột)
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_user_roles_change ON public.user_roles;
CREATE TRIGGER trg_log_user_roles_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_user_roles_change();
