-- A1: durable accounting + admission control, not a scheduler or lifecycle sweep.
-- Timed-out work may have committed. It MUST keep blocking until manual review.
CREATE TABLE private.subscription_status_job_runs (
  id uuid PRIMARY KEY,
  job text NOT NULL DEFAULT 'check-subscription-status' CHECK(job='check-subscription-status'),
  scope text NOT NULL DEFAULT 'cluster' CHECK(scope='cluster'),
  status text NOT NULL CHECK(status IN ('running','busy','interrupted','success','failed')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  deadline_at timestamptz NOT NULL,
  blocked_by uuid REFERENCES private.subscription_status_job_runs(id),
  summary jsonb,
  CHECK(deadline_at=started_at+interval '15 minutes'),
  CHECK((status IN ('running','interrupted') AND finished_at IS NULL AND blocked_by IS NULL AND summary IS NULL)
    OR (status='interrupted' AND finished_at IS NOT NULL AND blocked_by IS NULL
      AND summary IS NOT NULL AND summary->>'transition_outcome_unknown'='true')
    OR (status='busy' AND finished_at IS NOT NULL AND blocked_by IS NOT NULL AND summary IS NULL)
    OR (status IN ('success','failed') AND finished_at IS NOT NULL AND blocked_by IS NULL AND summary IS NOT NULL))
);
CREATE UNIQUE INDEX subscription_status_job_one_active
  ON private.subscription_status_job_runs(job,scope) WHERE status IN ('running','interrupted');
CREATE INDEX subscription_status_job_recent ON private.subscription_status_job_runs(started_at DESC,id DESC);
CREATE INDEX subscription_status_job_last_success ON private.subscription_status_job_runs(finished_at DESC,id DESC)
  WHERE status='success';
ALTER TABLE private.subscription_status_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_status_job_runs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.validate_subscription_job_summary(p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_key text; v_value jsonb;
BEGIN
  IF p_result IS NULL OR jsonb_typeof(p_result)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_result))<>9
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_result) k WHERE k NOT IN
      ('subscription_status','staff_status','to_grace_period','to_suspended','notifications_sent',
       'notifications_failed','transition_outcome_unknown','recovery_required','error_codes')) THEN
    RAISE EXCEPTION 'INVALID_JOB_SUMMARY' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_result->'subscription_status')<>'string'
    OR p_result->>'subscription_status' NOT IN ('success','failed')
    OR jsonb_typeof(p_result->'staff_status')<>'string'
    OR p_result->>'staff_status' NOT IN ('success','failed','not_run') THEN
    RAISE EXCEPTION 'INVALID_JOB_SUMMARY' USING ERRCODE='22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['to_grace_period','to_suspended','notifications_sent','notifications_failed'] LOOP
    v_value := p_result->v_key;
    IF jsonb_typeof(v_value) IS DISTINCT FROM 'number' OR v_value::text !~ '^[0-9]+$'
      OR (v_value::text)::numeric>2147483647 THEN
      RAISE EXCEPTION 'INVALID_JOB_SUMMARY' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['transition_outcome_unknown','recovery_required'] LOOP
    IF jsonb_typeof(p_result->v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'INVALID_JOB_SUMMARY' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_result->'error_codes')<>'array' OR jsonb_array_length(p_result->'error_codes')>6 THEN
    RAISE EXCEPTION 'INVALID_JOB_SUMMARY' USING ERRCODE='22023';
  END IF;
  FOR v_value IN SELECT value FROM jsonb_array_elements(p_result->'error_codes') LOOP
    IF jsonb_typeof(v_value)<>'string' OR v_value#>>'{}' NOT IN
      ('GRACE_TRANSITION_FAILED','SUSPEND_TRANSITION_FAILED','OWNER_LOOKUP_FAILED',
       'NOTIFICATION_FAILED','STAFF_PRESENCE_FAILED','JOB_EXECUTION_FAILED') THEN
      RAISE EXCEPTION 'INVALID_JOB_SUMMARY' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(p_result->'error_codes'))
    OR (p_result->>'subscription_status'='success' AND
      ((p_result->>'notifications_failed')::integer<>0 OR (p_result->>'transition_outcome_unknown')::boolean))
    OR (p_result->>'staff_status'='not_run' AND p_result->>'subscription_status'<>'failed')
    OR (p_result->>'subscription_status'='success' AND p_result->>'staff_status'='success'
      AND (jsonb_array_length(p_result->'error_codes')<>0 OR (p_result->>'recovery_required')::boolean))
    OR ((p_result->>'subscription_status'='failed' OR p_result->>'staff_status'<>'success')
      AND (jsonb_array_length(p_result->'error_codes')=0 OR NOT (p_result->>'recovery_required')::boolean))
    OR (p_result->>'staff_status'='failed' AND NOT (p_result->'error_codes' ? 'STAFF_PRESENCE_FAILED'))
    OR (p_result->>'staff_status'<>'failed' AND p_result->'error_codes' ? 'STAFF_PRESENCE_FAILED') THEN
    RAISE EXCEPTION 'INCONSISTENT_JOB_SUMMARY' USING ERRCODE='22023';
  END IF;
  RETURN p_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.validate_subscription_job_summary(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_subscription_status_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_now timestamptz; v_run private.subscription_status_job_runs%ROWTYPE; v_active uuid;
BEGIN
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'RUN_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  v_now := clock_timestamp();
  UPDATE private.subscription_status_job_runs SET status='interrupted'
    WHERE status='running' AND deadline_at<=v_now;
  SELECT * INTO v_run FROM private.subscription_status_job_runs WHERE id=p_run_id;
  IF FOUND THEN
    RETURN jsonb_build_object('acquired',false,'run_id',v_run.id,'status',v_run.status,'blocked_by',v_run.blocked_by);
  END IF;
  SELECT id INTO v_active FROM private.subscription_status_job_runs WHERE status IN ('running','interrupted');
  INSERT INTO private.subscription_status_job_runs(id,status,started_at,deadline_at,finished_at,blocked_by)
    VALUES(p_run_id,CASE WHEN v_active IS NULL THEN 'running' ELSE 'busy' END,
      v_now,v_now+interval '15 minutes',CASE WHEN v_active IS NOT NULL THEN v_now END,v_active)
    RETURNING * INTO v_run;
  RETURN jsonb_build_object('acquired',v_active IS NULL,'run_id',v_run.id,'status',v_run.status,'blocked_by',v_run.blocked_by);
END;
$fn$;
REVOKE ALL ON FUNCTION public.begin_subscription_status_run(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_subscription_status_run(uuid) TO service_role;

CREATE FUNCTION public.finish_subscription_status_run(p_run_id uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_run private.subscription_status_job_runs%ROWTYPE; v_now timestamptz; v_result jsonb; v_status text;
BEGIN
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'RUN_ID_REQUIRED' USING ERRCODE='22023'; END IF;
  v_result := private.validate_subscription_job_summary(p_result);
  PERFORM pg_advisory_xact_lock(hashtextextended('roomqc:subscription-status:cluster',0));
  v_now := clock_timestamp();
  SELECT * INTO v_run FROM private.subscription_status_job_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_RUN_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF v_run.status IN ('success','failed') OR (v_run.status='interrupted' AND v_run.summary IS NOT NULL) THEN
    IF v_run.summary IS DISTINCT FROM v_result THEN
      RAISE EXCEPTION 'JOB_FINISH_REPLAY_MISMATCH' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('recorded',true,'status',v_run.status);
  END IF;
  IF v_run.status='running' AND v_run.deadline_at<=v_now THEN
    UPDATE private.subscription_status_job_runs SET status='interrupted' WHERE id=p_run_id;
    RETURN jsonb_build_object('recorded',false,'status','interrupted');
  END IF;
  IF v_run.status<>'running' THEN
    RETURN jsonb_build_object('recorded',false,'status',v_run.status);
  END IF;
  v_status := CASE WHEN (v_result->>'transition_outcome_unknown')::boolean THEN 'interrupted'
    WHEN v_result->>'subscription_status'='success' AND v_result->>'staff_status'='success'
    THEN 'success' ELSE 'failed' END;
  UPDATE private.subscription_status_job_runs SET status=v_status,finished_at=v_now,summary=v_result WHERE id=p_run_id;
  RETURN jsonb_build_object('recorded',true,'status',v_status);
END;
$fn$;
REVOKE ALL ON FUNCTION public.finish_subscription_status_run(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_subscription_status_run(uuid,jsonb) TO service_role;

CREATE FUNCTION public.admin_subscription_job_monitor()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_now timestamptz := statement_timestamp(); v_runs jsonb; v_active jsonb; v_failure jsonb;
  v_success timestamptz; v_grace bigint; v_suspend bigint; v_unhandled bigint;
BEGIN
  PERFORM private.require_reconciliation_case_actor();
  -- Project overdue execution as interrupted without modifying state on GET/RPC.
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
  SELECT count(*) FILTER(WHERE subscription_status IN ('active','trial') AND subscription_end_date<v_now
      AND grace_period_ends_at>=v_now),
    count(*) FILTER(WHERE subscription_status='grace_period' AND grace_period_ends_at<v_now),
    count(*) FILTER(WHERE subscription_status IN ('active','trial') AND subscription_end_date<v_now
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
