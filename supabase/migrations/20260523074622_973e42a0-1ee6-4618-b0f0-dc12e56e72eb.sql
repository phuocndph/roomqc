-- 1) Siết UPDATE policy trên users: nhánh manager không được sửa các cột nâng quyền
DROP POLICY IF EXISTS users_update_self_or_managed ON public.users;

CREATE POLICY users_update_self_or_managed
ON public.users
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR id = auth.uid()
  OR (tenant_id = get_current_user_tenant_id() AND can_manage_user(auth.uid(), id))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    -- Self update: giữ nguyên các ràng buộc cũ
    id = auth.uid()
    AND tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
    AND user_level_code = (SELECT u.user_level_code FROM public.users u WHERE u.id = auth.uid())
    AND COALESCE(role, '') = COALESCE((SELECT u.role FROM public.users u WHERE u.id = auth.uid()), '')
    AND is_super_admin = false
    AND COALESCE(is_primary_owner, false)
        = COALESCE((SELECT u.is_primary_owner FROM public.users u WHERE u.id = auth.uid()), false)
  )
  OR (
    -- Manager-managed branch: KHÔNG cho phép sửa cấp/role/super_admin/primary_owner
    tenant_id = get_current_user_tenant_id()
    AND can_manage_user(auth.uid(), id)
    AND is_super_admin = false
    AND COALESCE(is_primary_owner, false)
        = COALESCE((SELECT u.is_primary_owner FROM public.users u WHERE u.id = id), false)
    AND user_level_code
        = (SELECT u.user_level_code FROM public.users u WHERE u.id = id)
    AND COALESCE(role, '')
        = COALESCE((SELECT u.role FROM public.users u WHERE u.id = id), '')
    AND tenant_id
        = (SELECT u.tenant_id FROM public.users u WHERE u.id = id)
  )
);

-- 2) works_at_same_hotel: bắt buộc cùng tenant_id
CREATE OR REPLACE FUNCTION public.works_at_same_hotel(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_hotels uh1
    JOIN public.user_hotels uh2 ON uh1.hotel_id = uh2.hotel_id
    JOIN public.users me ON me.id = uh1.user_id
    JOIN public.users target ON target.id = uh2.user_id
    WHERE uh1.user_id = auth.uid()
      AND uh2.user_id = target_user_id
      AND me.tenant_id = target.tenant_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u1
    JOIN public.users u2
      ON u1.hotel_id = u2.hotel_id
     AND u1.hotel_id IS NOT NULL
     AND u1.tenant_id = u2.tenant_id
    WHERE u1.id = auth.uid()
      AND u2.id = target_user_id
  )
$function$;

-- 3) password_reset_otps: gỡ quyền SELECT/DELETE cho authenticated
DROP POLICY IF EXISTS "Users can view OTPs by their email" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Users can delete OTPs for their email" ON public.password_reset_otps;
-- Giữ INSERT để flow client tạo OTP (đã có rate-limit ở edge function).
-- Validate + delete OTP chạy hoàn toàn qua edge function service_role.

-- 4) announcement-assets bucket: SELECT policy công khai rõ ràng
DROP POLICY IF EXISTS "Public read announcement assets" ON storage.objects;
CREATE POLICY "Public read announcement assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'announcement-assets');