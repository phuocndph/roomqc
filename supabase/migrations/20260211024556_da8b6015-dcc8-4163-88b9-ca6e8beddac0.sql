
CREATE OR REPLACE FUNCTION public.get_users_by_hotel(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_level TEXT DEFAULT NULL
)
RETURNS SETOF public.users
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT u.*
  FROM public.users u
  LEFT JOIN public.user_hotels uh ON u.id = uh.user_id
  WHERE u.tenant_id = p_tenant_id
    AND (
      p_hotel_id IS NULL
      OR u.hotel_id = p_hotel_id
      OR uh.hotel_id = p_hotel_id
      OR u.user_level_code = 'tenant_owner'
    )
    AND (
      p_user_level IS NULL
      OR p_user_level != 'manager'
      OR (u.reports_to = p_user_id OR u.created_by = p_user_id OR u.id = p_user_id)
    )
  ORDER BY u.created_at DESC;
END;
$$;
