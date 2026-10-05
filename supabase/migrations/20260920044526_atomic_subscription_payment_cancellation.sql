-- Cancel a pending subscription payment and its invoice in one transaction.
-- The caller may only cancel a payment belonging to its own tenant.
CREATE OR REPLACE FUNCTION public.cancel_subscription_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment record;
  v_invoice_updated integer := 0;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT pt.tenant_id, pt.invoice_id, pt.payment_status
    INTO v_payment
  FROM public.payment_transactions pt
  WHERE pt.id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_rpc_actor(v_payment.tenant_id, NULL, auth.uid(), false);

  IF v_payment.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE = '22023';
  END IF;

  IF v_payment.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_payment.invoice_id
      AND tenant_id = v_payment.tenant_id;
    GET DIAGNOSTICS v_invoice_updated = ROW_COUNT;
    IF v_invoice_updated = 0 THEN
      RAISE EXCEPTION 'INVOICE_TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.payment_transactions
  SET payment_status = 'failed', updated_at = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'payment_status', 'failed',
    'invoice_id', v_payment.invoice_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_subscription_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_payment(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
