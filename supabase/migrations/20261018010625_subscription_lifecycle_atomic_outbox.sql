-- Private foundation only. No worker cutover, public RPC, schedule or policy change.
-- A command always names one tenant; no NULL/empty-scope fallback to a sweep.
CREATE TABLE private.subscription_lifecycle_commands (
  id uuid PRIMARY KEY,
  ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  run_id uuid NOT NULL REFERENCES private.subscription_status_job_runs(id),
  tenant_id uuid NOT NULL,
  target_status text NOT NULL CHECK(target_status IN ('grace_period','suspended')),
  outcome text NOT NULL CHECK(outcome IN ('applied','not_eligible')),
  previous_status text,
  subscription_end_date date,
  grace_period_ends_at timestamptz,
  effective_at timestamptz NOT NULL,
  evaluated_at timestamptz NOT NULL,
  UNIQUE(run_id,tenant_id,target_status)
);
-- Tenant IDs are audit references, deliberately not cascading foreign keys.
-- Deleting a tenant must neither erase the transition record nor block cleanup.
CREATE INDEX subscription_lifecycle_commands_tenant
  ON private.subscription_lifecycle_commands(tenant_id,evaluated_at DESC,id DESC);
ALTER TABLE private.subscription_lifecycle_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_lifecycle_commands FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.subscription_lifecycle_commands_ordinal_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.subscription_lifecycle_notification_outbox (
  command_id uuid PRIMARY KEY REFERENCES private.subscription_lifecycle_commands(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','obsolete')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error_code text CHECK(last_error_code IN ('OWNER_UNAVAILABLE','DELIVERY_FAILED')),
  notification_id uuid,
  delivered_at timestamptz,
  obsolete_at timestamptz,
  CHECK((status='pending' AND notification_id IS NULL AND delivered_at IS NULL AND obsolete_at IS NULL)
    OR (status='delivered' AND notification_id IS NOT NULL AND notification_id=command_id AND delivered_at IS NOT NULL
      AND obsolete_at IS NULL AND last_error_code IS NULL)
    OR (status='obsolete' AND notification_id IS NULL AND delivered_at IS NULL
      AND obsolete_at IS NOT NULL AND last_error_code IS NULL))
);
CREATE INDEX subscription_lifecycle_outbox_due
  ON private.subscription_lifecycle_notification_outbox(available_at,command_id) WHERE status='pending';
ALTER TABLE private.subscription_lifecycle_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_lifecycle_notification_outbox FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.apply_subscription_lifecycle_transition(
  p_run_id uuid,p_command_id uuid,p_tenant_id uuid,p_target_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE
  v_run private.subscription_status_job_runs%ROWTYPE;
  v_command private.subscription_lifecycle_commands%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_now timestamptz;
  v_eligible boolean := false;
BEGIN
  IF p_run_id IS NULL OR p_command_id IS NULL OR p_tenant_id IS NULL
    OR p_target_status IS NULL OR p_target_status NOT IN ('grace_period','suspended') THEN
    RAISE EXCEPTION 'INVALID_LIFECYCLE_COMMAND' USING ERRCODE='22023';
  END IF;
  -- Same lock order as begin/finish: admission -> run -> tenant -> command/outbox.
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  SELECT * INTO v_command FROM private.subscription_lifecycle_commands WHERE id=p_command_id;
  IF FOUND THEN
    IF (v_command.run_id,v_command.tenant_id,v_command.target_status)
      IS DISTINCT FROM (p_run_id,p_tenant_id,p_target_status) THEN
      RAISE EXCEPTION 'LIFECYCLE_COMMAND_REPLAY_MISMATCH' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('command_id',v_command.id,'outcome',v_command.outcome,'replayed',true);
  END IF;
  SELECT * INTO v_run FROM private.subscription_status_job_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_RUN_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id=p_tenant_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  -- Time and predicates are evaluated AFTER waiting for a renewal's row lock.
  v_now := clock_timestamp();
  IF v_run.status<>'running' OR v_run.deadline_at<=v_now THEN
    RAISE EXCEPTION 'JOB_RUN_NOT_ACTIVE' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM private.subscription_lifecycle_commands
    WHERE run_id=p_run_id AND tenant_id=p_tenant_id AND target_status=p_target_status) THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMAND_ALREADY_RECORDED' USING ERRCODE='PT409';
  END IF;
  -- REST's legacy end-date filter casts its timestamp input to DATE. Preserve
  -- that boundary: a plan ending today stays valid today, including UTC noon.
  v_eligible := CASE p_target_status
    WHEN 'grace_period' THEN v_tenant.subscription_status IN ('active','trial')
      AND v_tenant.subscription_end_date<v_run.started_at::date
      AND v_tenant.grace_period_ends_at>=v_run.started_at
    ELSE v_tenant.subscription_status='grace_period'
      AND v_tenant.grace_period_ends_at<v_run.started_at END;
  IF COALESCE(v_eligible,false) THEN
    UPDATE public.tenants SET subscription_status=p_target_status,updated_at=v_now WHERE id=p_tenant_id;
  END IF;
  INSERT INTO private.subscription_lifecycle_commands(id,run_id,tenant_id,target_status,outcome,
    previous_status,subscription_end_date,grace_period_ends_at,effective_at,evaluated_at)
    VALUES(p_command_id,p_run_id,p_tenant_id,p_target_status,
      CASE WHEN COALESCE(v_eligible,false) THEN 'applied' ELSE 'not_eligible' END,
      v_tenant.subscription_status,v_tenant.subscription_end_date,v_tenant.grace_period_ends_at,
      v_run.started_at,v_now) RETURNING * INTO v_command;
  IF v_command.outcome='applied' THEN
    INSERT INTO private.subscription_lifecycle_notification_outbox(command_id) VALUES(p_command_id);
  END IF;
  -- No exception swallowing: transition, command and outbox commit or roll back together.
  RETURN jsonb_build_object('command_id',v_command.id,'outcome',v_command.outcome,'replayed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION private.apply_subscription_lifecycle_transition(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.deliver_subscription_lifecycle_notification(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE
  v_command private.subscription_lifecycle_commands%ROWTYPE;
  v_outbox private.subscription_lifecycle_notification_outbox%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_tenant_found boolean;
  v_owners uuid[];
  v_now timestamptz;
  v_error text;
BEGIN
  IF p_command_id IS NULL THEN RAISE EXCEPTION 'COMMAND_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_command FROM private.subscription_lifecycle_commands WHERE id=p_command_id;
  IF NOT FOUND OR v_command.outcome<>'applied' THEN
    RAISE EXCEPTION 'APPLIED_LIFECYCLE_COMMAND_REQUIRED' USING ERRCODE='PT404';
  END IF;
  -- Lock tenant before outbox: renewal cannot pass the recheck while delivery
  -- commits. This function intentionally never locks a job run or a payment.
  SELECT * INTO v_tenant FROM public.tenants WHERE id=v_command.tenant_id FOR NO KEY UPDATE;
  v_tenant_found := FOUND;
  SELECT * INTO v_outbox FROM private.subscription_lifecycle_notification_outbox
    WHERE command_id=p_command_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LIFECYCLE_OUTBOX_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  v_now := clock_timestamp();
  IF v_outbox.status<>'pending' THEN
    RETURN jsonb_build_object('command_id',p_command_id,'status',v_outbox.status,'replayed',true);
  END IF;
  -- Suppress stale expiry messages after renewal/deletion or another transition.
  IF NOT v_tenant_found OR v_tenant.subscription_status IS DISTINCT FROM v_command.target_status
    OR v_tenant.subscription_end_date IS DISTINCT FROM v_command.subscription_end_date
    OR v_tenant.grace_period_ends_at IS DISTINCT FROM v_command.grace_period_ends_at
    OR EXISTS(SELECT 1 FROM private.subscription_lifecycle_commands newer
      WHERE newer.tenant_id=v_command.tenant_id AND newer.outcome='applied' AND newer.ordinal>v_command.ordinal) THEN
    UPDATE private.subscription_lifecycle_notification_outbox SET status='obsolete',
      obsolete_at=v_now,last_error_code=NULL WHERE command_id=p_command_id;
    RETURN jsonb_build_object('command_id',p_command_id,'status','obsolete','replayed',false);
  END IF;
  IF v_outbox.available_at>v_now THEN
    RETURN jsonb_build_object('command_id',p_command_id,'status','deferred','replayed',false);
  END IF;
  SELECT array_agg(id) INTO v_owners FROM (
    SELECT id FROM public.users WHERE tenant_id=v_command.tenant_id
      AND user_level_code='tenant_owner' AND status='active' AND NOT COALESCE(account_locked,false)
    ORDER BY id FOR SHARE
  ) owners;
  IF COALESCE(cardinality(v_owners),0)<>1 THEN
    v_error := 'OWNER_UNAVAILABLE';
  ELSE
    BEGIN
      -- In-app INSERT and outbox acknowledgement share this transaction.
      -- The deterministic ID also protects a lost response/retry after commit.
      INSERT INTO public.in_app_notifications(id,tenant_id,user_id,title,body,type,action_url,icon,metadata)
        VALUES(p_command_id,v_command.tenant_id,v_owners[1],
          CASE WHEN v_command.target_status='grace_period' THEN 'Gói đăng ký đã hết hạn'
            ELSE 'Tài khoản đã bị tạm ngưng' END,
          CASE WHEN v_command.target_status='grace_period'
            THEN 'Gói đăng ký của bạn đã hết hạn. Vui lòng kiểm tra thời hạn gia hạn trong mục Gói sử dụng để tránh bị tạm ngưng.'
            ELSE 'Thời gian gia hạn đã hết. Tài khoản của bạn đã bị tạm ngưng. Vui lòng gia hạn để tiếp tục sử dụng.' END,
          'subscription','/settings/subscription','AlertTriangle',
          jsonb_build_object('lifecycle_command_id',p_command_id)) ON CONFLICT(id) DO NOTHING;
      IF NOT EXISTS(SELECT 1 FROM public.in_app_notifications WHERE id=p_command_id
        AND tenant_id=v_command.tenant_id AND user_id=v_owners[1] AND type='subscription'
        AND action_url='/settings/subscription'
        AND metadata->>'lifecycle_command_id'=p_command_id::text) THEN
        RAISE EXCEPTION 'NOTIFICATION_ID_CONFLICT';
      END IF;
      UPDATE private.subscription_lifecycle_notification_outbox SET status='delivered',
        attempts=attempts+1,notification_id=p_command_id,delivered_at=v_now,last_error_code=NULL
        WHERE command_id=p_command_id;
      RETURN jsonb_build_object('command_id',p_command_id,'status','delivered','replayed',false);
    EXCEPTION WHEN OTHERS THEN
      -- Subtransaction rolls back the INSERT too if acknowledgement fails.
      -- Persist only an allowlisted code, never SQLERRM or a provider payload.
      v_error := 'DELIVERY_FAILED';
    END;
  END IF;
  UPDATE private.subscription_lifecycle_notification_outbox SET attempts=attempts+1,
    available_at=v_now+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7)))::integer),
    last_error_code=v_error WHERE command_id=p_command_id;
  RETURN jsonb_build_object('command_id',p_command_id,'status','pending','error_code',v_error,'replayed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION private.deliver_subscription_lifecycle_notification(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Align monitor with the actual DATE column/legacy REST filter and admin
-- renewal validity. End date equal to today must not count as already expired.
CREATE OR REPLACE FUNCTION public.admin_subscription_job_monitor()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE v_now timestamptz := statement_timestamp(); v_runs jsonb; v_active jsonb; v_failure jsonb;
  v_success timestamptz; v_grace bigint; v_suspend bigint; v_unhandled bigint;
BEGIN
  PERFORM private.require_reconciliation_case_actor();
  WITH recent AS (SELECT * FROM private.subscription_status_job_runs ORDER BY started_at DESC,id DESC LIMIT 25)
  SELECT COALESCE(jsonb_agg(to_jsonb(r)||jsonb_build_object('status',
    CASE WHEN r.status='running' AND r.deadline_at<=v_now THEN 'interrupted' ELSE r.status END)
    ORDER BY r.started_at DESC,r.id DESC),'[]'::jsonb) INTO v_runs FROM recent r;
  SELECT to_jsonb(r)||jsonb_build_object('status',CASE WHEN r.status='running' AND r.deadline_at<=v_now
    THEN 'interrupted' ELSE r.status END) INTO v_active FROM private.subscription_status_job_runs r
    WHERE r.status IN ('running','interrupted');
  SELECT to_jsonb(r)||jsonb_build_object('status',CASE WHEN r.status='running' THEN 'interrupted' ELSE r.status END)
    INTO v_failure FROM private.subscription_status_job_runs r
    WHERE r.status IN ('failed','interrupted') OR (r.status='running' AND r.deadline_at<=v_now)
    ORDER BY r.started_at DESC,r.id DESC LIMIT 1;
  SELECT max(finished_at) INTO v_success FROM private.subscription_status_job_runs WHERE status='success';
  SELECT count(*) FILTER(WHERE subscription_status IN ('active','trial') AND subscription_end_date<v_now::date
      AND grace_period_ends_at>=v_now),
    count(*) FILTER(WHERE subscription_status='grace_period' AND grace_period_ends_at<v_now),
    count(*) FILTER(WHERE subscription_status IN ('active','trial') AND subscription_end_date<v_now::date
      AND (grace_period_ends_at IS NULL OR grace_period_ends_at<v_now))
    INTO v_grace,v_suspend,v_unhandled FROM public.tenants;
  RETURN jsonb_build_object('job','check-subscription-status','scope','cluster','checked_at',v_now,
    'scheduler_status','not_observed','last_success_at',v_success,'active',v_active,
    'latest_failure',v_failure,'runs',v_runs,'backlog',jsonb_build_object('eligible_grace',v_grace,
      'eligible_suspend',v_suspend,'unhandled_expired_active',v_unhandled,'checked_at',v_now,
      'definition','legacy_predicates_only'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_subscription_job_monitor() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_subscription_job_monitor() TO authenticated;
NOTIFY pgrst,'reload schema';
