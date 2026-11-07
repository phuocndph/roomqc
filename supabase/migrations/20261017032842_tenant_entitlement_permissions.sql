-- RLS protects rows, not billing columns. Profile edits remain available to
-- owners, while every browser (including admins) uses an audited RPC for plans.
REVOKE UPDATE, DELETE ON public.tenants FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, email, phone, logo_url, settings, usage_mode, billing_email,
  billing_address, tax_id, auto_renew, updated_at) ON public.tenants TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_manage_tenant(
  p_tenant_id uuid, p_action text, p_reason text,
  p_rooms integer DEFAULT NULL, p_duration_days integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_before public.tenants%ROWTYPE;
  v_after public.tenants%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_actual integer;
  v_end date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid())
     OR NOT EXISTS (SELECT 1 FROM public.users
       WHERE id=auth.uid() AND status='active' AND NOT COALESCE(account_locked,false)) THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 OR length(p_reason) > 1000 THEN
    RAISE EXCEPTION 'ADMIN_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('suspend','reactivate','change_plan') THEN
    RAISE EXCEPTION 'INVALID_TENANT_ACTION' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_before FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  IF p_action='suspend' THEN
    UPDATE public.tenants SET subscription_status='suspended',
      is_read_only=true, read_only_reason='admin_suspended',
      read_only_since=COALESCE(read_only_since,now()), updated_at=now()
      WHERE id=p_tenant_id;
  ELSIF p_action='reactivate' THEN
    -- Restoring access is not a free renewal. Expired plans require an explicit
    -- dated adjustment or a verified payment instead.
    IF v_before.approval_status IS DISTINCT FROM 'approved'
       OR NOT (COALESCE(v_before.subscription_end_date >= current_date,false)
         OR (v_before.subscription_end_date IS NULL
             AND COALESCE(v_before.trial_ends_at > now(),false))) THEN
      RAISE EXCEPTION 'VALID_SUBSCRIPTION_REQUIRED' USING ERRCODE='22023';
    END IF;
    UPDATE public.tenants SET subscription_status=
      CASE WHEN v_before.subscription_end_date IS NULL THEN 'trial' ELSE 'active' END,
      is_read_only=false,read_only_reason=NULL,read_only_since=NULL,
      grace_period_ends_at=NULL,updated_at=now() WHERE id=p_tenant_id;
  ELSE
    IF p_rooms IS NULL OR p_rooms < 1 OR p_rooms > 100000
       OR p_duration_days IS NULL OR p_duration_days NOT IN (30,90,180,365,730) THEN
      RAISE EXCEPTION 'INVALID_SUBSCRIPTION_INPUT' USING ERRCODE='22023';
    END IF;
    IF v_before.approval_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'APPROVED_TENANT_REQUIRED' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_plan FROM public.subscription_plans
      WHERE code='standard' AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD_PLAN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    SELECT count(*) INTO v_actual FROM public.rooms r
      JOIN public.hotels h ON h.id=r.hotel_id WHERE h.tenant_id=p_tenant_id;
    IF p_rooms < v_actual OR (v_plan.max_rooms IS NOT NULL AND p_rooms > v_plan.max_rooms) THEN
      RAISE EXCEPTION 'ROOM_LIMIT_INVALID' USING ERRCODE='22023';
    END IF;
    v_end := current_date + p_duration_days;
    UPDATE public.tenants SET subscription_plan_id=v_plan.id,
      registered_rooms=p_rooms,subscription_duration_days=p_duration_days,
      subscription_start_date=current_date,subscription_end_date=v_end,
      subscription_current_period_start=now(),subscription_current_period_end=v_end::timestamptz,
      next_billing_date=v_end::timestamptz,subscription_status='active',
      is_read_only=false,read_only_reason=NULL,read_only_since=NULL,
      grace_period_ends_at=NULL,updated_at=now() WHERE id=p_tenant_id;
    PERFORM public.update_tenant_usage(p_tenant_id);
  END IF;
  SELECT * INTO v_after FROM public.tenants WHERE id=p_tenant_id;
  PERFORM public.log_state_transition(p_tenant_id,NULL,'tenants',p_tenant_id,
    'admin_' || p_action,v_before.subscription_status,v_after.subscription_status,trim(p_reason),
    jsonb_build_object('source','admin_manage_tenant','before',to_jsonb(v_before),'after',to_jsonb(v_after)));
  RETURN to_jsonb(v_after);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_manage_tenant(uuid,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_tenant(uuid,text,text,integer,integer) TO authenticated;

-- A customer may request/cancel a pending payment, never confirm receipt of
-- money. The gateway/service and active super admins retain settlement access.
-- PostgREST versions store verified claims in request.jwt.claims; retain the
-- legacy scalar fallback used by older workers as well.
CREATE OR REPLACE FUNCTION public.rpc_request_is_trusted()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT session_user IN ('postgres','supabase_admin','service_role')
    OR COALESCE(auth.jwt()->>'role',
      NULLIF(current_setting('request.jwt.claim.role',true),''),'')='service_role';
$fn$;

CREATE OR REPLACE FUNCTION public.settle_subscription_payment(
  p_payment_id uuid, p_gateway_transaction_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_payment record;
  v_gateway_key text := NULLIF(trim(p_gateway_transaction_id),'');
  v_service boolean := public.rpc_request_is_trusted();
BEGIN
  IF NOT v_service AND (auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND status='active'
      AND NOT COALESCE(account_locked,false))) THEN
    RAISE EXCEPTION 'PAYMENT_SETTLEMENT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT payment_method,payment_status,metadata INTO v_payment
    FROM public.payment_transactions WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_gateway_key IS NOT NULL THEN
    IF v_payment.payment_method IS DISTINCT FROM 'bank_transfer' THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METHOD_FOR_GATEWAY' USING ERRCODE='22023';
    END IF;
    IF length(v_gateway_key)>200 OR v_gateway_key !~ '^[A-Za-z0-9._:-]+$' THEN
      RAISE EXCEPTION 'INVALID_GATEWAY_TRANSACTION_ID' USING ERRCODE='22023';
    END IF;
  END IF;
  IF v_payment.payment_status='pending' THEN
    PERFORM private.validate_subscription_payment_metadata(COALESCE(v_payment.metadata,'{}'::jsonb));
  END IF;
  RETURN private.settle_subscription_payment_unchecked(p_payment_id,v_gateway_key);
END;
$fn$;
REVOKE ALL ON FUNCTION public.settle_subscription_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_subscription_payment(uuid,text) TO authenticated,service_role;

-- Browser edits must not mark a payment paid or replace the amount/reference
-- after it has been submitted. Cancellation already has a guarded RPC.
REVOKE UPDATE, DELETE ON public.payment_transactions FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.guard_customer_payment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    IF NEW.payment_status IS DISTINCT FROM 'pending' OR NEW.payment_date IS NOT NULL
      OR NEW.gateway_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION 'PAYMENT_CONFIRMATION_SERVER_ONLY' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_customer_payment_insert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_customer_payment_insert ON public.payment_transactions;
CREATE TRIGGER guard_customer_payment_insert BEFORE INSERT ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION private.guard_customer_payment_insert();
