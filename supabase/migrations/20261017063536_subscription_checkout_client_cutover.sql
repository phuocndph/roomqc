-- Cut over the browser to server-priced, NON-PAYABLE drafts. Do not reprice,
-- delete, confirm or activate pre-cutover orders without reconciliation.
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_subscription_payment(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_payment public.payment_transactions%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_payment FROM public.payment_transactions WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.rpc_request_is_trusted() THEN
    IF private.subscription_quote_actor() IS DISTINCT FROM v_payment.tenant_id THEN
      RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_OWNER_REQUIRED' USING ERRCODE='42501';
    END IF;
  END IF;
  -- Authorization precedes replay: a logged-out/removed owner cannot retry.
  IF v_payment.payment_status='failed' THEN
    RETURN jsonb_build_object('payment_id',p_payment_id,'payment_status','failed',
      'invoice_id',v_payment.invoice_id,'already_cancelled',true);
  END IF;
  IF v_payment.payment_status<>'pending' THEN RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE='22023'; END IF;
  IF v_payment.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id=v_payment.invoice_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.tenant_id IS DISTINCT FROM v_payment.tenant_id THEN
      RAISE EXCEPTION 'INVOICE_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    IF v_invoice.status='paid' OR v_invoice.paid_at IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.payment_transactions
        WHERE invoice_id=v_invoice.id AND payment_status='completed') THEN
      RAISE EXCEPTION 'PAID_INVOICE_REQUIRES_RECONCILIATION' USING ERRCODE='PT409';
    END IF;
  END IF;
  UPDATE public.payment_transactions SET payment_status='failed',updated_at=now() WHERE id=p_payment_id;
  -- Serialize sibling cancellation on the invoice, but never wait for sibling
  -- payment locks (settlement/expiry lock payment first).
  IF v_payment.invoice_id IS NOT NULL AND v_invoice.status IN ('draft','sent','overdue')
    AND NOT EXISTS(SELECT 1 FROM public.payment_transactions
      WHERE invoice_id=v_invoice.id AND payment_status='pending') THEN
    UPDATE public.invoices SET status='cancelled',updated_at=now() WHERE id=v_invoice.id;
  END IF;
  RETURN jsonb_build_object('payment_id',p_payment_id,'payment_status','failed',
    'invoice_id',v_payment.invoice_id,'already_cancelled',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_subscription_payment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_payment(uuid) TO authenticated,service_role;

-- The current reviewed path creates drafts only. Preserve completed replay,
-- but do not let old browser-priced rows or another child of a draft invoice
-- reach the unchecked entitlement writer. A payable snapshot path is separate.
CREATE OR REPLACE FUNCTION public.settle_subscription_payment(
  p_payment_id uuid,p_gateway_transaction_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_payment public.payment_transactions%ROWTYPE;
BEGIN
  IF NOT public.rpc_request_is_trusted() AND (auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid())
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND status='active'
      AND NOT COALESCE(account_locked,false))) THEN
    RAISE EXCEPTION 'PAYMENT_SETTLEMENT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_payment FROM public.payment_transactions WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_payment.payment_status='completed' THEN
    RETURN private.settle_subscription_payment_unchecked(p_payment_id,p_gateway_transaction_id);
  END IF;
  IF v_payment.payment_status<>'pending' THEN RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices WHERE id=v_payment.invoice_id AND subscription_quote_id IS NOT NULL)
    OR v_payment.metadata->>'type'='quote_draft' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_DRAFT_NOT_PAYABLE' USING ERRCODE='PT409';
  END IF;
  RAISE EXCEPTION 'SUBSCRIPTION_LEGACY_ORDER_REQUIRES_REVIEW' USING ERRCODE='PT409';
END;
$fn$;
REVOKE ALL ON FUNCTION public.settle_subscription_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_subscription_payment(uuid,text) TO authenticated,service_role;

-- Retire the older activation entry point too, not just the webhook wrapper.
CREATE OR REPLACE FUNCTION public.handle_successful_payment(p_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN RAISE EXCEPTION 'TRUSTED_CALL_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM public.settle_subscription_payment(p_transaction_id,NULL);
END;
$fn$;
REVOKE ALL ON FUNCTION public.handle_successful_payment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_successful_payment(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
