-- Sensitive browser mutations serialize with live account/role/session revocation.
-- Forward-only: preserve tenant policy, owner vs platform authority and trusted
-- service paths. No new billing activation and no historical checksum changes.
CREATE OR REPLACE FUNCTION private.lock_live_role_actor(p_role text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR p_role IS NULL OR p_role NOT IN ('owner','super_admin') THEN
    RAISE EXCEPTION 'ACTIVE_MUTATION_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  -- Same order as registration: Auth -> profile -> role -> session -> business.
  -- SHARE blocks UPDATE/DELETE (including logout), but permits concurrent reads
  -- and commands. Locks are held until the enclosing mutation commits/rolls back.
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now()) THEN
    RAISE EXCEPTION 'ACTIVE_MUTATION_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active'
    OR v_profile.deleted_at IS NOT NULL OR COALESCE(v_profile.account_locked,false) THEN
    RAISE EXCEPTION 'ACTIVE_MUTATION_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor AND role::text=p_role FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_MUTATION_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM auth.sessions WHERE user_id=v_actor AND id::text=auth.jwt()->>'session_id'
    AND (not_after IS NULL OR not_after>now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_MUTATION_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_live_role_actor(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_hotel_room_setup(p_hotel_id uuid,p_expected_version integer,p_rooms jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid; v_d private.hotel_room_setup%ROWTYPE;
BEGIN
  PERFORM private.lock_live_role_actor('owner');
  v_tenant := private.room_setup_owner(p_hotel_id);
  PERFORM 1 FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  PERFORM 1 FROM public.hotels WHERE id=p_hotel_id FOR UPDATE;
  IF jsonb_typeof(p_rooms) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Danh sách phòng không hợp lệ.' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_rooms) NOT BETWEEN 1 AND 200 OR pg_column_size(p_rooms)>150000 THEN
    RAISE EXCEPTION 'Mỗi lần thiết lập từ 1 đến 200 phòng.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rooms) r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object'
    OR jsonb_typeof(r->'room_number') IS DISTINCT FROM 'string' OR length(btrim(r->>'room_number')) NOT BETWEEN 1 AND 20
    OR r->>'room_number'<>btrim(r->>'room_number') OR r->>'room_number' ~ '[[:cntrl:]]'
    OR COALESCE(r->>'floor','') !~ '^[1-9][0-9]{0,2}$'
    OR COALESCE(r->>'room_type','') NOT IN ('standard','deluxe','suite','vip')
    OR COALESCE(r->>'max_guests','') !~ '^([1-9]|1[0-9]|20)$'
    OR COALESCE(r->>'base_price','') !~ '^[0-9]{1,9}$'
    OR COALESCE(r->>'hourly_price','') !~ '^[0-9]{1,9}$'
    OR COALESCE(r->>'monthly_price','') !~ '^[0-9]{1,9}$') THEN
    RAISE EXCEPTION 'Kiểm tra số phòng, tầng, loại phòng, sức chứa và giá nguyên từ 0 đến 999.999.999.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rooms)) <> (SELECT count(DISTINCT lower(r->>'room_number')) FROM jsonb_array_elements(p_rooms) r) THEN
    RAISE EXCEPTION 'Danh sách có số phòng trùng nhau.' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rooms) r GROUP BY r->>'room_type'
    HAVING count(DISTINCT (r->>'base_price')::numeric)>1 OR count(DISTINCT (r->>'hourly_price')::numeric)>1 OR count(DISTINCT (r->>'monthly_price')::numeric)>1) THEN
    RAISE EXCEPTION 'Các phòng cùng loại cần dùng chung một bảng giá.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_d FROM private.hotel_room_setup WHERE hotel_id=p_hotel_id FOR UPDATE;
  IF v_d.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Đã hoàn tất thiết lập. Hãy quản lý phòng ở danh sách phòng.' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT 1 FROM public.rooms WHERE hotel_id=p_hotel_id) THEN
    RAISE EXCEPTION 'Khách sạn đã có phòng. Hãy thêm hoặc chỉnh sửa tại danh sách phòng.' USING ERRCODE='55000';
  END IF;
  -- A response-lost retry of the exact draft is safe, even with the old version.
  IF v_d.rooms=p_rooms THEN RETURN public.get_hotel_room_setup(p_hotel_id); END IF;
  IF p_expected_version IS DISTINCT FROM COALESCE(v_d.version,0) THEN
    RAISE EXCEPTION 'Bản nháp đã được sửa ở nơi khác. Tải lại trước khi lưu.' USING ERRCODE='40001';
  END IF;
  INSERT INTO private.hotel_room_setup(hotel_id,tenant_id,version,rooms)
    VALUES(p_hotel_id,v_tenant,1,p_rooms)
    ON CONFLICT(hotel_id) DO UPDATE SET version=private.hotel_room_setup.version+1,rooms=excluded.rooms,
      request_id=gen_random_uuid(),updated_at=now();
  RETURN public.get_hotel_room_setup(p_hotel_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_hotel_room_setup(p_hotel_id uuid,p_request_id uuid,p_version integer,p_confirm_prices boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid; v_d private.hotel_room_setup%ROWTYPE; v_r record; v_rt public.room_types%ROWTYPE;
BEGIN
  PERFORM private.lock_live_role_actor('owner');
  v_tenant := private.room_setup_owner(p_hotel_id);
  PERFORM 1 FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  PERFORM 1 FROM public.hotels WHERE id=p_hotel_id FOR UPDATE;
  SELECT * INTO v_d FROM private.hotel_room_setup WHERE hotel_id=p_hotel_id FOR UPDATE;
  IF NOT FOUND OR p_request_id IS DISTINCT FROM v_d.request_id OR p_version IS DISTINCT FROM v_d.version THEN
    RAISE EXCEPTION 'Bản xem trước đã thay đổi. Tải lại trước khi xác nhận.' USING ERRCODE='40001';
  END IF;
  IF v_d.completed_at IS NOT NULL THEN RETURN public.get_hotel_room_setup(p_hotel_id)||jsonb_build_object('idempotent',true); END IF;
  IF p_confirm_prices IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cần xác nhận danh sách phòng và bảng giá.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.rooms WHERE hotel_id=p_hotel_id) THEN
    RAISE EXCEPTION 'Khách sạn đã có phòng. Không thể ghi đè từ thiết lập ban đầu.' USING ERRCODE='55000';
  END IF;
  -- Existing legacy type codes are unique across the tenant. Never overwrite
  -- another hotel's live rates while this schema is still shared by type code.
  FOR v_r IN SELECT DISTINCT r->>'room_type' AS kind,(r->>'base_price')::numeric AS nightly,
      (r->>'hourly_price')::numeric AS hourly,(r->>'monthly_price')::numeric AS monthly
      FROM jsonb_array_elements(v_d.rooms) r ORDER BY kind LOOP
    IF EXISTS(SELECT 1 FROM public.rooms WHERE tenant_id=v_tenant AND hotel_id<>p_hotel_id AND room_type=v_r.kind) THEN
      RAISE EXCEPTION 'Loại phòng % đang dùng tại khách sạn khác. Hãy cấu hình phòng và bảng giá qua các màn hình quản lý hiện có.',v_r.kind USING ERRCODE='55000';
    END IF;
    SELECT * INTO v_rt FROM public.room_types WHERE tenant_id=v_tenant AND code=public.room_type_pricing_code(v_r.kind) FOR UPDATE;
    IF FOUND AND (v_rt.status<>'active' OR (v_rt.hotel_id IS NOT NULL AND v_rt.hotel_id<>p_hotel_id)) THEN
      RAISE EXCEPTION 'Loại phòng % thuộc khách sạn khác hoặc đã ngừng sử dụng.',v_r.kind USING ERRCODE='55000';
    END IF;
    INSERT INTO public.room_types(tenant_id,hotel_id,name,code,base_price,status)
      VALUES(v_tenant,p_hotel_id,'Phòng '||initcap(v_r.kind),public.room_type_pricing_code(v_r.kind),v_r.nightly,'active')
      ON CONFLICT(tenant_id,code) DO UPDATE SET base_price=excluded.base_price,hotel_id=excluded.hotel_id
      RETURNING * INTO v_rt;
    INSERT INTO public.room_type_rates(tenant_id,hotel_id,room_type_id,daily_rate,hourly_rate,monthly_rate)
      VALUES(v_tenant,p_hotel_id,v_rt.id,v_r.nightly,v_r.hourly,v_r.monthly)
      ON CONFLICT(room_type_id) DO UPDATE SET daily_rate=excluded.daily_rate,hourly_rate=excluded.hourly_rate,
        monthly_rate=excluded.monthly_rate,hotel_id=excluded.hotel_id,updated_at=now();
  END LOOP;
  INSERT INTO public.rooms(tenant_id,hotel_id,room_number,floor,room_type,max_guests,base_price,hourly_price,monthly_price,status)
    SELECT v_tenant,p_hotel_id,r->>'room_number',(r->>'floor')::integer,r->>'room_type',(r->>'max_guests')::integer,
      (r->>'base_price')::numeric,(r->>'hourly_price')::numeric,(r->>'monthly_price')::numeric,'vacant_clean'
    FROM jsonb_array_elements(v_d.rooms) r;
  UPDATE private.hotel_room_setup SET completed_at=now(),confirmed_by=auth.uid(),updated_at=now() WHERE hotel_id=p_hotel_id;
  PERFORM public.update_tenant_usage(v_tenant);
  RETURN public.get_hotel_room_setup(p_hotel_id)||jsonb_build_object('idempotent',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_subscription_quote(
  p_request_id uuid, p_kind text, p_rooms integer, p_duration_days integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_tenant_id uuid;
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
  PERFORM private.lock_live_role_actor('owner');
  v_tenant_id := private.subscription_quote_actor();
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
  PERFORM private.lock_live_role_actor('super_admin');
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

CREATE OR REPLACE FUNCTION public.admin_mutate_subscription_reconciliation_case(
  p_payment_id uuid, p_request_id uuid, p_action text, p_note text,
  p_expected_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid;
  v_args jsonb;
  v_receipt private.subscription_reconciliation_case_receipts%ROWTYPE;
  v_case private.subscription_reconciliation_cases%ROWTYPE;
  v_payment public.payment_transactions%ROWTYPE;
  v_snapshot jsonb;
  v_before jsonb;
  v_created boolean := false;
  v_result jsonb;
BEGIN
  PERFORM private.lock_live_role_actor('super_admin');
  v_actor := private.require_reconciliation_case_actor();
  IF p_payment_id IS NULL OR p_request_id IS NULL OR p_action IS NULL
    OR p_action NOT IN ('create','note') OR p_note IS NULL
    OR char_length(btrim(p_note)) NOT BETWEEN 1 AND 2000
    OR (p_action='create' AND p_expected_version IS NOT NULL)
    OR (p_action='note' AND (p_expected_version IS NULL OR p_expected_version<1)) THEN
    RAISE EXCEPTION 'INVALID_CASE_COMMAND' USING ERRCODE='22023';
  END IF;
  v_args := jsonb_build_object('payment_id',p_payment_id,'action',p_action,
    'note',btrim(p_note),'expected_version',p_expected_version);
  -- Lock receipt first, then case: a fixed order and transaction-scoped locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('reconciliation-case-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_receipt FROM private.subscription_reconciliation_case_receipts
    WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.arguments IS DISTINCT FROM v_args THEN
      RAISE EXCEPTION 'CASE_REQUEST_ID_REUSED' USING ERRCODE='PT409';
    END IF;
    RETURN v_receipt.result;
  END IF;
  IF p_action='create' THEN
    -- Never accept tenant, invoice, amount, status or provider payload from client.
    SELECT * INTO v_payment FROM public.payment_transactions WHERE id=p_payment_id FOR SHARE;
    IF NOT FOUND OR v_payment.tenant_id IS NULL THEN
      RAISE EXCEPTION 'CASE_SOURCE_NOT_FOUND' USING ERRCODE='PT404';
    END IF;
    SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
      IF v_payment.payment_status NOT IN ('pending','completed') THEN
        RAISE EXCEPTION 'CASE_SOURCE_NOT_ELIGIBLE' USING ERRCODE='PT409';
      END IF;
      SELECT jsonb_build_object('captured_at',now(),'payment_status',v_payment.payment_status,
        'amount',v_payment.amount,'currency',v_payment.currency,
        'invoice_status',CASE WHEN i.tenant_id=v_payment.tenant_id THEN i.status END,
        'invoice_same_tenant',COALESCE(i.tenant_id=v_payment.tenant_id,false))
        INTO v_snapshot FROM (SELECT 1) seed LEFT JOIN public.invoices i ON i.id=v_payment.invoice_id;
      INSERT INTO private.subscription_reconciliation_cases(payment_id,tenant_id,invoice_id,source_snapshot,created_by)
        VALUES(p_payment_id,v_payment.tenant_id,
          CASE WHEN (v_snapshot->>'invoice_same_tenant')::boolean THEN v_payment.invoice_id END,
          v_snapshot,v_actor)
        ON CONFLICT(payment_id) DO NOTHING RETURNING * INTO v_case;
      v_created := FOUND;
      IF NOT v_created THEN
        SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id FOR UPDATE;
      END IF;
    END IF;
    IF v_case.tenant_id<>v_payment.tenant_id THEN
      RAISE EXCEPTION 'CASE_SOURCE_CHANGED_TENANT' USING ERRCODE='PT409';
    END IF;
  ELSE
    SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CASE_NOT_FOUND' USING ERRCODE='PT404';
    END IF;
    IF EXISTS(SELECT 1 FROM public.payment_transactions p WHERE p.id=p_payment_id AND p.tenant_id<>v_case.tenant_id) THEN
      RAISE EXCEPTION 'CASE_SOURCE_CHANGED_TENANT' USING ERRCODE='PT409';
    END IF;
    IF v_case.version<>p_expected_version THEN
      RAISE EXCEPTION 'CASE_VERSION_CONFLICT' USING ERRCODE='PT409';
    END IF;
    v_before := to_jsonb(v_case);
    UPDATE private.subscription_reconciliation_cases SET version=version+1,updated_at=now()
      WHERE id=v_case.id RETURNING * INTO v_case;
  END IF;
  IF v_created OR p_action='note' THEN
    INSERT INTO private.subscription_reconciliation_case_events
      (case_id,version,actor_id,request_id,action,note,before_state,after_state)
      VALUES(v_case.id,v_case.version,v_actor,p_request_id,p_action,btrim(p_note),v_before,to_jsonb(v_case));
  END IF;
  v_result := jsonb_build_object('case',to_jsonb(v_case),'created',v_created);
  INSERT INTO private.subscription_reconciliation_case_receipts(actor_id,request_id,arguments,result)
    VALUES(v_actor,p_request_id,v_args,v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_recover_subscription_status_run(
  p_run_id uuid,p_request_id uuid,p_expected_deadline_at timestamptz,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET lock_timeout='5s' AS $fn$
DECLARE
  v_actor uuid;
  v_run private.subscription_status_job_runs%ROWTYPE;
  v_receipt private.subscription_status_job_recoveries%ROWTYPE;
  v_before jsonb;
  v_summary jsonb;
  v_progress private.subscription_lifecycle_progress%ROWTYPE;
  v_ids uuid[];
  v_pending integer;
  v_now timestamptz;
BEGIN
  PERFORM private.lock_live_role_actor('super_admin');
  v_actor := private.require_reconciliation_case_actor();
  IF p_run_id IS NULL OR p_request_id IS NULL OR p_expected_deadline_at IS NULL
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_JOB_RECOVERY' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  SELECT * INTO v_receipt FROM private.subscription_status_job_recoveries WHERE request_id=p_request_id;
  IF FOUND THEN
    IF (v_receipt.run_id,v_receipt.actor_id,v_receipt.expected_deadline_at,v_receipt.reason)
      IS DISTINCT FROM (p_run_id,v_actor,p_expected_deadline_at,btrim(p_reason)) THEN
      RAISE EXCEPTION 'JOB_RECOVERY_REPLAY_MISMATCH' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('run_id',p_run_id,'request_id',p_request_id,'released',true,'replayed',true);
  END IF;
  SELECT * INTO v_run FROM private.subscription_status_job_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_RUN_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  v_now := clock_timestamp();
  IF v_run.execution_protocol<>'atomic_v1' OR v_run.status NOT IN ('running','interrupted')
    OR v_run.deadline_at>v_now OR v_run.deadline_at IS DISTINCT FROM p_expected_deadline_at THEN
    RAISE EXCEPTION 'JOB_RECOVERY_NOT_SAFE' USING ERRCODE='PT412';
  END IF;
  PERFORM private.validate_subscription_execution_scope(v_run.execution_scope);
  -- Every atomic worker mutation holds this same admission/run lock and checks
  -- status/deadline. Acquiring it after expiry fences an old in-flight caller;
  -- a resumed caller cannot pass after the status below changes to failed.
  v_before := to_jsonb(v_run);
  IF v_run.summary IS NOT NULL THEN
    v_summary := v_run.summary;
  ELSE
    SELECT * INTO STRICT v_progress FROM private.subscription_lifecycle_progress WHERE run_id=p_run_id;
    IF v_run.execution_scope->>'kind'='tenants' THEN
      SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(v_run.execution_scope->'tenant_ids');
    END IF;
    SELECT count(*) INTO v_pending FROM private.subscription_lifecycle_notification_outbox o
      JOIN private.subscription_lifecycle_commands c ON c.id=o.command_id
      WHERE o.status='pending' AND (v_ids IS NULL OR c.tenant_id=ANY(v_ids));
    SELECT jsonb_build_object('subscription_status','failed','staff_status',
      CASE WHEN v_progress.phase='done' THEN 'success' WHEN v_progress.phase='staff' THEN 'failed' ELSE 'not_run' END,
      'to_grace_period',count(*) FILTER(WHERE c.outcome='applied' AND c.target_status='grace_period'),
      'to_suspended',count(*) FILTER(WHERE c.outcome='applied' AND c.target_status='suspended'),
      'notifications_sent',v_progress.notifications_sent,
      'notifications_failed',v_pending,
      'transition_outcome_unknown',true,'recovery_required',true,'error_codes',
      CASE WHEN v_progress.phase='staff' THEN jsonb_build_array('JOB_EXECUTION_FAILED','STAFF_PRESENCE_FAILED') ELSE jsonb_build_array('JOB_EXECUTION_FAILED') END)
      INTO v_summary FROM private.subscription_lifecycle_commands c WHERE c.run_id=p_run_id;
  END IF;
  PERFORM private.validate_subscription_job_summary(v_summary);
  UPDATE private.subscription_status_job_runs SET status='failed',finished_at=COALESCE(finished_at,v_now),summary=v_summary
    WHERE id=p_run_id RETURNING * INTO v_run;
  INSERT INTO private.subscription_status_job_recoveries(request_id,run_id,actor_id,reason,expected_deadline_at,before_state,after_state,recovered_at)
    VALUES(p_request_id,p_run_id,v_actor,btrim(p_reason),p_expected_deadline_at,v_before,to_jsonb(v_run),v_now);
  -- No tenant/payment change, no replay, no scheduler invocation. Pending outbox
  -- survives and can be handled by the next explicitly admitted worker.
  RETURN jsonb_build_object('run_id',p_run_id,'request_id',p_request_id,'released',true,'replayed',false);
END;
$fn$;

-- Existing public entry-point grants are retained by CREATE OR REPLACE.
NOTIFY pgrst,'reload schema';
