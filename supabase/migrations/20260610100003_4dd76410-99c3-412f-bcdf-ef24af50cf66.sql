-- Phase 1: Pin search_path cho 6 function còn sót
ALTER FUNCTION public.fn_is_valid_adjustment_transition(text, text) SET search_path = public;
ALTER FUNCTION public.gen_vat_claim_token() SET search_path = public;
ALTER FUNCTION public.outbox_next_retry_at(integer) SET search_path = public;
ALTER FUNCTION public.set_financial_targets_updated_at() SET search_path = public;
ALTER FUNCTION public.touch_room_blocks_updated_at() SET search_path = public;
ALTER FUNCTION public.validate_chargeable_approval_status() SET search_path = public;

-- Phase 2: Chặn LIST trên 2 public bucket bị flag (vẫn giữ public read qua URL)
DROP POLICY IF EXISTS "Public read announcement assets" ON storage.objects;
DROP POLICY IF EXISTS "hotel_logos_public_read" ON storage.objects;

-- Phase 3: REVOKE EXECUTE FROM anon cho mọi SECURITY DEFINER trong public
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END$$;

-- Re-grant cho RPC dùng ở trang VAT claim công khai
GRANT EXECUTE ON FUNCTION public.get_vat_claim_public(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_vat_claim_public(text, text, text, text, text) TO anon;