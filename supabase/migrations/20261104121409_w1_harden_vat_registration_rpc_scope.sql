-- W1/F26: caller identity, live session, tenant and hotel checks for VAT/retry.
-- Only the trusted server-side issuer may mark a VAT claim as issued.
CREATE OR REPLACE FUNCTION public.ensure_vat_claim_token(p_invoice_id uuid)
RETURNS TABLE(token text, expires_at timestamptz, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invoice public.guest_invoices%ROWTYPE;
  v_existing public.invoice_vat_claims%ROWTYPE;
  v_token text;
BEGIN
  IF NOT public.rpc_request_is_trusted() AND NOT private.business_actor_is_live() THEN
    RAISE EXCEPTION 'ACTIVE_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- Serialize token creation for the same invoice, including concurrent clicks.
  SELECT gi.* INTO v_invoice FROM public.guest_invoices gi
  WHERE gi.id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  PERFORM public.assert_rpc_actor(v_invoice.tenant_id, v_invoice.hotel_id);
  IF NOT public.rpc_request_is_trusted()
    AND NOT public.has_user_permission(auth.uid(),'bookings','view') THEN
    RAISE EXCEPTION 'INVOICE_VIEW_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT ivc.* INTO v_existing FROM public.invoice_vat_claims ivc
  WHERE ivc.invoice_id = p_invoice_id AND ivc.status IN ('pending','submitted')
    AND ivc.expires_at > now()
  ORDER BY ivc.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.claim_token, v_existing.expires_at, v_existing.status;
    RETURN;
  END IF;
  v_token := public.gen_vat_claim_token();
  INSERT INTO public.invoice_vat_claims(invoice_id,tenant_id,hotel_id,claim_token)
  VALUES(p_invoice_id,v_invoice.tenant_id,v_invoice.hotel_id,v_token)
  RETURNING * INTO v_existing;
  UPDATE public.guest_invoices gi SET vat_claim_status = CASE
    WHEN gi.vat_claim_status='none' THEN 'pending' ELSE gi.vat_claim_status END
  WHERE gi.id=p_invoice_id;
  RETURN QUERY SELECT v_existing.claim_token,v_existing.expires_at,v_existing.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_stay_registration(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_registration public.guest_stay_registrations%ROWTYPE;
BEGIN
  IF NOT public.rpc_request_is_trusted() AND NOT private.business_actor_is_live() THEN
    RAISE EXCEPTION 'ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_registration FROM public.guest_stay_registrations
  WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public.assert_rpc_actor(v_registration.tenant_id,v_registration.hotel_id);
  IF NOT public.rpc_request_is_trusted()
    AND NOT public.has_user_permission(auth.uid(),'bookings','update') THEN
    RAISE EXCEPTION 'BOOKING_UPDATE_REQUIRED' USING ERRCODE='42501';
  END IF;
  UPDATE public.guest_stay_registrations SET status='pending',last_error=NULL,
    attempt_count=0,updated_at=now() WHERE id=p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_vat_claim_issued(
  p_claim_id uuid,p_provider text,p_pdf_path text,p_lookup_code text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_claim public.invoice_vat_claims%ROWTYPE;
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'SERVER_ISSUER_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_claim FROM public.invoice_vat_claims WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE public.invoice_vat_claims SET status='issued',einvoice_pdf_path=p_pdf_path,
    einvoice_lookup_code=p_lookup_code,issued_at=now() WHERE id=p_claim_id;
  UPDATE public.guest_invoices SET vat_claim_status='issued',einvoice_provider=p_provider,
    einvoice_pdf_path=p_pdf_path,einvoice_issued_at=now() WHERE id=v_claim.invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_vat_claim_token(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.retry_stay_registration(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_vat_claim_token(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.retry_stay_registration(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.mark_vat_claim_issued(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_vat_claim_issued(uuid,text,text,text) TO service_role;
