-- Durable delivery state supplements the existing PGMQ queues and attempt log.
-- Only trusted server code can enqueue, claim, complete or retry messages.
CREATE TABLE public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 250),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  template_name text NOT NULL CHECK (template_name IN ('system_test','workspace_ready')),
  template_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','accepted','delivered','delayed','bounced','complained','failed','expired','suppressed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid,
  lease_until timestamptz,
  provider_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '12 hours',
  accepted_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + interval '12 hours')
);
CREATE INDEX email_deliveries_tenant_created ON public.email_deliveries(tenant_id,created_at DESC);
CREATE UNIQUE INDEX email_deliveries_provider_id ON public.email_deliveries(provider_id) WHERE provider_id IS NOT NULL;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.email_deliveries TO service_role;

-- Global per-cluster worker lease prevents bursts from concurrent scheduler calls.
ALTER TABLE public.email_send_state ADD COLUMN worker_id uuid, ADD COLUMN worker_lease_until timestamptz;
UPDATE public.email_send_state SET send_delay_ms=600 WHERE id=1 AND send_delay_ms<600;

CREATE OR REPLACE FUNCTION public.enqueue_roomqc_email(
  p_event_key text,p_tenant_id uuid,p_recipient text,p_template text,p_data jsonb DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_recipient IS NULL OR p_recipient !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
     OR length(p_recipient)>254 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid email event';
  END IF;
  INSERT INTO public.email_deliveries(event_key,tenant_id,recipient_email,template_name,template_data)
    VALUES(p_event_key,p_tenant_id,lower(trim(p_recipient)),p_template,p_data)
    ON CONFLICT(event_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.email_deliveries WHERE event_key=p_event_key;
    RETURN v_id;
  END IF;
  PERFORM pgmq.send('transactional_emails',jsonb_build_object('delivery_id',v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_email_worker(p_worker uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.email_send_state SET worker_id=p_worker,worker_lease_until=now()+interval '110 seconds'
    WHERE id=1 AND (worker_lease_until IS NULL OR worker_lease_until<now())
      AND (retry_after_until IS NULL OR retry_after_until<=now());
  RETURN FOUND;
END;
$$;
CREATE OR REPLACE FUNCTION public.release_email_worker(p_worker uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.email_send_state SET worker_id=NULL,worker_lease_until=NULL WHERE id=1 AND worker_id=p_worker;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_delivery(p_id uuid,p_claim uuid)
RETURNS SETOF public.email_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN QUERY UPDATE public.email_deliveries SET status='processing',claim_id=p_claim,
    lease_until=now()+interval '120 seconds',attempts=attempts+1,updated_at=now()
    WHERE id=p_id AND (status='queued' OR (status='processing' AND lease_until<now()))
      AND next_attempt_at<=now() RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_email_delivery(
  p_id uuid,p_claim uuid,p_queue_id bigint,p_status text,p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL,p_retry_seconds integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.email_deliveries%ROWTYPE; v_event record;
BEGIN
  IF p_status NOT IN ('accepted','queued','failed','expired','suppressed') THEN RAISE EXCEPTION 'Invalid delivery result'; END IF;
  SELECT * INTO v_row FROM public.email_deliveries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_row.claim_id IS DISTINCT FROM p_claim OR v_row.status<>'processing' THEN RETURN false; END IF;
  UPDATE public.email_deliveries SET status=p_status,provider_id=COALESCE(p_provider_id,provider_id),
    error_code=p_error,claim_id=NULL,lease_until=NULL,updated_at=now(),
    accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE accepted_at END,
    next_attempt_at=now()+make_interval(secs=>greatest(1,least(p_retry_seconds,3600))) WHERE id=p_id;
  INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,error_message,metadata)
    VALUES(p_id::text,v_row.template_name,v_row.recipient_email,
      CASE WHEN p_status='accepted' THEN 'sent' WHEN p_status='suppressed' THEN 'suppressed' WHEN p_status='queued' THEN 'failed' ELSE 'dlq' END,
      p_error,jsonb_build_object('delivery_id',p_id,'attempt',v_row.attempts,'result',p_status));
  IF p_status='queued' THEN
    PERFORM pgmq.set_vt('transactional_emails',p_queue_id,greatest(1,least(p_retry_seconds,3600)));
  ELSE
    PERFORM pgmq.delete('transactional_emails',p_queue_id);
  END IF;
  IF p_status='accepted' THEN
    FOR v_event IN SELECT * FROM public.email_provider_events WHERE provider_id=p_provider_id ORDER BY created_at LOOP
      PERFORM public.record_email_provider_event(v_event.event_id,v_event.provider_id,v_event.event_type);
    END LOOP;
  END IF;
  RETURN true;
END;
$$;

CREATE TABLE public.email_provider_events (
  event_id text PRIMARY KEY,
  provider_id text NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_provider_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.email_provider_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_provider_event(p_event_id text,p_provider_id text,p_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.email_deliveries%ROWTYPE; v_status text;
BEGIN
  IF p_type NOT IN ('email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed') THEN RETURN false; END IF;
  -- SMTP Auth messages share the provider but have no transactional delivery row.
  -- Also retain events that arrive before the worker commits provider_id.
  INSERT INTO public.email_provider_events(event_id,provider_id,event_type) VALUES(p_event_id,p_provider_id,p_type) ON CONFLICT DO NOTHING;
  SELECT * INTO v_row FROM public.email_deliveries WHERE provider_id=p_provider_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;
  v_status := CASE p_type WHEN 'email.delivered' THEN 'delivered' WHEN 'email.delivery_delayed' THEN 'delayed'
    WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained' WHEN 'email.suppressed' THEN 'suppressed' ELSE 'failed' END;
  -- Terminal negative events dominate delivery, which dominates delay.
  IF v_row.status IN ('bounced','complained','suppressed','failed') AND v_status NOT IN ('bounced','complained','suppressed') THEN RETURN true; END IF;
  IF v_row.status='complained' AND v_status<>'complained' THEN RETURN true; END IF;
  IF v_row.status='delivered' AND v_status='delayed' THEN RETURN true; END IF;
  UPDATE public.email_deliveries SET status=v_status,updated_at=now(),
    delivered_at=CASE WHEN v_status='delivered' THEN COALESCE(delivered_at,now()) ELSE delivered_at END WHERE id=v_row.id;
  IF v_status IN ('bounced','complained') THEN
    INSERT INTO public.suppressed_emails(email,reason) VALUES(v_row.recipient_email,CASE WHEN v_status='bounced' THEN 'bounce' ELSE 'complaint' END)
      ON CONFLICT(email) DO UPDATE SET reason=EXCLUDED.reason;
  END IF;
  RETURN true;
END;
$$;

-- A pending invitation grants no application membership or permission.
CREATE TABLE public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  user_level_code text NOT NULL CHECK(user_level_code IN ('manager','department_manager','staff')),
  position_id uuid NOT NULL REFERENCES public.positions(id),
  reports_to uuid REFERENCES public.users(id),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  auth_user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  sent_at timestamptz,
  password_set_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_invitations_pending_email ON public.staff_invitations(lower(email)) WHERE status='pending';
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_invitations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_invitations TO authenticated;
GRANT ALL ON public.staff_invitations TO service_role;
CREATE POLICY staff_invitation_read ON public.staff_invitations FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid()) AND u.tenant_id=staff_invitations.tenant_id
    AND u.status='active' AND NOT COALESCE(u.account_locked,false) AND
    (u.user_level_code='tenant_owner' OR (u.id=staff_invitations.invited_by AND u.hotel_id=staff_invitations.hotel_id)))
);

CREATE OR REPLACE FUNCTION public.validate_staff_inviter(p_creator uuid,p_tenant uuid,p_hotel uuid,p_level text,p_position uuid,p_reports uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_creator public.users%ROWTYPE; v_department text; v_position_level text;
BEGIN
  SELECT * INTO v_creator FROM public.users WHERE id=p_creator AND tenant_id=p_tenant AND status='active'
    AND NOT COALESCE(account_locked,false) AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_create_user(p_creator,p_level,p_tenant) OR p_level NOT IN ('manager','department_manager','staff') THEN
    RAISE EXCEPTION 'Bạn không có quyền mời nhân viên với cấp bậc này'; END IF;
  PERFORM 1 FROM public.hotels WHERE id=p_hotel AND tenant_id=p_tenant AND status='active';
  IF NOT FOUND OR (v_creator.user_level_code<>'tenant_owner' AND v_creator.hotel_id IS DISTINCT FROM p_hotel) THEN
    RAISE EXCEPTION 'Khách sạn không thuộc phạm vi quản lý'; END IF;
  SELECT department,user_level_code INTO v_department,v_position_level FROM public.positions WHERE id=p_position AND tenant_id=p_tenant;
  IF NOT FOUND OR (p_level='staff' AND v_position_level<>'staff') OR (p_level<>'staff' AND v_position_level<>'manager') THEN
    RAISE EXCEPTION 'Vị trí không phù hợp với cấp bậc'; END IF;
  IF v_creator.user_level_code='department_manager' AND v_creator.department IS DISTINCT FROM v_department THEN
    RAISE EXCEPTION 'Không thể mời nhân viên ngoài bộ phận'; END IF;
  IF p_reports IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_reports AND tenant_id=p_tenant AND hotel_id=p_hotel
    AND user_level_code IN ('manager','department_manager') AND status='active' AND NOT COALESCE(account_locked,false)) THEN
    RAISE EXCEPTION 'Người quản lý không hợp lệ'; END IF;
  RETURN v_department;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_staff_invitation(p_creator uuid,p_tenant uuid,p_hotel uuid,p_email text,
  p_name text,p_level text,p_position uuid,p_reports uuid DEFAULT NULL)
RETURNS public.staff_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.staff_invitations%ROWTYPE;
BEGIN
  PERFORM public.validate_staff_inviter(p_creator,p_tenant,p_hotel,p_level,p_position,p_reports);
  IF (SELECT count(*) FROM public.staff_invitations WHERE invited_by=p_creator AND created_at>now()-interval '1 minute')>=10 THEN
    RAISE EXCEPTION 'Bạn đã gửi nhiều lời mời. Vui lòng chờ một phút'; END IF;
  IF p_email IS NULL OR p_email !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' OR length(p_email)>254
    OR length(trim(p_name)) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Email hoặc họ tên không hợp lệ'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)),16072409));
  IF EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(trim(p_email))) THEN RAISE EXCEPTION 'Email đã có tài khoản. Không thể thay đổi khách sạn hoặc quyền qua lời mời'; END IF;
  SELECT * INTO v_row FROM public.staff_invitations WHERE lower(email)=lower(trim(p_email)) AND status='pending' FOR UPDATE;
  IF FOUND THEN
    IF v_row.tenant_id<>p_tenant OR v_row.hotel_id<>p_hotel OR v_row.user_level_code<>p_level OR v_row.position_id<>p_position
      OR v_row.reports_to IS DISTINCT FROM p_reports OR v_row.full_name<>trim(p_name) THEN
      RAISE EXCEPTION 'Email đang có lời mời khác. Hãy thu hồi lời mời trước khi thay đổi'; END IF;
    RETURN v_row;
  END IF;
  INSERT INTO public.staff_invitations(tenant_id,hotel_id,email,full_name,user_level_code,position_id,reports_to,invited_by)
    VALUES(p_tenant,p_hotel,lower(trim(p_email)),trim(p_name),p_level,p_position,p_reports,p_creator) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_invitation uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.staff_invitations%ROWTYPE; v_auth auth.users%ROWTYPE; v_department text; v_role text;
BEGIN
  SELECT * INTO v_row FROM public.staff_invitations WHERE id=p_invitation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lời mời không hợp lệ'; END IF;
  SELECT * INTO v_auth FROM auth.users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR lower(v_auth.email)<>v_row.email
    OR v_row.auth_user_id IS DISTINCT FROM p_user OR COALESCE(v_auth.encrypted_password,'')='' OR v_row.password_set_at IS NULL THEN
    RAISE EXCEPTION 'Hãy xác minh lời mời và đặt mật khẩu trước'; END IF;
  IF v_row.status='accepted' THEN RETURN jsonb_build_object('success',true,'idempotent',true); END IF;
  IF v_row.status<>'pending' OR v_row.expires_at<=now() THEN RAISE EXCEPTION 'Lời mời đã hết hạn hoặc bị thu hồi'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=v_row.tenant_id FOR UPDATE;
  PERFORM public.update_tenant_usage(v_row.tenant_id);
  v_department:=public.validate_staff_inviter(v_row.invited_by,v_row.tenant_id,v_row.hotel_id,v_row.user_level_code,v_row.position_id,v_row.reports_to);
  IF EXISTS(SELECT 1 FROM public.users WHERE id=p_user OR lower(email)=v_row.email) THEN RAISE EXCEPTION 'Tài khoản đã được thiết lập'; END IF;
  v_role:=CASE v_row.user_level_code WHEN 'manager' THEN 'hotel_manager' WHEN 'department_manager' THEN 'department_manager' ELSE 'staff' END;
  -- The service-only RPC creates profile, roles, assignment, audit and receipt in one transaction.
  INSERT INTO public.users(id,tenant_id,hotel_id,full_name,email,role,user_level_code,department,status,
    created_by,reports_to,position_id,must_change_password,is_super_admin,is_primary_owner,account_locked)
    VALUES(p_user,v_row.tenant_id,v_row.hotel_id,v_row.full_name,v_row.email,v_role,v_row.user_level_code,v_department,'active',
      v_row.invited_by,v_row.reports_to,v_row.position_id,false,false,false,false);
  INSERT INTO public.user_roles(user_id,role,created_by) VALUES(p_user,v_role::public.app_role,v_row.invited_by);
  INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by,can_create_managers,can_create_staff,can_view_reports,can_export_data,can_approve_requests)
    VALUES(p_user,v_row.hotel_id,v_row.invited_by,v_row.user_level_code='manager',v_row.user_level_code IN ('manager','department_manager'),
      v_row.user_level_code IN ('manager','department_manager'),v_row.user_level_code IN ('manager','department_manager'),v_row.user_level_code IN ('manager','department_manager'));
  UPDATE public.staff_invitations SET status='accepted',accepted_at=now() WHERE id=p_invitation;
  PERFORM public.update_tenant_usage(v_row.tenant_id);
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description)
    VALUES(v_row.tenant_id,p_user,v_row.full_name,'user',p_user,v_row.full_name,'create','Chấp nhận lời mời nhân viên');
  RETURN jsonb_build_object('success',true,'tenant_id',v_row.tenant_id,'hotel_id',v_row.hotel_id);
END;
$$;

-- Functions are explicit service-only APIs; no caller-supplied creator UUID from a browser.
REVOKE ALL ON FUNCTION public.enqueue_roomqc_email(text,uuid,text,text,jsonb),public.acquire_email_worker(uuid),
  public.release_email_worker(uuid),public.claim_email_delivery(uuid,uuid),
  public.finish_email_delivery(uuid,uuid,bigint,text,text,text,integer),public.record_email_provider_event(text,text,text),
  public.validate_staff_inviter(uuid,uuid,uuid,text,uuid,uuid),public.prepare_staff_invitation(uuid,uuid,uuid,text,text,text,uuid,uuid),
  public.accept_staff_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_roomqc_email(text,uuid,text,text,jsonb),public.acquire_email_worker(uuid),
  public.release_email_worker(uuid),public.claim_email_delivery(uuid,uuid),
  public.finish_email_delivery(uuid,uuid,bigint,text,text,text,integer),public.record_email_provider_event(text,text,text),
  public.validate_staff_inviter(uuid,uuid,uuid,text,uuid,uuid),public.prepare_staff_invitation(uuid,uuid,uuid,text,text,text,uuid,uuid),
  public.accept_staff_invitation(uuid,uuid) TO service_role;

-- Preserve old configuration for server-side migration, but deny all browser access/writes.
CREATE POLICY smtp_config_server_only ON public.platform_settings AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (key<>'smtp_config') WITH CHECK (key<>'smtp_config');

CREATE OR REPLACE FUNCTION private.queue_owner_workspace_ready() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_hotel text; v_slug text; v_path text;
BEGIN
  IF NEW.user_level_code<>'tenant_owner' OR NEW.status<>'active' OR NEW.tenant_id IS NULL OR NEW.hotel_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.id AND email_confirmed_at IS NOT NULL AND lower(email)=lower(NEW.email)) THEN RETURN NEW; END IF;
  SELECT name INTO v_hotel FROM public.hotels WHERE id=NEW.hotel_id AND tenant_id=NEW.tenant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_slug:=current_setting('roomqc.email_workspace_slug',true);
  v_path:=CASE WHEN COALESCE(v_slug,'') ~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN '/app/'||v_slug||'/auth/login' ELSE '/auth/login' END;
  PERFORM public.enqueue_roomqc_email('workspace-ready:'||NEW.tenant_id::text,NEW.tenant_id,NEW.email,'workspace_ready',
    jsonb_build_object('name',NEW.full_name,'hotel_name',v_hotel,'path',v_path));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.queue_owner_workspace_ready() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_owner_workspace_ready AFTER INSERT OR UPDATE OF tenant_id,hotel_id,status ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.queue_owner_workspace_ready();

-- Auth may initialize an invited identity with an unknown random password.
-- Observe a real password update after email verification instead of testing for a hash.
CREATE OR REPLACE FUNCTION private.record_invitation_password_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.staff_invitations SET password_set_at=now() WHERE auth_user_id=NEW.id AND email=lower(NEW.email)
      AND status='pending' AND expires_at>now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_invitation_password_setup() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_invitation_password_setup AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.record_invitation_password_setup();

CREATE OR REPLACE FUNCTION public.provision_workspace_registration(
  p_workspace_id uuid, p_owner_id uuid, p_fields jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_email text;
  v_confirmed timestamptz;
  v_receipt private.workspace_provisioning%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_workspace_id IS NULL OR p_owner_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Missing workspace or owner');
  END IF;
  SELECT email,email_confirmed_at INTO v_email,v_confirmed FROM auth.users WHERE id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR v_confirmed IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Verified owner required');
  END IF;
  -- Lock the workspace as well as user; service mistakes cannot race different
  -- owners into the same workspace. A hash collision only serializes requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,727002));
  SELECT * INTO v_receipt FROM private.workspace_provisioning WHERE workspace_id=p_workspace_id;
  IF FOUND THEN
    IF v_receipt.owner_id <> p_owner_id THEN
      RETURN pg_catalog.jsonb_build_object('success',false,'error','Workspace belongs to another owner');
    END IF;
    RETURN pg_catalog.jsonb_build_object('success',true,'tenant_id',v_receipt.tenant_id,
      'hotel_id',v_receipt.hotel_id,'owner_id',p_owner_id,'idempotent',true);
  END IF;
  IF EXISTS(SELECT 1 FROM private.workspace_provisioning WHERE owner_id=p_owner_id)
    OR EXISTS(SELECT 1 FROM public.users WHERE id=p_owner_id AND tenant_id IS NOT NULL
      AND COALESCE(status,'') NOT IN ('pending_setup','')) THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Account is already provisioned');
  END IF;
  IF pg_catalog.jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR COALESCE(p_fields->>'totalRooms','') !~ '^[1-9][0-9]{0,4}$'
    OR (p_fields->>'totalRooms')::integer > 10000 THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Invalid setup fields');
  END IF;
  -- Legacy implementation reads the singular claim GUC. Modern PostgREST
  -- supplies JSON claims instead. Only this service-only entry point bridges
  -- that compatibility value, inside the current transaction.
  PERFORM pg_catalog.set_config('request.jwt.claim.role','service_role',true);
  -- Set only from the trusted directory service; browser paths never determine email destinations.
  PERFORM pg_catalog.set_config('roomqc.email_workspace_slug',COALESCE(p_fields->>'workspaceSlug',''),true);
  v_result := public.complete_registration(p_owner_id,p_fields->>'fullName',p_fields->>'phone',
    p_fields->>'tenantName',v_email,p_fields->>'hotelName',p_fields->>'hotelAddress',
    p_fields->>'hotelPhone',p_fields->>'hotelEmail',(p_fields->>'totalRooms')::integer);
  IF NOT COALESCE((v_result->>'success')::boolean,false) THEN RETURN v_result; END IF;
  INSERT INTO private.workspace_provisioning(workspace_id,owner_id,tenant_id,hotel_id)
    VALUES(p_workspace_id,p_owner_id,(v_result->>'tenant_id')::uuid,(v_result->>'hotel_id')::uuid);
  RETURN v_result || pg_catalog.jsonb_build_object('owner_id',p_owner_id);
EXCEPTION WHEN OTHERS THEN
  -- Rolls back the receipt and business provisioning together.
  RETURN pg_catalog.jsonb_build_object('success',false,'error','Workspace provisioning failed','detail',SQLSTATE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) TO service_role;

-- Invited identities must not bypass membership acceptance by onboarding as a new owner.
CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,p_full_name text,p_phone text,p_tenant_name text,p_email text,p_hotel_name text,
  p_hotel_address text,p_hotel_phone text,p_hotel_email text,p_total_rooms integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_service boolean:=COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.jwt()->>'role','')='service_role';
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS DISTINCT FROM p_user_id AND NOT v_service) THEN
    RETURN jsonb_build_object('success',false,'error','Unauthorized'); END IF;
  IF NOT v_service AND EXISTS(SELECT 1 FROM private.roomqc_cluster_config WHERE directory_required) THEN
    RETURN jsonb_build_object('success',false,'error','Registration requires the RoomQC directory'); END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  IF EXISTS(SELECT 1 FROM public.staff_invitations WHERE auth_user_id=p_user_id AND status<>'accepted') THEN
    RETURN jsonb_build_object('success',false,'error','Hãy hoàn tất lời mời nhân viên; tài khoản được mời không thể tự tạo doanh nghiệp'); END IF;
  PERFORM set_config('roomqc.registration_provisioning','true',true);
  PERFORM set_config('roomqc.registration_user_id',p_user_id::text,true);
  RETURN public.complete_registration_impl(p_user_id,p_full_name,p_phone,p_tenant_name,p_email,
    p_hotel_name,p_hotel_address,p_hotel_phone,p_hotel_email,p_total_rooms);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer) TO authenticated,service_role;

