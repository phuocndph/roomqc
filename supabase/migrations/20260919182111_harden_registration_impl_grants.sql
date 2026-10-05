-- Keep the implementation private; callers must use the wrapper that sets the
-- transaction-scoped provisioning marker and validates the auth subject.
REVOKE EXECUTE ON FUNCTION public.complete_registration_impl(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_registration_impl(
  uuid, text, text, text, text, text, text, text, text, integer
) TO service_role;
