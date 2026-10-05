-- Auth sign-up must remain independent from tenant provisioning.
-- The previous trigger inserted a pending public.users row with tenant_id = NULL,
-- which immediately hit the tenant-quota and staff-status triggers and rolled
-- back the auth.users insert with "Tenant not found".  complete_registration()
-- already handles the missing profile atomically after onboarding details are
-- submitted, so the auth trigger should only allow the auth row to be created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth sign-up creates only auth.users; complete_registration provisions the tenant, hotel, profile, and defaults atomically.';
