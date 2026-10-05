-- Several historical migrations granted EXECUTE directly to anon.  Revoking
-- PUBLIC does not remove those explicit grants, so clean them up explicitly.
-- The two VAT functions remain public by design for the invoice QR flow.

REVOKE EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.handle_successful_payment(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin()
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.log_state_transition(
  text, uuid, text, jsonb
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_state_transition(
  text, uuid, text, text, jsonb
) FROM anon;
