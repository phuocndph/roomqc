-- Only new atomic admissions may carry the recoverable execution protocol.
ALTER TABLE private.subscription_status_job_runs
  ADD COLUMN execution_protocol text NOT NULL DEFAULT 'legacy' CHECK(execution_protocol IN ('legacy','atomic_v1')),
  ADD COLUMN execution_scope jsonb;

CREATE TABLE private.subscription_lifecycle_progress (
  run_id uuid PRIMARY KEY REFERENCES private.subscription_status_job_runs(id),
  phase text NOT NULL DEFAULT 'grace' CHECK(phase IN ('grace','suspend','delivery','staff','done')),
  cursor_id uuid,
  batch_index integer NOT NULL DEFAULT 0 CHECK(batch_index>=0),
  to_grace_period integer NOT NULL DEFAULT 0,
  to_suspended integer NOT NULL DEFAULT 0,
  notifications_sent integer NOT NULL DEFAULT 0,
  notifications_failed integer NOT NULL DEFAULT 0,
  staff_offlined integer NOT NULL DEFAULT 0
);
CREATE TABLE private.subscription_lifecycle_batch_receipts (
  request_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES private.subscription_status_job_runs(id),
  expected_batch_index integer NOT NULL,
  batch_limit integer NOT NULL CHECK(batch_limit BETWEEN 1 AND 50),
  receipt jsonb NOT NULL,
  UNIQUE(run_id,expected_batch_index)
);
ALTER TABLE private.subscription_lifecycle_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.subscription_lifecycle_batch_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_lifecycle_progress,private.subscription_lifecycle_batch_receipts
  FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX subscription_lifecycle_commands_newer_applied
  ON private.subscription_lifecycle_commands(tenant_id,ordinal DESC) WHERE outcome='applied';
CREATE INDEX subscription_lifecycle_grace_candidates ON public.tenants(id)
  WHERE subscription_status IN ('active','trial');
CREATE INDEX subscription_lifecycle_suspend_candidates ON public.tenants(id)
  WHERE subscription_status='grace_period';

CREATE FUNCTION private.validate_subscription_execution_scope(p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_ids uuid[];
BEGIN
  IF p_scope IS NULL OR jsonb_typeof(p_scope)<>'object' THEN
    RAISE EXCEPTION 'EXPLICIT_JOB_SCOPE_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_scope=jsonb_build_object('kind','cluster') THEN RETURN p_scope; END IF;
  IF p_scope->>'kind' IS DISTINCT FROM 'tenants' OR (SELECT count(*) FROM jsonb_object_keys(p_scope))<>2
    OR jsonb_typeof(p_scope->'tenant_ids') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_scope->'tenant_ids') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_JOB_SCOPE' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_scope->'tenant_ids') e
    WHERE jsonb_typeof(e)<>'string' OR (e#>>'{}')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') THEN
    RAISE EXCEPTION 'INVALID_JOB_SCOPE' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid) INTO v_ids
    FROM jsonb_array_elements_text(p_scope->'tenant_ids');
  IF cardinality(v_ids)<>jsonb_array_length(p_scope->'tenant_ids') THEN
    RAISE EXCEPTION 'DUPLICATE_JOB_SCOPE' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('kind','tenants','tenant_ids',to_jsonb(v_ids));
END;
$fn$;
REVOKE ALL ON FUNCTION private.validate_subscription_execution_scope(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_atomic_subscription_status_run(p_run_id uuid,p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE v_scope jsonb; v_receipt jsonb;
BEGIN
  v_scope:=private.validate_subscription_execution_scope(p_scope);
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  -- Same transaction as creation. An old in-flight run can NEVER be upgraded.
  v_receipt:=public.begin_subscription_status_run(p_run_id);
  IF (v_receipt->>'acquired')::boolean THEN
    UPDATE private.subscription_status_job_runs SET execution_protocol='atomic_v1',execution_scope=v_scope WHERE id=p_run_id;
    INSERT INTO private.subscription_lifecycle_progress(run_id) VALUES(p_run_id);
  ELSE
    IF EXISTS(SELECT 1 FROM private.subscription_status_job_runs WHERE id=p_run_id
      AND execution_protocol='atomic_v1' AND execution_scope IS DISTINCT FROM v_scope) THEN
      RAISE EXCEPTION 'JOB_SCOPE_REPLAY_MISMATCH' USING ERRCODE='PT409';
    END IF;
  END IF;
  RETURN v_receipt||jsonb_build_object('execution_scope',v_scope);
END;
$fn$;
REVOKE ALL ON FUNCTION public.begin_atomic_subscription_status_run(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_atomic_subscription_status_run(uuid,jsonb) TO service_role;

CREATE FUNCTION public.process_subscription_lifecycle_batch(
  p_run_id uuid,p_request_id uuid,p_expected_batch_index integer,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE v_run private.subscription_status_job_runs%ROWTYPE; v_progress private.subscription_lifecycle_progress%ROWTYPE;
  v_old private.subscription_lifecycle_batch_receipts%ROWTYPE; v_ids uuid[]; v_id uuid; v_result jsonb;
  v_receipt jsonb; v_seen integer:=0; v_target text; v_command uuid;
BEGIN
  IF p_run_id IS NULL OR p_request_id IS NULL OR p_expected_batch_index IS NULL OR p_expected_batch_index<0
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'INVALID_LIFECYCLE_BATCH' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  SELECT * INTO v_old FROM private.subscription_lifecycle_batch_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF (v_old.run_id,v_old.expected_batch_index,v_old.batch_limit) IS DISTINCT FROM (p_run_id,p_expected_batch_index,p_limit) THEN
      RAISE EXCEPTION 'BATCH_REPLAY_MISMATCH' USING ERRCODE='PT409';
    END IF;
    RETURN v_old.receipt;
  END IF;
  SELECT * INTO v_run FROM private.subscription_status_job_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.execution_protocol<>'atomic_v1' OR v_run.status<>'running'
    OR v_run.deadline_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'ATOMIC_JOB_RUN_NOT_ACTIVE' USING ERRCODE='PT409';
  END IF;
  PERFORM private.validate_subscription_execution_scope(v_run.execution_scope);
  IF v_run.execution_scope->>'kind'='tenants' THEN
    SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(v_run.execution_scope->'tenant_ids');
  END IF;
  SELECT * INTO STRICT v_progress FROM private.subscription_lifecycle_progress WHERE run_id=p_run_id FOR UPDATE;
  IF v_progress.batch_index<>p_expected_batch_index OR v_progress.phase='done' THEN
    RAISE EXCEPTION 'STALE_BATCH_CURSOR' USING ERRCODE='PT409';
  END IF;
  IF v_progress.phase IN ('grace','suspend') THEN
    v_target:=CASE WHEN v_progress.phase='grace' THEN 'grace_period' ELSE 'suspended' END;
    FOR v_id IN SELECT id FROM public.tenants
      WHERE (v_ids IS NULL OR id=ANY(v_ids)) AND (v_progress.cursor_id IS NULL OR id>v_progress.cursor_id)
      AND CASE WHEN v_progress.phase='grace' THEN subscription_status IN ('active','trial')
        AND subscription_end_date<v_run.started_at::date AND grace_period_ends_at>=v_run.started_at
        ELSE subscription_status='grace_period' AND grace_period_ends_at<v_run.started_at END
      ORDER BY id LIMIT p_limit LOOP
      v_command:=gen_random_uuid();
      v_result:=private.apply_subscription_lifecycle_transition(p_run_id,v_command,v_id,v_target);
      IF v_result->>'outcome'='applied' THEN
        IF v_target='grace_period' THEN v_progress.to_grace_period:=v_progress.to_grace_period+1;
        ELSE v_progress.to_suspended:=v_progress.to_suspended+1; END IF;
      END IF;
      v_seen:=v_seen+1; v_progress.cursor_id:=v_id;
    END LOOP;
  ELSIF v_progress.phase='delivery' THEN
    FOR v_id IN SELECT o.command_id FROM private.subscription_lifecycle_notification_outbox o
      JOIN private.subscription_lifecycle_commands c ON c.id=o.command_id
      WHERE o.status='pending' AND o.available_at<=clock_timestamp()
        AND (v_ids IS NULL OR c.tenant_id=ANY(v_ids))
        AND (v_progress.cursor_id IS NULL OR o.command_id>v_progress.cursor_id)
      ORDER BY o.command_id LIMIT p_limit LOOP
      IF v_run.deadline_at<=clock_timestamp() THEN RAISE EXCEPTION 'ATOMIC_JOB_RUN_NOT_ACTIVE' USING ERRCODE='PT409'; END IF;
      v_result:=private.deliver_subscription_lifecycle_notification(v_id);
      IF v_result->>'status'='delivered' THEN v_progress.notifications_sent:=v_progress.notifications_sent+1; END IF;
      IF v_result->>'status'='pending' THEN v_progress.notifications_failed:=v_progress.notifications_failed+1; END IF;
      v_seen:=v_seen+1; v_progress.cursor_id:=v_id;
    END LOOP;
  ELSIF v_progress.phase='staff' THEN
    FOR v_id IN SELECT id FROM public.staff_status
      WHERE status<>'offline' AND last_seen_at<v_run.started_at-interval '30 minutes'
      AND (v_ids IS NULL OR tenant_id=ANY(v_ids)) AND (v_progress.cursor_id IS NULL OR id>v_progress.cursor_id)
      ORDER BY id LIMIT p_limit FOR UPDATE LOOP
      -- Deadline is rechecked after every row-lock wait, before the side effect.
      IF v_run.deadline_at<=clock_timestamp() THEN RAISE EXCEPTION 'ATOMIC_JOB_RUN_NOT_ACTIVE' USING ERRCODE='PT409'; END IF;
      UPDATE public.staff_status SET status='offline',updated_at=clock_timestamp() WHERE id=v_id
        AND status<>'offline' AND last_seen_at<v_run.started_at-interval '30 minutes';
      IF FOUND THEN v_progress.staff_offlined:=v_progress.staff_offlined+1; END IF;
      v_seen:=v_seen+1; v_progress.cursor_id:=v_id;
    END LOOP;
  END IF;
  -- A full batch is never evidence that the scope is exhausted. Even exact
  -- multiples require the following empty scan before moving to the next phase.
  IF v_seen<p_limit THEN
    v_progress.phase:=CASE v_progress.phase WHEN 'grace' THEN 'suspend' WHEN 'suspend' THEN 'delivery'
      WHEN 'delivery' THEN 'staff' WHEN 'staff' THEN 'done' END;
    v_progress.cursor_id:=NULL;
  END IF;
  IF v_run.deadline_at<=clock_timestamp() THEN RAISE EXCEPTION 'ATOMIC_JOB_RUN_NOT_ACTIVE' USING ERRCODE='PT409'; END IF;
  v_progress.batch_index:=v_progress.batch_index+1;
  UPDATE private.subscription_lifecycle_progress SET phase=v_progress.phase,cursor_id=v_progress.cursor_id,
    batch_index=v_progress.batch_index,to_grace_period=v_progress.to_grace_period,to_suspended=v_progress.to_suspended,
    notifications_sent=v_progress.notifications_sent,notifications_failed=v_progress.notifications_failed,
    staff_offlined=v_progress.staff_offlined WHERE run_id=p_run_id;
  v_receipt:=jsonb_build_object('run_id',p_run_id,'request_id',p_request_id,'batch_index',v_progress.batch_index,
    'phase',v_progress.phase,'done',v_progress.phase='done','processed',v_seen,'execution_scope',v_run.execution_scope,
    'to_grace_period',v_progress.to_grace_period,'to_suspended',v_progress.to_suspended,
    'notifications_sent',v_progress.notifications_sent,'notifications_failed',v_progress.notifications_failed,
    'staff_offlined',v_progress.staff_offlined);
  INSERT INTO private.subscription_lifecycle_batch_receipts(request_id,run_id,expected_batch_index,batch_limit,receipt)
    VALUES(p_request_id,p_run_id,p_expected_batch_index,p_limit,v_receipt);
  RETURN v_receipt;
END;
$fn$;
REVOKE ALL ON FUNCTION public.process_subscription_lifecycle_batch(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.process_subscription_lifecycle_batch(uuid,uuid,integer,integer) TO service_role;

CREATE FUNCTION public.finish_atomic_subscription_status_run(p_run_id uuid,p_outcome_unknown boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE v_run private.subscription_status_job_runs%ROWTYPE; v_progress private.subscription_lifecycle_progress%ROWTYPE;
  v_summary jsonb; v_pending integer; v_complete boolean; v_ids uuid[]; v_receipt jsonb; v_staff text; v_errors jsonb;
BEGIN
  IF p_run_id IS NULL OR p_outcome_unknown IS NULL THEN RAISE EXCEPTION 'INVALID_ATOMIC_FINISH' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  SELECT * INTO v_run FROM private.subscription_status_job_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.execution_protocol<>'atomic_v1' THEN RAISE EXCEPTION 'ATOMIC_JOB_RUN_REQUIRED' USING ERRCODE='PT409'; END IF;
  IF v_run.summary IS NOT NULL THEN
    RETURN jsonb_build_object('recorded',true,'status',v_run.status,'summary',v_run.summary,'execution_scope',v_run.execution_scope);
  END IF;
  SELECT * INTO STRICT v_progress FROM private.subscription_lifecycle_progress WHERE run_id=p_run_id;
  IF v_run.execution_scope->>'kind'='tenants' THEN
    SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(v_run.execution_scope->'tenant_ids');
  END IF;
  SELECT count(*) INTO v_pending FROM private.subscription_lifecycle_notification_outbox o
    JOIN private.subscription_lifecycle_commands c ON c.id=o.command_id
    WHERE o.status='pending' AND (v_ids IS NULL OR c.tenant_id=ANY(v_ids));
  v_complete:=v_progress.phase='done' AND NOT p_outcome_unknown;
  v_staff:=CASE v_progress.phase WHEN 'done' THEN 'success' WHEN 'staff' THEN 'failed' ELSE 'not_run' END;
  v_errors:=CASE WHEN NOT v_complete THEN '["JOB_EXECUTION_FAILED"]'::jsonb
    WHEN v_pending>0 THEN '["NOTIFICATION_FAILED"]'::jsonb ELSE '[]'::jsonb END;
  IF v_staff='failed' THEN v_errors:=v_errors||'["STAFF_PRESENCE_FAILED"]'::jsonb; END IF;
  v_summary:=jsonb_build_object('subscription_status',CASE WHEN v_complete AND v_pending=0 THEN 'success' ELSE 'failed' END,
    'staff_status',v_staff,
    'to_grace_period',v_progress.to_grace_period,'to_suspended',v_progress.to_suspended,
    'notifications_sent',v_progress.notifications_sent,'notifications_failed',v_pending,
    'transition_outcome_unknown',p_outcome_unknown,'recovery_required',NOT v_complete OR v_pending>0,
    'error_codes',v_errors);
  v_receipt:=public.finish_subscription_status_run(p_run_id,v_summary);
  RETURN v_receipt||jsonb_build_object('summary',v_summary,'execution_scope',v_run.execution_scope,
    'scope_complete',v_complete,'pending_notifications',v_pending);
END;
$fn$;
REVOKE ALL ON FUNCTION public.finish_atomic_subscription_status_run(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_atomic_subscription_status_run(uuid,boolean) TO service_role;
-- The service worker must not bypass the server-derived completion proof.
REVOKE ALL ON FUNCTION public.finish_subscription_status_run(uuid,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION public.begin_subscription_status_run(uuid) FROM service_role;
-- No production consumer except the replaced worker uses these legacy sweeps.
-- Keep the signatures for compatibility, but fail closed even under postgres.
CREATE OR REPLACE FUNCTION public.process_expired_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RAISE EXCEPTION 'LEGACY_SUBSCRIPTION_SWEEP_DISABLED' USING ERRCODE='0A000'; END;
$fn$;
REVOKE ALL ON FUNCTION public.process_expired_subscriptions() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.auto_offline_inactive_staff() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
