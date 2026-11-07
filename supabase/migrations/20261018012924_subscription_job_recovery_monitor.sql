-- Recovery releases admission only after the atomic protocol's database fence
-- has expired. Legacy workers have no such proof and remain fail-closed.
CREATE TABLE private.subscription_status_job_recoveries (
  request_id uuid PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE REFERENCES private.subscription_status_job_runs(id),
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 10 AND 1000),
  expected_deadline_at timestamptz NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  recovered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.subscription_status_job_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_status_job_recoveries FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.reject_subscription_job_recovery_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  RAISE EXCEPTION 'JOB_RECOVERY_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END;
$fn$;
REVOKE ALL ON FUNCTION private.reject_subscription_job_recovery_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER job_recovery_history_immutable BEFORE UPDATE OR DELETE
  ON private.subscription_status_job_recoveries FOR EACH ROW EXECUTE FUNCTION private.reject_subscription_job_recovery_mutation();
CREATE TRIGGER job_recovery_history_no_truncate BEFORE TRUNCATE
  ON private.subscription_status_job_recoveries FOR EACH STATEMENT EXECUTE FUNCTION private.reject_subscription_job_recovery_mutation();

CREATE FUNCTION public.admin_recover_subscription_status_run(
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
REVOKE ALL ON FUNCTION public.admin_recover_subscription_status_run(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_recover_subscription_status_run(uuid,uuid,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_subscription_job_monitor()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE v_now timestamptz := statement_timestamp(); v_runs jsonb; v_active jsonb; v_failure jsonb;
  v_success timestamptz; v_grace bigint; v_suspend bigint; v_unhandled bigint; v_outbox jsonb; v_recovery jsonb;
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
  -- A fixture/tenant-only run is never proof of a successful cluster sweep.
  SELECT max(finished_at) INTO v_success FROM private.subscription_status_job_runs
    WHERE status='success' AND execution_protocol='atomic_v1' AND execution_scope->>'kind'='cluster';
  SELECT count(*) FILTER(WHERE subscription_status IN ('active','trial') AND subscription_end_date<v_now::date
      AND grace_period_ends_at>=v_now),
    count(*) FILTER(WHERE subscription_status='grace_period' AND grace_period_ends_at<v_now),
    count(*) FILTER(WHERE subscription_status IN ('active','trial') AND subscription_end_date<v_now::date
      AND (grace_period_ends_at IS NULL OR grace_period_ends_at<v_now))
    INTO v_grace,v_suspend,v_unhandled FROM public.tenants;
  SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status='pending'),
    'due',count(*) FILTER(WHERE status='pending' AND available_at<=v_now),
    'with_error',count(*) FILTER(WHERE status='pending' AND last_error_code IS NOT NULL),
    'delivered',count(*) FILTER(WHERE status='delivered'),'obsolete',count(*) FILTER(WHERE status='obsolete'),
    'oldest_pending_at',min(available_at) FILTER(WHERE status='pending'),'checked_at',v_now)
    INTO v_outbox FROM private.subscription_lifecycle_notification_outbox;
  SELECT jsonb_build_object('run_id',run_id,'actor_id',actor_id,'recovered_at',recovered_at)
    INTO v_recovery FROM private.subscription_status_job_recoveries ORDER BY recovered_at DESC,request_id DESC LIMIT 1;
  RETURN jsonb_build_object('job','check-subscription-status','scope','cluster','checked_at',v_now,
    'scheduler_status','not_observed','last_success_at',v_success,'active',v_active,
    'latest_failure',v_failure,'runs',v_runs,'outbox',v_outbox,'latest_recovery',v_recovery,
    'backlog',jsonb_build_object('eligible_grace',v_grace,'eligible_suspend',v_suspend,
      'unhandled_expired_active',v_unhandled,'checked_at',v_now,'definition','legacy_predicates_only'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_subscription_job_monitor() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_subscription_job_monitor() TO authenticated;
NOTIFY pgrst,'reload schema';
