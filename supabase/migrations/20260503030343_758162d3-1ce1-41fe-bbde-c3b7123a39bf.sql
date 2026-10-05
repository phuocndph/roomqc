
-- Fix: Remove public read policy on booking_payments (PII + financial data leak)
DROP POLICY IF EXISTS "Allow public read booking_payments by id" ON public.booking_payments;

-- Fix: Recreate user_with_levels view with security_invoker so it respects underlying users RLS
DROP VIEW IF EXISTS public.user_with_levels;
CREATE VIEW public.user_with_levels
WITH (security_invoker = true)
AS
SELECT u.id,
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
FROM users u
LEFT JOIN user_levels ul ON ul.code = u.user_level_code
WHERE u.deleted_at IS NULL;
