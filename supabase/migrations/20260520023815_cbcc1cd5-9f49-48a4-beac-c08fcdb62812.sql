
ALTER TABLE public.guest_invoices
  ADD COLUMN IF NOT EXISTS vat_claim_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS einvoice_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_provider text,
  ADD COLUMN IF NOT EXISTS einvoice_pdf_path text;

ALTER TABLE public.guest_invoices
  DROP CONSTRAINT IF EXISTS guest_invoices_vat_claim_status_check;
ALTER TABLE public.guest_invoices
  ADD CONSTRAINT guest_invoices_vat_claim_status_check
  CHECK (vat_claim_status IN ('none','pending','submitted','issued','failed','expired'));

CREATE TABLE IF NOT EXISTS public.invoice_vat_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.guest_invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  hotel_id uuid,
  claim_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  company_name text,
  tax_code text,
  company_address text,
  email text,
  einvoice_pdf_path text,
  einvoice_lookup_code text,
  notes text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  claimed_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_vat_claims_status_check
    CHECK (status IN ('pending','submitted','issued','failed','expired'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_vat_claims_token ON public.invoice_vat_claims(claim_token);
CREATE INDEX IF NOT EXISTS idx_invoice_vat_claims_invoice ON public.invoice_vat_claims(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_vat_claims_tenant ON public.invoice_vat_claims(tenant_id);

ALTER TABLE public.invoice_vat_claims ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_invoice_vat_claims_updated_at ON public.invoice_vat_claims;
CREATE TRIGGER trg_invoice_vat_claims_updated_at
  BEFORE UPDATE ON public.invoice_vat_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "tenant members can read claims" ON public.invoice_vat_claims;
CREATE POLICY "tenant members can read claims"
  ON public.invoice_vat_claims FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "tenant members can manage claims" ON public.invoice_vat_claims;
CREATE POLICY "tenant members can manage claims"
  ON public.invoice_vat_claims FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_user_tenant_id())
  WITH CHECK (tenant_id = public.get_current_user_tenant_id());

CREATE OR REPLACE FUNCTION public.gen_vat_claim_token()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_token text;
BEGIN
  v_token := encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '+', ''), '/', ''), '=', '');
  RETURN substring(v_token, 1, 24);
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_vat_claim_token(p_invoice_id uuid)
RETURNS TABLE(token text, expires_at timestamptz, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.guest_invoices%ROWTYPE;
  v_existing public.invoice_vat_claims%ROWTYPE;
  v_token text;
  v_user_tenant uuid;
BEGIN
  v_user_tenant := public.get_current_user_tenant_id();
  SELECT * INTO v_invoice FROM public.guest_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF v_invoice.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_existing
  FROM public.invoice_vat_claims
  WHERE invoice_id = p_invoice_id
    AND status IN ('pending','submitted')
    AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.claim_token, v_existing.expires_at, v_existing.status;
    RETURN;
  END IF;

  v_token := public.gen_vat_claim_token();
  INSERT INTO public.invoice_vat_claims (invoice_id, tenant_id, hotel_id, claim_token)
  VALUES (p_invoice_id, v_invoice.tenant_id, v_invoice.hotel_id, v_token);

  UPDATE public.guest_invoices
  SET vat_claim_status = CASE WHEN vat_claim_status = 'none' THEN 'pending' ELSE vat_claim_status END
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_token, (now() + interval '7 days')::timestamptz, 'pending'::text;
END; $$;

GRANT EXECUTE ON FUNCTION public.ensure_vat_claim_token(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vat_claim_public(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim public.invoice_vat_claims%ROWTYPE;
  v_invoice public.guest_invoices%ROWTYPE;
  v_hotel record;
BEGIN
  SELECT * INTO v_claim FROM public.invoice_vat_claims WHERE claim_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  IF v_claim.expires_at < now() AND v_claim.status = 'pending' THEN
    UPDATE public.invoice_vat_claims SET status = 'expired' WHERE id = v_claim.id;
    v_claim.status := 'expired';
  END IF;

  SELECT * INTO v_invoice FROM public.guest_invoices WHERE id = v_claim.invoice_id;
  SELECT name, address, phone INTO v_hotel FROM public.hotels WHERE id = v_claim.hotel_id;

  RETURN jsonb_build_object(
    'status', v_claim.status,
    'expires_at', v_claim.expires_at,
    'claimed_at', v_claim.claimed_at,
    'issued_at', v_claim.issued_at,
    'invoice', jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'total_amount', v_invoice.total_amount,
      'vat_amount', v_invoice.vat_amount,
      'issued_at', v_invoice.issued_at,
      'check_in_date', v_invoice.check_in_date,
      'check_out_date', v_invoice.check_out_date,
      'room_number', v_invoice.room_number
    ),
    'hotel', jsonb_build_object(
      'name', v_hotel.name,
      'address', v_hotel.address,
      'phone', v_hotel.phone
    ),
    'prefill', jsonb_build_object(
      'company_name', v_claim.company_name,
      'tax_code', v_claim.tax_code,
      'company_address', v_claim.company_address,
      'email', v_claim.email
    )
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_vat_claim_public(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_vat_claim_public(
  p_token text, p_company_name text, p_tax_code text,
  p_company_address text, p_email text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim public.invoice_vat_claims%ROWTYPE;
  v_norm_tax text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 THEN RAISE EXCEPTION 'company_name_required'; END IF;
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;

  v_norm_tax := regexp_replace(coalesce(p_tax_code,''), '[^0-9]', '', 'g');
  IF length(v_norm_tax) NOT IN (10, 13) THEN RAISE EXCEPTION 'invalid_tax_code'; END IF;

  SELECT * INTO v_claim FROM public.invoice_vat_claims WHERE claim_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_claim.expires_at < now() THEN RAISE EXCEPTION 'expired'; END IF;
  IF v_claim.status IN ('issued','submitted') THEN RAISE EXCEPTION 'already_claimed'; END IF;

  UPDATE public.invoice_vat_claims
  SET company_name = trim(p_company_name),
      tax_code = v_norm_tax,
      company_address = nullif(trim(p_company_address), ''),
      email = lower(trim(p_email)),
      status = 'submitted',
      claimed_at = now(),
      updated_at = now()
  WHERE id = v_claim.id;

  UPDATE public.guest_invoices
  SET vat_claim_status = 'submitted',
      company_name = trim(p_company_name),
      guest_tax_code = v_norm_tax,
      guest_address = COALESCE(nullif(trim(p_company_address), ''), guest_address),
      guest_email = lower(trim(p_email)),
      updated_at = now()
  WHERE id = v_claim.invoice_id;

  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim.id, 'invoice_id', v_claim.invoice_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_vat_claim_public(text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_vat_claim_issued(
  p_claim_id uuid, p_provider text, p_pdf_path text, p_lookup_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim public.invoice_vat_claims%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM public.invoice_vat_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  UPDATE public.invoice_vat_claims
  SET status = 'issued',
      einvoice_pdf_path = p_pdf_path,
      einvoice_lookup_code = p_lookup_code,
      issued_at = now()
  WHERE id = p_claim_id;

  UPDATE public.guest_invoices
  SET vat_claim_status = 'issued',
      einvoice_provider = p_provider,
      einvoice_pdf_path = p_pdf_path,
      einvoice_issued_at = now()
  WHERE id = v_claim.invoice_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.mark_vat_claim_issued(uuid, text, text, text) TO anon, authenticated;
