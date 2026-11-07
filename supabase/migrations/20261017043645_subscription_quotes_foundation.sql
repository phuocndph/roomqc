-- Phase 2a: durable, server-priced previews ONLY. These records do not authorize
-- payment or entitlement changes. Checkout will be cut over in a separate,
-- atomic invoice/settlement migration; no legacy billing privileges change here.
CREATE TABLE private.subscription_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  request_inputs jsonb NOT NULL CHECK (jsonb_typeof(request_inputs)='object'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_id)
);
ALTER TABLE private.subscription_quotes ENABLE ROW LEVEL SECURITY;
CREATE INDEX subscription_quotes_creator_idx ON private.subscription_quotes(created_by);
REVOKE ALL ON private.subscription_quotes FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.subscription_quote_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid;
BEGIN
  -- Use live database roles/profile/session, never editable user_metadata.
  SELECT u.tenant_id INTO v_tenant FROM public.users u
    JOIN auth.users au ON au.id=u.id
    WHERE u.id=auth.uid() AND u.status='active' AND NOT COALESCE(u.account_locked,false)
      AND au.email_confirmed_at IS NOT NULL
      AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='owner')
      AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
        AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()));
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_tenant;
END;
$fn$;
REVOKE ALL ON FUNCTION private.subscription_quote_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_subscription_quote(
  p_request_id uuid, p_kind text, p_rooms integer, p_duration_days integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_tenant_id uuid := private.subscription_quote_actor();
  v_t public.tenants%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_q private.subscription_quotes%ROWTYPE;
  v_inputs jsonb;
  v_snapshot jsonb;
  v_actual integer;
  v_target integer;
  v_days integer;
  v_discount integer;
  v_base numeric;
  v_discount_amount numeric;
  v_period_start date;
  v_period_end date;
BEGIN
  IF p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('extend','add_rooms')
    OR p_rooms IS NULL OR p_rooms NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'INVALID_QUOTE_INPUT' USING ERRCODE='22023';
  END IF;
  IF (p_kind='extend' AND (p_duration_days IS NULL OR p_duration_days NOT IN (30,90,180,365)))
    OR (p_kind='add_rooms' AND p_duration_days IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_QUOTE_DURATION' USING ERRCODE='22023';
  END IF;
  v_inputs := jsonb_build_object('kind',p_kind,'rooms',p_rooms,'duration_days',p_duration_days);
  -- Same lock as room-capacity enforcement: room counts and quota form a
  -- coherent snapshot; concurrent retries serialize without duplicating it.
  SELECT * INTO v_t FROM public.tenants WHERE id=v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_q FROM private.subscription_quotes
    WHERE tenant_id=v_tenant_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_q.request_inputs IS DISTINCT FROM v_inputs THEN
      RAISE EXCEPTION 'QUOTE_REQUEST_CONFLICT' USING ERRCODE='22023';
    END IF;
    -- A retry recovers the original preview, never reprices it or revives it.
    RETURN v_q.snapshot;
  END IF;
  IF v_t.approval_status IS DISTINCT FROM 'approved' OR v_t.subscription_status='cancelled'
    OR v_t.read_only_reason='admin_suspended' THEN
    RAISE EXCEPTION 'TENANT_NOT_ELIGIBLE_FOR_QUOTE' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans
    WHERE code='standard' AND is_active=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAID_PLAN_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
  IF v_plan.pricing_model IS DISTINCT FROM 'room_based'
    OR v_plan.price_per_room_daily IS NULL OR v_plan.price_per_room_daily<=0
    OR v_plan.price_per_room_daily<>trunc(v_plan.price_per_room_daily)
    OR v_plan.price_per_room_daily>1000000000
    OR v_plan.min_subscription_days IS NULL OR v_plan.min_subscription_days<1 THEN
    RAISE EXCEPTION 'INVALID_SERVER_PRICE_CONFIGURATION' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_actual FROM public.rooms WHERE tenant_id=v_tenant_id;
  IF p_kind='extend' THEN
    IF p_duration_days<v_plan.min_subscription_days THEN
      RAISE EXCEPTION 'DURATION_BELOW_PLAN_MINIMUM' USING ERRCODE='22023';
    END IF;
    v_target := p_rooms;
    v_days := p_duration_days;
    -- Preserve the existing published duration discounts; version the rule in
    -- each snapshot, and take the room-day price from the live server plan.
    v_discount := CASE p_duration_days WHEN 90 THEN 5 WHEN 180 THEN 10 WHEN 365 THEN 15 ELSE 0 END;
    v_period_start := greatest(COALESCE(v_t.subscription_end_date,current_date),current_date);
    v_period_end := v_period_start+v_days;
  ELSE
    IF v_t.subscription_status IS DISTINCT FROM 'active' OR v_t.is_read_only IS DISTINCT FROM false
      OR v_t.subscription_end_date IS NULL OR v_t.subscription_end_date<=current_date
      OR v_t.subscription_plan_id IS DISTINCT FROM v_plan.id OR COALESCE(v_t.registered_rooms,0)<1 THEN
      RAISE EXCEPTION 'ACTIVE_PAID_SUBSCRIPTION_REQUIRED' USING ERRCODE='22023';
    END IF;
    v_target := v_t.registered_rooms+p_rooms;
    v_days := v_t.subscription_end_date-current_date;
    v_discount := 0;
    v_period_start := current_date;
    v_period_end := v_t.subscription_end_date;
  END IF;
  IF v_target<v_actual OR v_target>100000
    OR (v_plan.max_rooms IS NOT NULL AND v_target>v_plan.max_rooms) THEN
    RAISE EXCEPTION 'QUOTE_ROOM_LIMIT_INVALID' USING ERRCODE='22023';
  END IF;
  v_base := p_rooms::numeric*v_plan.price_per_room_daily*v_days;
  v_discount_amount := round(v_base*v_discount/100);
  v_snapshot := jsonb_build_object(
    'quote_id',gen_random_uuid(),'tenant_id',v_tenant_id,'created_by',auth.uid(),
    'request_id',p_request_id,'kind',p_kind,'currency','VND',
    'pricing_version','room-daily-v1','plan_id',v_plan.id,'plan_code',v_plan.code,
    'price_per_room_daily',v_plan.price_per_room_daily,'billed_rooms',p_rooms,
    'target_rooms',v_target,'duration_days',v_days,'discount_percent',v_discount,
    'subtotal',v_base,'discount_amount',v_discount_amount,'tax_amount',0,
    'total_amount',v_base-v_discount_amount,'period_start',v_period_start,'period_end',v_period_end,
    'quoted_at',now(),'checkout_enabled',false,
    'basis',jsonb_build_object('subscription_plan_id',v_t.subscription_plan_id,
      'registered_rooms',v_t.registered_rooms,'actual_rooms',v_actual,
      'subscription_status',v_t.subscription_status,'subscription_end_date',v_t.subscription_end_date,
      'is_read_only',v_t.is_read_only,'max_rooms',v_plan.max_rooms,
      'min_subscription_days',v_plan.min_subscription_days));
  INSERT INTO private.subscription_quotes(id,tenant_id,created_by,request_id,request_inputs,snapshot)
    VALUES ((v_snapshot->>'quote_id')::uuid,v_tenant_id,auth.uid(),p_request_id,v_inputs,v_snapshot);
  RETURN v_snapshot;
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_subscription_quote(uuid,text,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_subscription_quote(uuid,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_subscription_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_tenant uuid := private.subscription_quote_actor();
  v_snapshot jsonb;
BEGIN
  SELECT snapshot INTO v_snapshot FROM private.subscription_quotes
    WHERE id=p_quote_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  RETURN v_snapshot;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_subscription_quote(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_quote(uuid) TO authenticated;
COMMENT ON FUNCTION public.create_subscription_quote(uuid,text,integer,integer)
  IS 'Phase 2a owner-scoped durable price preview. NOT a checkout/payment authorization; no invoice or entitlement mutation.';
NOTIFY pgrst, 'reload schema';
