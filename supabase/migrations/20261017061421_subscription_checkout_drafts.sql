-- Phase 2b1: atomically prepare NON-PAYABLE invoice/payment drafts without any
-- bank/provider credentials. No UI cutover, entitlement change or legacy grant
-- change. The unsupported quote_draft payment type deliberately fails closed
-- in the existing settlement validator until a reviewed activation path exists.
ALTER TABLE public.invoices ADD COLUMN subscription_quote_id uuid
  REFERENCES private.subscription_quotes(id) ON DELETE SET NULL;
CREATE INDEX invoices_subscription_quote_idx ON public.invoices(subscription_quote_id);

CREATE TABLE private.subscription_checkout_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  quote_id uuid NOT NULL UNIQUE REFERENCES private.subscription_quotes(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,request_id)
);
CREATE INDEX subscription_checkout_drafts_creator_idx ON private.subscription_checkout_drafts(created_by);
ALTER TABLE private.subscription_checkout_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_checkout_drafts FROM PUBLIC,anon,authenticated,service_role;

-- Browser invoice privileges for legacy rows are untouched. A linked server
-- draft, however, must not be edited/marked paid/detached/deleted by a client.
-- INVOKER is intentional: guarded RPCs run as postgres; REST runs as the user.
CREATE OR REPLACE FUNCTION private.guard_quoted_invoice_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    IF (TG_OP<>'INSERT' AND OLD.subscription_quote_id IS NOT NULL)
      OR (TG_OP<>'DELETE' AND NEW.subscription_quote_id IS NOT NULL) THEN
      RAISE EXCEPTION 'QUOTED_INVOICE_SERVER_ONLY' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_quoted_invoice_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_quoted_invoice_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_quoted_invoice_mutation();

CREATE OR REPLACE FUNCTION private.subscription_checkout_draft_result(p_draft_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT jsonb_build_object('draft_id',d.id,'request_id',d.request_id,'tenant_id',d.tenant_id,
    'quote_id',d.quote_id,'invoice_id',d.invoice_id,'payment_id',d.payment_id,
    'invoice_status',i.status,'payment_status',p.payment_status,'quote',q.snapshot,
    'created_at',d.created_at,'checkout_enabled',false,'non_payable',true)
  FROM private.subscription_checkout_drafts d
  JOIN private.subscription_quotes q ON q.id=d.quote_id AND q.tenant_id=d.tenant_id
  JOIN public.invoices i ON i.id=d.invoice_id AND i.tenant_id=d.tenant_id
  JOIN public.payment_transactions p ON p.id=d.payment_id AND p.tenant_id=d.tenant_id
  WHERE d.id=p_draft_id;
$fn$;
REVOKE ALL ON FUNCTION private.subscription_checkout_draft_result(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_subscription_checkout_draft(p_quote_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_tenant uuid := private.subscription_quote_actor();
  v_t public.tenants%ROWTYPE;
  v_q private.subscription_quotes%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_d private.subscription_checkout_drafts%ROWTYPE;
  v_invoice uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_actual integer;
  v_target integer;
  v_amount numeric;
  v_description text;
BEGIN
  IF p_quote_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'DRAFT_INPUT_REQUIRED' USING ERRCODE='22023';
  END IF;
  -- Tenant lock is shared with quote generation and room quota enforcement.
  -- Never lock an existing payment here (settlement takes payment -> tenant).
  SELECT * INTO v_t FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  SELECT * INTO v_d FROM private.subscription_checkout_drafts
    WHERE tenant_id=v_tenant AND request_id=p_request_id;
  IF FOUND THEN
    IF v_d.quote_id<>p_quote_id THEN RAISE EXCEPTION 'DRAFT_REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN private.subscription_checkout_draft_result(v_d.id);
  END IF;
  SELECT * INTO v_q FROM private.subscription_quotes WHERE id=p_quote_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF EXISTS(SELECT 1 FROM private.subscription_checkout_drafts WHERE quote_id=p_quote_id) THEN
    RAISE EXCEPTION 'QUOTE_ALREADY_HAS_DRAFT' USING ERRCODE='PT409';
  END IF;
  -- Fifteen minutes is a technical freshness window for NON-PAYABLE drafts,
  -- not a new payment deadline or a binding price guarantee for real checkout.
  IF v_q.created_at<=now()-interval '15 minutes' OR v_q.created_at>now() THEN
    RAISE EXCEPTION 'QUOTE_EXPIRED' USING ERRCODE='PT409';
  END IF;
  IF v_t.approval_status IS DISTINCT FROM 'approved' OR v_t.subscription_status='cancelled'
    OR v_t.read_only_reason='admin_suspended' OR v_t.is_read_only IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TENANT_NOT_ELIGIBLE_FOR_DRAFT' USING ERRCODE='42501';
  END IF;
  IF v_t.subscription_plan_id::text IS DISTINCT FROM v_q.snapshot#>>'{basis,subscription_plan_id}'
    OR v_t.registered_rooms IS DISTINCT FROM (v_q.snapshot#>>'{basis,registered_rooms}')::integer
    OR v_t.subscription_status IS DISTINCT FROM v_q.snapshot#>>'{basis,subscription_status}'
    OR v_t.subscription_end_date IS DISTINCT FROM (v_q.snapshot#>>'{basis,subscription_end_date}')::date
    OR v_t.is_read_only IS DISTINCT FROM (v_q.snapshot#>>'{basis,is_read_only}')::boolean
    OR greatest(COALESCE(v_t.subscription_end_date,current_date),current_date)<>
      (CASE WHEN v_q.snapshot->>'kind'='extend' THEN (v_q.snapshot->>'period_start')::date
        ELSE greatest(COALESCE(v_t.subscription_end_date,current_date),current_date) END)
    OR (v_q.snapshot->>'kind'='add_rooms' AND (v_q.snapshot->>'period_start')::date<>current_date) THEN
    RAISE EXCEPTION 'QUOTE_SUBSCRIPTION_CHANGED' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id=(v_q.snapshot->>'plan_id')::uuid
    AND code='standard' AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_PRICE_CHANGED' USING ERRCODE='PT409'; END IF;
  IF v_plan.pricing_model IS DISTINCT FROM 'room_based'
    OR v_q.snapshot->>'pricing_version' IS DISTINCT FROM 'room-daily-v1'
    OR v_plan.price_per_room_daily IS DISTINCT FROM (v_q.snapshot->>'price_per_room_daily')::numeric
    OR v_plan.max_rooms IS DISTINCT FROM (v_q.snapshot#>>'{basis,max_rooms}')::integer
    OR v_plan.min_subscription_days IS DISTINCT FROM (v_q.snapshot#>>'{basis,min_subscription_days}')::integer THEN
    RAISE EXCEPTION 'QUOTE_PRICE_CHANGED' USING ERRCODE='PT409';
  END IF;
  v_target := (v_q.snapshot->>'target_rooms')::integer;
  SELECT count(*) INTO v_actual FROM public.rooms WHERE tenant_id=v_tenant;
  IF v_target<v_actual OR v_target NOT BETWEEN 1 AND 100000
    OR (v_plan.max_rooms IS NOT NULL AND v_target>v_plan.max_rooms) THEN
    RAISE EXCEPTION 'DRAFT_ROOM_LIMIT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Do not silently decide when to apply a room-count change in an already
  -- paid period; that business policy is not approved yet.
  IF v_q.snapshot->>'kind'='extend' AND v_t.subscription_status='active'
    AND v_t.subscription_end_date>=current_date AND v_target<>v_t.registered_rooms THEN
    RAISE EXCEPTION 'ACTIVE_PERIOD_ROOM_CHANGE_REQUIRES_REVIEW' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM public.payment_transactions WHERE tenant_id=v_tenant AND payment_status='pending')
    OR EXISTS(SELECT 1 FROM public.invoices WHERE tenant_id=v_tenant AND status IN ('sent','overdue')) THEN
    RAISE EXCEPTION 'PENDING_SUBSCRIPTION_ORDER_EXISTS' USING ERRCODE='PT409';
  END IF;
  v_amount := (v_q.snapshot->>'total_amount')::numeric;
  IF v_amount IS NULL OR v_amount<=0 OR v_q.snapshot->>'currency' IS DISTINCT FROM 'VND'
    OR v_amount IS DISTINCT FROM (v_q.snapshot->>'subtotal')::numeric
      -(v_q.snapshot->>'discount_amount')::numeric+(v_q.snapshot->>'tax_amount')::numeric THEN
    RAISE EXCEPTION 'INVALID_QUOTE_SNAPSHOT' USING ERRCODE='22023';
  END IF;
  v_description := CASE WHEN v_q.snapshot->>'kind'='add_rooms' THEN 'Nháp mua thêm phòng'
    ELSE 'Nháp gia hạn gói dịch vụ' END;
  INSERT INTO public.invoices(id,tenant_id,invoice_number,invoice_date,due_date,period_start,period_end,
    subscription_plan_id,subscription_quote_id,subtotal,discount_amount,tax_amount,total_amount,
    status,notes,items,created_by)
  VALUES(v_invoice,v_tenant,'DRAFT-'||upper(replace(v_invoice::text,'-','')),current_date,current_date+7,
    (v_q.snapshot->>'period_start')::date,(v_q.snapshot->>'period_end')::date,v_plan.id,p_quote_id,
    (v_q.snapshot->>'subtotal')::numeric,(v_q.snapshot->>'discount_amount')::numeric,
    (v_q.snapshot->>'tax_amount')::numeric,v_amount,'draft',
    'Bản nháp kỹ thuật, chưa được chuyển khoản hoặc kích hoạt gói.',
    jsonb_build_array(jsonb_build_object('description',v_description,'quantity',1,'unit_price',v_amount,'total',v_amount)),auth.uid());
  INSERT INTO public.payment_transactions(id,tenant_id,invoice_id,amount,currency,payment_status,
    payment_method,transaction_reference,metadata,notes)
  VALUES(v_payment,v_tenant,v_invoice,v_amount,'VND','pending',NULL,NULL,
    jsonb_build_object('type','quote_draft','quote_id',p_quote_id,'checkout_enabled',false),
    'Không thanh toán: chưa có phương thức ngân hàng, mã chuyển khoản hoặc quyền kích hoạt.');
  INSERT INTO private.subscription_checkout_drafts(id,tenant_id,created_by,request_id,quote_id,invoice_id,payment_id)
    VALUES(v_draft,v_tenant,auth.uid(),p_request_id,p_quote_id,v_invoice,v_payment);
  RETURN private.subscription_checkout_draft_result(v_draft);
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_subscription_checkout_draft(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_subscription_checkout_draft(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_subscription_checkout_draft(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid := private.subscription_quote_actor(); v_id uuid;
BEGIN
  SELECT id INTO v_id FROM private.subscription_checkout_drafts WHERE tenant_id=v_tenant AND request_id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  RETURN private.subscription_checkout_draft_result(v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_subscription_checkout_draft(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_checkout_draft(uuid) TO authenticated;
COMMENT ON FUNCTION public.create_subscription_checkout_draft(uuid,uuid)
  IS 'Non-payable draft only: atomic invoice/payment/private quote binding. No bank details, transfer reference, settlement or entitlement mutation.';

-- Preserve legacy cancellation, but require the same live owner/session for
-- new server drafts (the legacy generic actor check alone is not owner-only).
CREATE OR REPLACE FUNCTION public.cancel_subscription_payment(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_payment record; v_invoice_updated integer := 0;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT tenant_id,invoice_id,payment_status INTO v_payment FROM public.payment_transactions
    WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM public.assert_rpc_actor(v_payment.tenant_id,NULL,auth.uid(),false);
  IF EXISTS(SELECT 1 FROM public.invoices WHERE id=v_payment.invoice_id AND subscription_quote_id IS NOT NULL) THEN
    IF private.subscription_quote_actor() IS DISTINCT FROM v_payment.tenant_id THEN
      RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_OWNER_REQUIRED' USING ERRCODE='42501';
    END IF;
  END IF;
  IF v_payment.payment_status<>'pending' THEN RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE='22023'; END IF;
  IF v_payment.invoice_id IS NOT NULL THEN
    UPDATE public.invoices SET status='cancelled',updated_at=now()
      WHERE id=v_payment.invoice_id AND tenant_id=v_payment.tenant_id;
    GET DIAGNOSTICS v_invoice_updated = ROW_COUNT;
    IF v_invoice_updated=0 THEN RAISE EXCEPTION 'INVOICE_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
  END IF;
  UPDATE public.payment_transactions SET payment_status='failed',updated_at=now() WHERE id=p_payment_id;
  RETURN jsonb_build_object('payment_id',p_payment_id,'payment_status','failed','invoice_id',v_payment.invoice_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_subscription_payment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_payment(uuid) TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';
