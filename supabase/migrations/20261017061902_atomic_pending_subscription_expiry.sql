-- Replace the fetch -> blind payment update -> wrong invoice status sequence
-- with one bounded, service-only transaction. Scheduling/secrets are separate.
CREATE INDEX payment_transactions_pending_expiry_idx
  ON public.payment_transactions(created_at,id) WHERE payment_status='pending';

CREATE OR REPLACE FUNCTION public.expire_pending_subscription_payments(
  p_limit integer DEFAULT 500,p_tenant_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_payment record;
  v_invoice public.invoices%ROWTYPE;
  v_expired integer := 0;
  v_cancelled integer := 0;
  v_skipped integer := 0;
  v_updated integer;
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN RAISE EXCEPTION 'TRUSTED_CALL_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_EXPIRY_BATCH_LIMIT' USING ERRCODE='22023';
  END IF;
  -- Only one expiry sweep at a time, without waiting. This also prevents two
  -- multi-invoice expiry batches from deadlocking on legacy shared invoices.
  -- Payment SKIP LOCKED still permits concurrent settlement/cancellation.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('roomqc.pending_subscription_expiry',0)) THEN
    RETURN jsonb_build_object('expired_count',0,'cancelled_invoices',0,'skipped_count',0,'busy',true);
  END IF;
  FOR v_payment IN
    SELECT pt.id,pt.tenant_id,pt.invoice_id FROM public.payment_transactions pt
    WHERE pt.payment_status='pending' AND pt.created_at<now()-interval '24 hours'
      AND (p_tenant_id IS NULL OR pt.tenant_id=p_tenant_id)
      -- Inconsistent/paid parent invoices require reconciliation, not expiry.
      -- Exclude them from the queue so they cannot starve valid later rows.
      AND (pt.invoice_id IS NULL OR EXISTS(SELECT 1 FROM public.invoices i
        WHERE i.id=pt.invoice_id AND i.tenant_id=pt.tenant_id AND i.paid_at IS NULL
          AND i.status IN ('draft','sent','overdue','cancelled')))
    ORDER BY pt.created_at,pt.id LIMIT p_limit FOR UPDATE OF pt SKIP LOCKED
  LOOP
    IF v_payment.invoice_id IS NOT NULL THEN
      SELECT * INTO v_invoice FROM public.invoices WHERE id=v_payment.invoice_id FOR UPDATE;
      IF NOT FOUND OR v_invoice.tenant_id<>v_payment.tenant_id OR v_invoice.paid_at IS NOT NULL
        OR v_invoice.status NOT IN ('draft','sent','overdue','cancelled') THEN
        v_skipped := v_skipped+1;
        CONTINUE;
      END IF;
    END IF;
    UPDATE public.payment_transactions SET payment_status='expired',updated_at=now(),
      notes='Tự động hết hạn sau 24 giờ không nhận được thanh toán'
      WHERE id=v_payment.id AND payment_status='pending';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_expired := v_expired+v_updated;
    -- Do not cancel a shared legacy invoice while another pending transaction
    -- (possibly newer than the cutoff) is still attached to it.
    IF v_updated=1 AND v_payment.invoice_id IS NOT NULL AND v_invoice.status<>'cancelled'
      AND NOT EXISTS(SELECT 1 FROM public.payment_transactions
        WHERE invoice_id=v_payment.invoice_id AND payment_status='pending') THEN
      UPDATE public.invoices SET status='cancelled',updated_at=now(),
        notes='Hóa đơn bị hủy do hết hạn thanh toán'
        WHERE id=v_payment.invoice_id AND tenant_id=v_payment.tenant_id
          AND paid_at IS NULL AND status IN ('draft','sent','overdue');
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      v_cancelled := v_cancelled+v_updated;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('expired_count',v_expired,'cancelled_invoices',v_cancelled,
    'skipped_count',v_skipped,'busy',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.expire_pending_subscription_payments(integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_subscription_payments(integer,uuid) TO service_role;
COMMENT ON FUNCTION public.expire_pending_subscription_payments(integer,uuid)
  IS 'Service-only bounded atomic expiry after 24h; optional tenant scope supports safe local tests/operator repair. Does not settle payments or alter entitlement.';
NOTIFY pgrst, 'reload schema';
