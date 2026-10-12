-- The first signup has no public.users row to lock. Serialize on the existing
-- auth.users row so simultaneous first calls see the completed profile before
-- entering the idempotent implementation. Different users remain independent.
CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_tenant_name text,
  p_email text,
  p_hotel_name text,
  p_hotel_address text,
  p_hotel_phone text,
  p_hotel_email text,
  p_total_rooms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $wrapper$
BEGIN
  IF p_user_id IS NULL OR (
    auth.uid() IS DISTINCT FROM p_user_id
    AND COALESCE(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  PERFORM pg_catalog.set_config('roomqc.registration_provisioning', 'true', true);
  PERFORM pg_catalog.set_config('roomqc.registration_user_id', p_user_id::text, true);

  RETURN public.complete_registration_impl(
    p_user_id, p_full_name, p_phone, p_tenant_name, p_email,
    p_hotel_name, p_hotel_address, p_hotel_phone, p_hotel_email,
    p_total_rooms
  );
END;
$wrapper$;

REVOKE EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.complete_registration_impl(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_registration_impl(
  uuid, text, text, text, text, text, text, text, text, integer
) TO service_role;

COMMENT ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) IS 'Authenticated first registration; serializes concurrent calls per auth user and reuses the completed tenant and hotel.';
