-- Remove redundant indexes reported by Supabase advisors.
-- Keep the older/descriptive index in each pair. The room_items constraint
-- index is retained because it backs the UNIQUE constraint.
DROP INDEX IF EXISTS public.idx_booking_consumables_booking_id;
DROP INDEX IF EXISTS public.idx_in_app_notifications_user_unread;
DROP INDEX IF EXISTS public.idx_room_items_unique;
DROP INDEX IF EXISTS public.idx_shift_history_tenant_start;
DROP INDEX IF EXISTS public.idx_user_roles_user_id;
