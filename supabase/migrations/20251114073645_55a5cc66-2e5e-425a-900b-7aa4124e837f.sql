-- Cleanup: Drop old get_user_permissions function to avoid conflicts
DROP FUNCTION IF EXISTS public.get_user_permissions(UUID);

-- Also drop get_user_permissions_summary if exists
DROP FUNCTION IF EXISTS public.get_user_permissions_summary(UUID);

-- Drop user_has_hotel_access if exists
DROP FUNCTION IF EXISTS public.user_has_hotel_access(UUID, UUID);