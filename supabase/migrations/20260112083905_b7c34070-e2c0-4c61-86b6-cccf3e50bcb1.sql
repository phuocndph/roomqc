-- Drop existing SELECT policy on telegram_connections
DROP POLICY IF EXISTS "Users can view their own telegram connections" ON public.telegram_connections;

-- Create new SELECT policy that allows:
-- 1. Users to view their own connections
-- 2. Super admins to view all
-- 3. Tenant owners/managers/hotel_managers to view connections of users in same hotel
CREATE POLICY "View telegram connections policy" ON public.telegram_connections
FOR SELECT USING (
  -- Own connection
  auth.uid() = user_id
  OR
  -- Super admin sees all
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.user_level_code = 'super_admin'
  )
  OR
  -- Tenant owner sees all in tenant
  EXISTS (
    SELECT 1 FROM public.users viewer
    JOIN public.users target ON target.id = telegram_connections.user_id
    WHERE viewer.id = auth.uid()
      AND viewer.user_level_code = 'tenant_owner'
      AND viewer.tenant_id = target.tenant_id
  )
  OR
  -- Manager/hotel_manager sees users in same hotel
  EXISTS (
    SELECT 1 FROM public.users viewer
    JOIN public.users target ON target.id = telegram_connections.user_id
    WHERE viewer.id = auth.uid()
      AND viewer.user_level_code IN ('manager', 'hotel_manager')
      AND viewer.tenant_id = target.tenant_id
      AND (
        viewer.hotel_id = target.hotel_id
        OR public.works_at_same_hotel(telegram_connections.user_id)
      )
  )
);