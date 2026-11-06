-- Operational inspection only: no settlement, cancellation, entitlement or
-- provider writes. Existing evidence is preserved, including inconsistent rows.
CREATE INDEX IF NOT EXISTS subscription_reconciliation_tenant_cursor_idx
  ON public.payment_transactions
  (tenant_id, (COALESCE(created_at, '1970-01-01'::timestamptz)) DESC, id DESC)
  WHERE payment_status IN ('pending','completed');
CREATE INDEX IF NOT EXISTS subscription_reconciliation_invoice_status_idx
  ON public.payment_transactions(invoice_id,payment_status)
  WHERE invoice_id IS NOT NULL;

-- Cross-tenant support requires definer privileges. Every invocation checks
-- a live platform-admin session BEFORE validating parameters or reading data.
CREATE OR REPLACE FUNCTION public.admin_subscription_reconciliation(
  p_tenant_id uuid,
  p_filter text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid;
  v_rows jsonb;
  v_has_more boolean;
  v_last jsonb;
BEGIN
  v_actor := public.platform_support_actor();
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_actor
    AND u.email_confirmed_at IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_filter IS NULL OR p_filter NOT IN ('all','attention','legacy','stale')
    OR p_limit IS NULL OR p_limit<1 OR p_limit>100
    OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_PARAMETERS' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='PT404';
  END IF;

  WITH candidates AS (
    SELECT p.id,p.tenant_id,p.invoice_id,p.amount,p.currency,p.payment_status,
      COALESCE(p.created_at,'1970-01-01'::timestamptz) AS created_at,
      -- Never project another tenant's invoice content, even in damaged data.
      CASE WHEN i.tenant_id=p.tenant_id THEN i.invoice_number END AS invoice_number,
      CASE WHEN i.tenant_id=p.tenant_id THEN i.status END AS invoice_status,
      array_remove(ARRAY[
        CASE WHEN p.payment_status='pending' AND i.subscription_quote_id IS NULL
          AND COALESCE(p.metadata->>'type','')<>'quote_draft' THEN 'legacy_unverified' END,
        CASE WHEN i.subscription_quote_id IS NOT NULL OR p.metadata->>'type'='quote_draft'
          THEN 'non_payable_draft' END,
        CASE WHEN p.payment_status='pending' AND p.created_at<now()-interval '24 hours'
          THEN 'stale_pending' END,
        CASE WHEN i.id IS NULL THEN 'missing_invoice' END,
        CASE WHEN i.id IS NOT NULL AND i.tenant_id<>p.tenant_id THEN 'invoice_tenant_mismatch' END,
        CASE WHEN p.payment_status='pending' AND (i.status='paid' OR i.paid_at IS NOT NULL
          OR EXISTS(SELECT 1 FROM public.payment_transactions s
            WHERE s.invoice_id=p.invoice_id AND s.payment_status='completed')) THEN 'paid_parent_pending' END,
        CASE WHEN p.payment_status='pending' AND i.status='cancelled' THEN 'closed_parent_pending' END,
        CASE WHEN p.payment_status='completed' AND i.status IS DISTINCT FROM 'paid'
          THEN 'completed_invoice_unpaid' END,
        CASE WHEN p.payment_status='completed' AND (i.subscription_quote_id IS NOT NULL
          OR p.metadata->>'type'='quote_draft') THEN 'draft_completed' END,
        CASE WHEN i.total_amount IS DISTINCT FROM p.amount AND i.id IS NOT NULL THEN 'amount_mismatch' END,
        CASE WHEN p.currency<>'VND' OR p.amount<=0 THEN 'invalid_payment_value' END,
        CASE WHEN p.created_at IS NULL THEN 'missing_created_at' END,
        CASE WHEN p.payment_status='pending' AND EXISTS(SELECT 1 FROM public.payment_transactions s
          WHERE s.invoice_id=p.invoice_id AND s.id<>p.id AND s.payment_status='pending')
          THEN 'shared_pending_invoice' END
      ],NULL) AS flags
    FROM public.payment_transactions p
    LEFT JOIN public.invoices i ON i.id=p.invoice_id
    WHERE p.tenant_id=p_tenant_id AND p.payment_status IN ('pending','completed')
      AND (p_before_id IS NULL OR
        (COALESCE(p.created_at,'1970-01-01'::timestamptz),p.id)<(p_before_created_at,p_before_id))
  ), filtered AS (
    SELECT * FROM candidates
    WHERE (payment_status='pending' OR cardinality(flags)>0)
      AND (p_filter='all'
        OR (p_filter='attention' AND cardinality(array_remove(flags,'non_payable_draft'))>0)
        OR (p_filter='legacy' AND 'legacy_unverified'=ANY(flags))
        OR (p_filter='stale' AND 'stale_pending'=ANY(flags)))
    ORDER BY created_at DESC,id DESC LIMIT p_limit+1
  ), numbered AS (
    SELECT *,row_number() OVER(ORDER BY created_at DESC,id DESC) AS rn FROM filtered
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(numbered)-'rn' ORDER BY created_at DESC,id DESC)
      FILTER(WHERE rn<=p_limit),'[]'::jsonb),COALESCE(bool_or(rn>p_limit),false)
    INTO v_rows,v_has_more FROM numbered;
  v_last := v_rows->(jsonb_array_length(v_rows)-1);
  RETURN jsonb_build_object('rows',v_rows,'has_more',v_has_more,'checked_at',now(),
    'next_cursor',CASE WHEN v_has_more THEN jsonb_build_object(
      'created_at',v_last->>'created_at','id',v_last->>'id') ELSE NULL END);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_subscription_reconciliation(uuid,text,integer,timestamptz,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_subscription_reconciliation(uuid,text,integer,timestamptz,uuid)
  TO authenticated;
COMMENT ON FUNCTION public.admin_subscription_reconciliation(uuid,text,integer,timestamptz,uuid)
  IS 'Read-only support queue; flags are diagnostics, not authorization to pay/settle. Keyset pages, live platform admin only.';
NOTIFY pgrst,'reload schema';
