-- Renewal checkout (07/11/2026): an expired tenant must be able to pay.
--
-- Before: create_subscription_checkout_draft refused every read-only tenant,
-- and a plan becomes read-only exactly when it expires; orders were technical
-- non-payable drafts and settle_subscription_payment refused every order.
-- Expired customers therefore had no way to renew.
--
-- Now:
--  * expired (read-only) tenants can create a renewal order; unapproved,
--    cancelled or admin-suspended tenants are still refused;
--  * the order is real: bank transfer to the platform account with a unique
--    transfer reference, and it is only created when that account exists;
--  * the owner reads transfer instructions through a scoped RPC (tenants cannot
--    read the platform bank row directly);
--  * settle_subscription_payment activates these orders from the server quote
--    (SePay webhook as service role, or a super admin) and lifts the read-only
--    state; legacy orders and old technical drafts stay blocked as before.

-- Read-only tenants may not write business rows, but renewal order rows are
-- written only by the server functions below, which set a transaction-local
-- flag. The flag is not reachable from the REST API (no client GUC access) and
-- quoted invoices also stay protected by guard_quoted_invoice_mutation.
CREATE OR REPLACE FUNCTION public.enforce_read_only_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    BEGIN v_tenant := (to_jsonb(OLD)->>'tenant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_tenant := NULL; END;
  ELSE
    BEGIN v_tenant := (to_jsonb(NEW)->>'tenant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_tenant := NULL; END;
  END IF;

  IF v_tenant IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME IN ('invoices','payment_transactions')
     AND TG_OP <> 'DELETE' AND current_setting('roomqc.renewal_checkout', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.is_tenant_read_only(v_tenant) THEN
    RAISE EXCEPTION 'TENANT_READ_ONLY: Tenant đang ở chế độ chỉ đọc.' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_subscription_checkout_draft(p_quote_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_tenant uuid;
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
  v_bank public.bank_payment_settings%ROWTYPE;
  v_reference text;
BEGIN
  PERFORM private.lock_live_role_actor('owner');
  v_tenant := private.subscription_quote_actor();
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
  -- The quote must still be fresh when the order is created; the order then
  -- carries its own server price until it is paid, cancelled or expired.
  IF v_q.created_at<=now()-interval '15 minutes' OR v_q.created_at>now() THEN
    RAISE EXCEPTION 'QUOTE_EXPIRED' USING ERRCODE='PT409';
  END IF;
  -- An expired plan is read-only by design and must be able to renew. Only an
  -- unapproved, cancelled or admin-suspended tenant is refused.
  IF v_t.approval_status IS DISTINCT FROM 'approved' OR v_t.subscription_status='cancelled'
    OR v_t.read_only_reason='admin_suspended' THEN
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
  -- Renewal money goes only to the platform account (no tenant or hotel).
  SELECT * INTO v_bank FROM public.bank_payment_settings
    WHERE tenant_id IS NULL AND hotel_id IS NULL AND is_active
    ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1;
  IF NOT FOUND OR NULLIF(trim(v_bank.account_number),'') IS NULL OR NULLIF(trim(v_bank.bank_code),'') IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_PAYMENT_ACCOUNT_NOT_CONFIGURED' USING ERRCODE='PT409';
  END IF;
  v_reference := COALESCE(NULLIF(upper(regexp_replace(COALESCE(v_bank.payment_prefix,''),'[^A-Za-z0-9]','','g')),''),'RQC')
    || upper(substr(replace(v_payment::text,'-',''),1,12));
  v_description := CASE WHEN v_q.snapshot->>'kind'='add_rooms' THEN 'Mua thêm phòng'
    ELSE 'Gia hạn gói dịch vụ' END;
  -- Expired tenants are read-only; let only this server function write the order rows.
  PERFORM set_config('roomqc.renewal_checkout','on',true);
  INSERT INTO public.invoices(id,tenant_id,invoice_number,invoice_date,due_date,period_start,period_end,
    subscription_plan_id,subscription_quote_id,subtotal,discount_amount,tax_amount,total_amount,
    status,notes,items,created_by)
  VALUES(v_invoice,v_tenant,'RQC-'||upper(replace(v_invoice::text,'-','')),current_date,current_date+7,
    (v_q.snapshot->>'period_start')::date,(v_q.snapshot->>'period_end')::date,v_plan.id,p_quote_id,
    (v_q.snapshot->>'subtotal')::numeric,(v_q.snapshot->>'discount_amount')::numeric,
    (v_q.snapshot->>'tax_amount')::numeric,v_amount,'sent',
    'Đơn chờ chuyển khoản. Gói được kích hoạt khi RoomQC nhận đủ tiền.',
    jsonb_build_array(jsonb_build_object('description',v_description,'quantity',1,'unit_price',v_amount,'total',v_amount)),auth.uid());
  INSERT INTO public.payment_transactions(id,tenant_id,invoice_id,amount,currency,payment_status,
    payment_method,transaction_reference,metadata,notes)
  VALUES(v_payment,v_tenant,v_invoice,v_amount,'VND','pending','bank_transfer',v_reference,
    jsonb_build_object('type','subscription_quote','quote_id',p_quote_id,'checkout_enabled',true,
      'kind',v_q.snapshot->>'kind','target_rooms',v_target,
      'duration_days',(v_q.snapshot->>'duration_days')::integer),
    'Chuyển khoản đúng số tiền và nội dung để gói tự kích hoạt.');
  INSERT INTO private.subscription_checkout_drafts(id,tenant_id,created_by,request_id,quote_id,invoice_id,payment_id)
    VALUES(v_draft,v_tenant,auth.uid(),p_request_id,p_quote_id,v_invoice,v_payment);
  PERFORM set_config('roomqc.renewal_checkout','off',true);
  RETURN private.subscription_checkout_draft_result(v_draft);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cancel_subscription_payment(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_payment public.payment_transactions%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_owner_tenant uuid;
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN
    PERFORM private.lock_live_role_actor('owner');
    v_owner_tenant := private.subscription_quote_actor();
  END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_payment FROM public.payment_transactions WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.rpc_request_is_trusted() THEN
    IF v_owner_tenant IS DISTINCT FROM v_payment.tenant_id THEN
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
  -- A read-only (expired) owner must still be able to withdraw an unpaid order.
  PERFORM set_config('roomqc.renewal_checkout','on',true);
  UPDATE public.payment_transactions SET payment_status='failed',updated_at=now() WHERE id=p_payment_id;
  -- Serialize sibling cancellation on the invoice, but never wait for sibling
  -- payment locks (settlement/expiry lock payment first).
  IF v_payment.invoice_id IS NOT NULL AND v_invoice.status IN ('draft','sent','overdue')
    AND NOT EXISTS(SELECT 1 FROM public.payment_transactions
      WHERE invoice_id=v_invoice.id AND payment_status='pending') THEN
    UPDATE public.invoices SET status='cancelled',updated_at=now() WHERE id=v_invoice.id;
  END IF;
  PERFORM set_config('roomqc.renewal_checkout','off',true);
  RETURN jsonb_build_object('payment_id',p_payment_id,'payment_status','failed',
    'invoice_id',v_payment.invoice_id,'already_cancelled',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.subscription_checkout_draft_result(p_draft_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT jsonb_build_object('draft_id',d.id,'request_id',d.request_id,'tenant_id',d.tenant_id,
    'quote_id',d.quote_id,'invoice_id',d.invoice_id,'payment_id',d.payment_id,
    'invoice_status',i.status,'payment_status',p.payment_status,'quote',q.snapshot,
    'created_at',d.created_at,
    'checkout_enabled',COALESCE(p.metadata->>'type','')='subscription_quote',
    'non_payable',COALESCE(p.metadata->>'type','')<>'subscription_quote',
    'transaction_reference',p.transaction_reference,'amount',p.amount)
  FROM private.subscription_checkout_drafts d
  JOIN private.subscription_quotes q ON q.id=d.quote_id AND q.tenant_id=d.tenant_id
  JOIN public.invoices i ON i.id=d.invoice_id AND i.tenant_id=d.tenant_id
  JOIN public.payment_transactions p ON p.id=d.payment_id AND p.tenant_id=d.tenant_id
  WHERE d.id=p_draft_id;
$fn$;
REVOKE ALL ON FUNCTION private.subscription_checkout_draft_result(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Transfer instructions for one renewal order of the caller's tenant.
CREATE OR REPLACE FUNCTION public.get_subscription_payment_instructions(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_p public.payment_transactions%ROWTYPE;
  v_bank public.bank_payment_settings%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_p FROM public.payment_transactions WHERE id=p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM private.assert_tenant_scope(v_p.tenant_id);
  IF COALESCE(v_p.metadata->>'type','')<>'subscription_quote' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_DRAFT_NOT_PAYABLE' USING ERRCODE='PT409';
  END IF;
  IF v_p.payment_status<>'pending' THEN
    RETURN jsonb_build_object('payment_id',v_p.id,'payment_status',v_p.payment_status,'payable',false);
  END IF;
  SELECT * INTO v_bank FROM public.bank_payment_settings
    WHERE tenant_id IS NULL AND hotel_id IS NULL AND is_active
    ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('payment_id',v_p.id,'payment_status',v_p.payment_status,'payable',false,
      'reason','SUBSCRIPTION_PAYMENT_ACCOUNT_NOT_CONFIGURED');
  END IF;
  RETURN jsonb_build_object('payment_id',v_p.id,'payment_status',v_p.payment_status,'payable',true,
    'amount',v_p.amount,'currency',v_p.currency,'transaction_reference',v_p.transaction_reference,
    'bank_code',v_bank.bank_code,'bank_name',v_bank.bank_name,'account_number',v_bank.account_number,
    'account_holder',v_bank.account_holder,'qr_template',COALESCE(v_bank.qr_template,'compact'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_subscription_payment_instructions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_payment_instructions(uuid) TO authenticated,service_role;

-- Activate a paid renewal order from its server quote. Callers: SePay webhook
-- (service role, with the bank transaction key) or a live super admin.
CREATE OR REPLACE FUNCTION private.settle_subscription_quote_payment(
  p_payment_id uuid, p_gateway_transaction_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_p public.payment_transactions%ROWTYPE;
  v_i public.invoices%ROWTYPE;
  v_q private.subscription_quotes%ROWTYPE;
  v_before public.tenants%ROWTYPE;
  v_after public.tenants%ROWTYPE;
  v_kind text;
  v_days integer;
  v_target integer;
  v_base date;
  v_end date;
  v_expired boolean;
  v_gateway text := NULLIF(trim(p_gateway_transaction_id),'');
BEGIN
  IF v_gateway IS NOT NULL AND NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'TRUSTED_CALL_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_gateway IS NOT NULL AND (length(v_gateway)>200 OR v_gateway !~ '^[A-Za-z0-9._:-]+$') THEN
    RAISE EXCEPTION 'INVALID_GATEWAY_TRANSACTION_ID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_p FROM public.payment_transactions WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF COALESCE(v_p.metadata->>'type','')<>'subscription_quote' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_DRAFT_NOT_PAYABLE' USING ERRCODE='PT409';
  END IF;
  IF v_p.payment_status='completed' THEN
    RETURN jsonb_build_object('payment_id',v_p.id,'already_processed',true,
      'gateway_transaction_id',v_p.gateway_transaction_id,'invoice_id',v_p.invoice_id);
  END IF;
  IF v_p.payment_status<>'pending' THEN RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_i FROM public.invoices WHERE id=v_p.invoice_id AND tenant_id=v_p.tenant_id FOR UPDATE;
  IF NOT FOUND OR v_i.subscription_quote_id IS NULL
     OR v_i.subscription_quote_id::text IS DISTINCT FROM v_p.metadata->>'quote_id' THEN
    RAISE EXCEPTION 'INVOICE_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF v_i.status NOT IN ('sent','overdue') THEN RAISE EXCEPTION 'INVOICE_NOT_PAYABLE' USING ERRCODE='PT409'; END IF;
  SELECT * INTO v_q FROM private.subscription_quotes WHERE id=v_i.subscription_quote_id AND tenant_id=v_p.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF (v_q.snapshot->>'total_amount')::numeric IS DISTINCT FROM v_p.amount THEN
    RAISE EXCEPTION 'INVALID_QUOTE_SNAPSHOT' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_before FROM public.tenants WHERE id=v_p.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  v_kind := v_q.snapshot->>'kind';
  v_target := (v_q.snapshot->>'target_rooms')::integer;
  IF v_target IS NULL OR v_target NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'INVALID_REGISTERED_ROOMS' USING ERRCODE='22023';
  END IF;

  IF v_kind='extend' THEN
    v_days := (v_q.snapshot->>'duration_days')::integer;
    IF v_days IS NULL OR v_days NOT IN (30,90,180,365) THEN
      RAISE EXCEPTION 'INVALID_DURATION_DAYS' USING ERRCODE='22023';
    END IF;
    v_expired := v_before.subscription_end_date IS NULL OR v_before.subscription_end_date<current_date;
    -- A late payment starts from the payment day; an early one extends the period.
    v_base := greatest(COALESCE(v_before.subscription_end_date,current_date),current_date);
    v_end := v_base+v_days;
    UPDATE public.tenants SET
      subscription_plan_id=COALESCE((v_q.snapshot->>'plan_id')::uuid,subscription_plan_id),
      registered_rooms=v_target,
      subscription_duration_days=v_days,
      subscription_start_date=CASE WHEN v_expired THEN current_date ELSE subscription_start_date END,
      subscription_end_date=v_end,
      subscription_current_period_start=CASE WHEN v_expired THEN now() ELSE subscription_current_period_start END,
      subscription_current_period_end=v_end::timestamptz,
      next_billing_date=v_end::timestamptz,
      subscription_status='active',
      grace_period_ends_at=NULL,
      is_read_only=CASE WHEN read_only_reason='admin_suspended' THEN is_read_only ELSE false END,
      read_only_since=CASE WHEN read_only_reason='admin_suspended' THEN read_only_since ELSE NULL END,
      read_only_reason=CASE WHEN read_only_reason='admin_suspended' THEN read_only_reason ELSE NULL END,
      updated_at=now()
    WHERE id=v_before.id;
  ELSIF v_kind='add_rooms' THEN
    UPDATE public.tenants SET registered_rooms=greatest(COALESCE(registered_rooms,0),v_target),updated_at=now()
    WHERE id=v_before.id;
  ELSE
    RAISE EXCEPTION 'INVALID_QUOTE_SNAPSHOT' USING ERRCODE='22023';
  END IF;
  PERFORM public.update_tenant_usage(v_before.id);

  UPDATE public.invoices SET status='paid',paid_at=COALESCE(paid_at,now()),updated_at=now() WHERE id=v_i.id;
  UPDATE public.payment_transactions SET payment_status='completed',payment_date=COALESCE(payment_date,now()),
    gateway_transaction_id=COALESCE(v_gateway,gateway_transaction_id),
    payment_gateway=CASE WHEN v_gateway IS NOT NULL THEN 'sepay' ELSE COALESCE(payment_gateway,'manual') END,
    updated_at=now()
  WHERE id=v_p.id;

  SELECT * INTO v_after FROM public.tenants WHERE id=v_before.id;
  PERFORM public.log_state_transition(v_before.id,NULL,'tenants',v_before.id,'subscription_payment_settled',
    v_before.subscription_status,v_after.subscription_status,
    CASE WHEN v_gateway IS NOT NULL THEN 'SePay' ELSE 'Super Admin xác nhận đã nhận tiền' END,
    jsonb_build_object('source','settle_subscription_quote_payment','payment_id',v_p.id,'invoice_id',v_i.id,
      'kind',v_kind,'amount',v_p.amount,'before_end',v_before.subscription_end_date,'after_end',v_after.subscription_end_date));
  RETURN jsonb_build_object('payment_id',v_p.id,'already_processed',false,
    'gateway_transaction_id',v_gateway,'invoice_id',v_i.id,'subscription_end_date',v_after.subscription_end_date);
END;
$fn$;
REVOKE ALL ON FUNCTION private.settle_subscription_quote_payment(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.settle_subscription_payment(
  p_payment_id uuid,p_gateway_transaction_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_payment public.payment_transactions%ROWTYPE;
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN
    PERFORM private.lock_live_role_actor('super_admin');
  END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_payment FROM public.payment_transactions WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF COALESCE(v_payment.metadata->>'type','')='subscription_quote' THEN
    RETURN private.settle_subscription_quote_payment(p_payment_id,p_gateway_transaction_id);
  END IF;
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

NOTIFY pgrst, 'reload schema';
