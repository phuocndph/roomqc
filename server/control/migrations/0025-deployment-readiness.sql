-- Bind candidate images to the immutable specification. Existing rows are
-- retained; nonlocal specifications without these fields cannot execute.
ALTER TABLE roomqc_control.deployment_specs ADD COLUMN primary_image text,
  ADD COLUMN endpoint_fingerprint text CHECK(endpoint_fingerprint~'^[a-f0-9]{64}$'),
  ADD COLUMN service_images jsonb CHECK(service_images IS NULL OR
    (jsonb_typeof(service_images)='array' AND jsonb_array_length(service_images) BETWEEN 1 AND 32));
ALTER TABLE roomqc_control.deployment_runs ADD COLUMN spec_id uuid REFERENCES roomqc_control.deployment_specs(id);
CREATE INDEX deployment_run_spec ON roomqc_control.deployment_runs(spec_id);
CREATE FUNCTION roomqc_control.guard_deployment_run_spec() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.spec_id IS DISTINCT FROM OLD.spec_id THEN RAISE EXCEPTION 'DEPLOYMENT_SPEC_IMMUTABLE' USING ERRCODE='42501';END IF;
  ELSIF NEW.environment<>'local' OR NEW.spec_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM roomqc_control.deployment_specs s WHERE s.id=NEW.spec_id
      AND ROW(s.cluster_id,s.host_id,s.environment,s.release_id,s.compose_sha256)=
        ROW(NEW.cluster_id,NEW.host_id,NEW.environment,NEW.release_id,NEW.compose_sha256)
      AND s.expires_at>clock_timestamp()) THEN
      RAISE EXCEPTION 'DEPLOYMENT_SPEC_UNAVAILABLE' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deployment_run_spec BEFORE INSERT OR UPDATE ON roomqc_control.deployment_runs
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_run_spec();
GRANT SELECT ON roomqc_control.release_authority,roomqc_control.release_approvals,
  roomqc_control.release_key_revocations,roomqc_control.backup_runs TO roomqc_control_deployer;

-- Readiness is an observation of the PRIMARY directory, never browser input.
-- It deliberately permits only a schema-preserving service rollout. It is not
-- permission to run migrations, open signup or execute production releases.
CREATE FUNCTION roomqc_control.deployment_readiness(p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d roomqc_control.deployment_runs;s roomqc_control.deployment_specs;
  c roomqc_control.clusters;h roomqc_control.hosts;p roomqc_control.cluster_policies;
  a roomqc_control.release_approvals;r roomqc_control.release_authority;b roomqc_control.backup_runs;
  reasons text[]='{}';at_time timestamptz=clock_timestamp();bound boolean;
BEGIN
  SELECT * INTO STRICT d FROM roomqc_control.deployment_runs WHERE id=p_run;
  SELECT * INTO s FROM roomqc_control.deployment_specs WHERE id=d.spec_id;
  SELECT * INTO STRICT c FROM roomqc_control.clusters WHERE id=d.cluster_id;
  SELECT * INTO STRICT h FROM roomqc_control.hosts WHERE id=d.host_id;
  SELECT * INTO STRICT p FROM roomqc_control.cluster_policies WHERE cluster_id=d.cluster_id;
  IF d.environment='local' THEN
    RETURN jsonb_build_object('mode','local_test','decision','ready','reasons','[]'::jsonb,'observedAt',at_time,
      'approvalId',NULL,'backupId',NULL,'schemaManifestHash',NULL);
  END IF;
  IF s.id IS NULL OR s.cluster_id<>d.cluster_id OR s.host_id<>d.host_id OR s.environment<>d.environment
    OR s.release_id<>d.release_id OR s.compose_sha256<>d.compose_sha256 OR s.expires_at<=at_time THEN
    reasons=array_append(reasons,'DEPLOYMENT_SPEC_UNAVAILABLE');END IF;
  IF c.host_id IS DISTINCT FROM d.host_id OR h.environment<>d.environment OR h.status<>'active'
    OR c.status='offline' THEN reasons=array_append(reasons,'DEPLOYMENT_TARGET_NOT_READY');END IF;
  IF NOT p.manual_closed THEN reasons=array_append(reasons,'DEPLOYMENT_ADMISSION_OPEN');END IF;
  SELECT * INTO r FROM roomqc_control.release_authority WHERE cluster_id=d.cluster_id;
  SELECT * INTO a FROM roomqc_control.release_approvals WHERE approval_id=r.approval_id;
  bound=a.approval_id IS NOT NULL AND r.state='active' AND r.epoch=a.epoch
    AND a.cluster_id=d.cluster_id AND a.host_id=d.host_id AND a.environment=d.environment
    AND a.inventory_ref=c.inventory_ref AND a.expected->>'clusterId'=d.cluster_id
    AND a.endpoint_fingerprint=s.endpoint_fingerprint
    AND a.expected->>'releaseId'=d.release_id AND a.not_before_ms<=extract(epoch FROM at_time)*1000
    AND a.expires_at_ms>extract(epoch FROM at_time)*1000
    AND NOT EXISTS(SELECT 1 FROM roomqc_control.release_key_revocations k WHERE k.key_fingerprint=a.key_fingerprint);
  IF bound IS DISTINCT FROM true THEN reasons=array_append(reasons,'DEPLOYMENT_RELEASE_NOT_APPROVED');END IF;
  IF c.validation_state<>'valid' OR c.validated_at IS NULL OR c.validated_at>at_time
    OR c.validated_at<at_time-interval '5 minutes' OR c.frontend_ready IS DISTINCT FROM true
    OR c.schema_manifest_hash IS DISTINCT FROM a.expected->>'schemaManifestHash' THEN
    reasons=array_append(reasons,'DEPLOYMENT_SCHEMA_UNVERIFIED');END IF;
  IF s.primary_image IS NULL OR s.service_images IS NULL OR
    s.primary_image!~'^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$'
    OR NOT coalesce(s.service_images ? s.primary_image,false)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.service_images) v WHERE jsonb_typeof(v)<>'string'
      OR (v#>>'{}')!~'^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$') OR
    right(s.primary_image,64) IS DISTINCT FROM a.expected->>'artifactDigest'
    OR NOT coalesce(EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.service_images) v
      WHERE right(v,64)=a.expected->>'frontendArtifactDigest'),false) THEN
    reasons=array_append(reasons,'DEPLOYMENT_ARTIFACT_MISMATCH');END IF;
  SELECT * INTO b FROM roomqc_control.backup_runs WHERE cluster_id=d.cluster_id AND scope='bundle' AND verification_state='verified'
    AND completed_at<=at_time AND completed_at>=at_time-interval '24 hours'
    AND restore_test_at<=at_time AND restore_test_at>=at_time-interval '30 days'
    AND manifest_hash~'^[a-f0-9]{64}$' ORDER BY completed_at DESC,id DESC LIMIT 1;
  IF b.id IS NULL THEN reasons=array_append(reasons,'DEPLOYMENT_BACKUP_UNVERIFIED');END IF;
  IF d.environment='production' THEN reasons=array_append(reasons,'VPS_DEPLOY_PRODUCTION_GATES_REQUIRED');END IF;
  RETURN jsonb_build_object('mode','primary_directory','decision',CASE WHEN cardinality(reasons)=0 THEN 'ready' ELSE 'blocked' END,
    'reasons',to_jsonb(reasons),'observedAt',at_time,'approvalId',a.approval_id,'backupId',b.id,'schemaManifestHash',c.schema_manifest_hash);
END $$;
REVOKE ALL ON FUNCTION roomqc_control.deployment_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roomqc_control.deployment_readiness(uuid) TO roomqc_control_deployer;

CREATE TABLE roomqc_control.deployment_gate_checks (
  id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES roomqc_control.deployment_runs(id),
  phase_index integer NOT NULL CHECK(phase_index BETWEEN 1 AND 5),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX deployment_gate_run ON roomqc_control.deployment_gate_checks(run_id,phase_index,recorded_at DESC,id DESC);
CREATE TRIGGER deployment_gate_immutable BEFORE UPDATE OR DELETE ON roomqc_control.deployment_gate_checks
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_history();

CREATE FUNCTION roomqc_control.guard_deployment_gate_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d roomqc_control.deployment_runs;primary_value jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
    AND classid=0 AND objid=727001 AND objsubid=1 AND mode='ExclusiveLock' AND granted) THEN
    RAISE EXCEPTION 'DEPLOYMENT_GATE_LOCK_REQUIRED' USING ERRCODE='42501';END IF;
  SELECT * INTO STRICT d FROM roomqc_control.deployment_runs WHERE id=NEW.run_id;
  primary_value=roomqc_control.deployment_readiness(NEW.run_id);
  IF d.state<>'running' OR d.reconciliation_id IS NOT NULL OR NEW.phase_index<>d.phase_index+1
    OR NOT(NEW.evidence ? 'observedAt') OR jsonb_typeof(NEW.evidence->'observedAt') IS DISTINCT FROM 'string'
    OR NEW.evidence-'observedAt' IS DISTINCT FROM primary_value-'observedAt'
    OR (NEW.evidence->>'observedAt')::timestamptz<clock_timestamp()-interval '5 seconds'
    OR (NEW.evidence->>'observedAt')::timestamptz>clock_timestamp() THEN
    RAISE EXCEPTION 'DEPLOYMENT_GATE_EVIDENCE_INVALID' USING ERRCODE='42501';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deployment_gate_insert BEFORE INSERT ON roomqc_control.deployment_gate_checks
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_gate_insert();

CREATE FUNCTION roomqc_control.guard_deployment_phase_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE observed jsonb;
BEGIN
  IF NEW.phase_index>OLD.phase_index AND NEW.environment<>'local' THEN
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
      AND classid=0 AND objid=727001 AND objsubid=1 AND mode='ExclusiveLock' AND granted) THEN
      RAISE EXCEPTION 'DEPLOYMENT_GATE_LOCK_REQUIRED' USING ERRCODE='42501';END IF;
    observed=roomqc_control.deployment_readiness(NEW.id);
    IF observed->>'decision'<>'ready' OR NOT EXISTS(
      SELECT 1 FROM roomqc_control.deployment_gate_checks g WHERE g.run_id=NEW.id AND g.phase_index=NEW.phase_index
        AND g.evidence-'observedAt'=observed-'observedAt' AND g.evidence->>'decision'='ready'
        AND g.recorded_at>clock_timestamp()-interval '5 seconds') THEN
      RAISE EXCEPTION 'DEPLOYMENT_GATE_REQUIRED' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deployment_phase_gate BEFORE UPDATE ON roomqc_control.deployment_runs
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_phase_gate();
REVOKE ALL ON roomqc_control.deployment_gate_checks FROM PUBLIC;
GRANT SELECT ON roomqc_control.deployment_gate_checks TO roomqc_control_api,roomqc_control_deployer;
GRANT INSERT(id,run_id,phase_index,evidence) ON roomqc_control.deployment_gate_checks TO roomqc_control_deployer;
