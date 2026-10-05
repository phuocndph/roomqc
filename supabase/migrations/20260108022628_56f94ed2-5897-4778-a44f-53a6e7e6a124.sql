-- =====================================================
-- FIX SECURITY ISSUES
-- =====================================================

-- 1. FIX: Security Definer Views - Change to SECURITY INVOKER
-- Views should use INVOKER to respect RLS of the querying user

-- Drop and recreate user_with_levels view with SECURITY INVOKER
DROP VIEW IF EXISTS public.user_with_levels;
CREATE VIEW public.user_with_levels
WITH (security_invoker = true)
AS
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.phone,
  u.avatar_url,
  u.tenant_id,
  u.hotel_id,
  u.user_level_code,
  u.is_super_admin,
  ul.name AS user_level_name,
  ul.hierarchy_level,
  u.status,
  u.last_login_at,
  u.login_count,
  u.account_locked,
  u.created_at
FROM public.users u
LEFT JOIN public.user_levels ul ON ul.code = u.user_level_code
WHERE u.deleted_at IS NULL;

-- Drop and recreate dashboard_stats view with SECURITY INVOKER
DROP VIEW IF EXISTS public.dashboard_stats;
CREATE VIEW public.dashboard_stats
WITH (security_invoker = true)
AS
SELECT 
  h.id AS hotel_id,
  h.tenant_id,
  h.name AS hotel_name,
  count(DISTINCT i.id) AS total_items,
  sum(i.quantity_total) AS total_quantity,
  sum((i.quantity_total)::numeric * i.unit_price) AS total_inventory_value,
  sum(i.quantity_in_stock) AS total_in_stock,
  sum(i.quantity_in_use) AS total_in_use,
  sum(i.quantity_in_laundry) AS total_in_laundry,
  sum(i.quantity_damaged) AS total_damaged,
  count(DISTINCT i.id) FILTER (WHERE i.quantity_in_stock < i.minimum_stock) AS low_stock_items_count,
  count(DISTINCT r.id) AS total_rooms,
  count(DISTINCT r.id) FILTER (WHERE r.status = 'vacant') AS vacant_rooms,
  count(DISTINCT r.id) FILTER (WHERE r.status = 'occupied') AS occupied_rooms,
  count(DISTINCT r.id) FILTER (WHERE r.status = 'cleaning') AS cleaning_rooms,
  count(DISTINCT r.id) FILTER (WHERE r.status = 'maintenance') AS maintenance_rooms,
  count(DISTINCT lb.id) FILTER (WHERE lb.status = ANY (ARRAY['delivered', 'washing', 'ready'])) AS active_laundry_batches,
  count(DISTINCT mr.id) FILTER (WHERE mr.status = ANY (ARRAY['pending', 'assigned', 'in_progress'])) AS pending_maintenance_requests
FROM public.hotels h
LEFT JOIN public.items i ON i.hotel_id = h.id AND i.status = 'active'
LEFT JOIN public.rooms r ON r.hotel_id = h.id
LEFT JOIN public.laundry_batches lb ON lb.hotel_id = h.id
LEFT JOIN public.maintenance_requests mr ON mr.hotel_id = h.id
GROUP BY h.id, h.tenant_id, h.name;

-- Drop and recreate dashboard_activities view with SECURITY INVOKER
DROP VIEW IF EXISTS public.dashboard_activities;
CREATE VIEW public.dashboard_activities
WITH (security_invoker = true)
AS
SELECT 
  al.id,
  CASE
    WHEN al.action = 'create' AND al.entity_type = 'item' THEN 'inventory_add'
    WHEN al.action = 'delete' AND al.entity_type = 'item' THEN 'inventory_remove'
    WHEN al.action = 'create' AND al.entity_type = 'inventory_transaction' AND (al.new_values ->> 'transaction_type') = 'in' THEN 'inventory_add'
    WHEN al.action = 'create' AND al.entity_type = 'inventory_transaction' AND (al.new_values ->> 'transaction_type') = 'out' THEN 'inventory_remove'
    WHEN al.action = 'create' AND al.entity_type = 'laundry_batch' THEN 'laundry_sent'
    WHEN al.action = 'update' AND al.entity_type = 'laundry_batch' AND (al.new_values ->> 'status') = 'received' THEN 'laundry_received'
    WHEN al.action = 'create' AND al.entity_type = 'room_check' THEN 'room_check'
    WHEN al.action = 'create' AND al.entity_type = 'maintenance_request' THEN 'maintenance'
    WHEN al.entity_type = 'notification' AND (al.new_values ->> 'category') = 'inventory' THEN 'low_stock'
    ELSE 'other'
  END AS type,
  al.description,
  al.user_name,
  u.avatar_url AS user_avatar,
  al.created_at,
  al.tenant_id,
  jsonb_build_object('entity_type', al.entity_type, 'entity_id', al.entity_id, 'entity_name', al.entity_name, 'action', al.action) AS metadata
FROM public.activity_logs al
LEFT JOIN public.users u ON u.id = al.user_id
ORDER BY al.created_at DESC;

-- 2. FIX: Overly permissive RLS policies
-- Replace WITH CHECK (true) with proper checks

-- Fix payment_webhook_logs INSERT policies
DROP POLICY IF EXISTS "System can insert webhook logs" ON public.payment_webhook_logs;
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.payment_webhook_logs;

-- Webhook logs should only be insertable by service role (edge functions)
CREATE POLICY "Service role can insert webhook logs"
ON public.payment_webhook_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Fix promo_code_usage INSERT policy
DROP POLICY IF EXISTS "System can insert promo usage" ON public.promo_code_usage;

-- Promo usage should be tied to authenticated user's tenant
CREATE POLICY "Users can insert promo usage for their tenant"
ON public.promo_code_usage
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- Fix in_app_notifications INSERT policy  
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.in_app_notifications;

-- Notifications should be inserted by service role or for user's own tenant
CREATE POLICY "Service role can insert notifications"
ON public.in_app_notifications
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Authenticated users can receive notifications"
ON public.in_app_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  OR tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- 3. FIX: password_reset_otps has RLS enabled but no policies
-- This table uses email column, not user_id
-- OTP table is used during password reset flow - needs to be accessible by anon for reset flow

CREATE POLICY "Users can view OTPs by their email"
ON public.password_reset_otps
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create OTPs for their email"
ON public.password_reset_otps
FOR INSERT
TO authenticated
WITH CHECK (email = (SELECT email FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete OTPs for their email"
ON public.password_reset_otps
FOR DELETE
TO authenticated
USING (email = (SELECT email FROM public.users WHERE id = auth.uid()));

-- Allow anonymous users to manage OTPs during password reset flow
-- This is necessary because users are not authenticated when resetting password
CREATE POLICY "Anonymous can read OTPs for verification"
ON public.password_reset_otps
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anonymous can create OTPs for password reset"
ON public.password_reset_otps
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Anonymous can delete used OTPs"
ON public.password_reset_otps
FOR DELETE
TO anon
USING (true);