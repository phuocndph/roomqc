-- Browser requests contain only an immutable approved specification UUID.
CREATE TABLE roomqc_control.deployment_specs (
  id uuid PRIMARY KEY,
  cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  host_id text NOT NULL REFERENCES roomqc_control.hosts(id),
  environment text NOT NULL CHECK(environment IN('local','staging')),
  release_id text NOT NULL CHECK(release_id~'^[a-z][a-z0-9-]{1,39}$'),
  compose_sha256 text NOT NULL CHECK(compose_sha256~'^[a-f0-9]{64}$'),
  execution_sha256 text NOT NULL CHECK(execution_sha256~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE INDEX deployment_specs_cluster ON roomqc_control.deployment_specs(cluster_id,created_at DESC,id DESC);
CREATE INDEX deployment_specs_history ON roomqc_control.deployment_specs(created_at DESC,id DESC);
CREATE INDEX deployment_specs_host ON roomqc_control.deployment_specs(host_id);
CREATE TRIGGER deployment_spec_immutable BEFORE UPDATE OR DELETE ON roomqc_control.deployment_specs
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_history();

CREATE TABLE roomqc_control.deployment_jobs (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL UNIQUE REFERENCES roomqc_control.control_commands(id),
  spec_id uuid NOT NULL REFERENCES roomqc_control.deployment_specs(id),
  cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  run_id uuid UNIQUE REFERENCES roomqc_control.deployment_runs(id),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','succeeded','failed','needs_review')),
  lease_token uuid,lease_until timestamptz,
  error_code text CHECK(error_code~'^[A-Z][A-Z0-9_]{1,119}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,
  CHECK((state IN('succeeded','failed'))=(finished_at IS NOT NULL)),
  CHECK((state='running' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state<>'running' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK(state NOT IN('running','needs_review','succeeded') OR run_id IS NOT NULL)
);
CREATE UNIQUE INDEX deployment_job_active_cluster ON roomqc_control.deployment_jobs(cluster_id)
  WHERE state IN('queued','running','needs_review');
CREATE INDEX deployment_job_queue ON roomqc_control.deployment_jobs(created_at,id) WHERE state='queued';
CREATE INDEX deployment_job_history ON roomqc_control.deployment_jobs(created_at DESC,id DESC);
CREATE INDEX deployment_job_cluster ON roomqc_control.deployment_jobs(cluster_id,created_at DESC,id DESC);
CREATE INDEX deployment_job_state ON roomqc_control.deployment_jobs(state,created_at DESC,id DESC);
CREATE INDEX deployment_job_specs ON roomqc_control.deployment_jobs(spec_id);

CREATE FUNCTION roomqc_control.guard_deployment_spec() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM roomqc_control.clusters c JOIN roomqc_control.hosts h ON h.id=c.host_id
    WHERE c.id=NEW.cluster_id AND h.id=NEW.host_id AND h.environment=NEW.environment) THEN
    RAISE EXCEPTION 'DEPLOYMENT_SPEC_TARGET_MISMATCH' USING ERRCODE='42501';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deployment_spec_target BEFORE INSERT ON roomqc_control.deployment_specs
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_spec();

CREATE FUNCTION roomqc_control.guard_deployment_job() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s roomqc_control.deployment_specs;r roomqc_control.deployment_runs;
  cmd roomqc_control.control_commands;closed boolean;host_state text;target_host text;resolved text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'DEPLOYMENT_JOB_IMMUTABLE' USING ERRCODE='42501';END IF;
  SELECT * INTO STRICT s FROM roomqc_control.deployment_specs WHERE id=NEW.spec_id;
  IF TG_OP='INSERT' THEN
    SELECT * INTO cmd FROM roomqc_control.control_commands WHERE id=NEW.command_id;
    SELECT c.host_id INTO target_host FROM roomqc_control.clusters c WHERE c.id=NEW.cluster_id FOR UPDATE;
    SELECT manual_closed INTO closed FROM roomqc_control.cluster_policies WHERE cluster_id=NEW.cluster_id;
    SELECT status INTO host_state FROM roomqc_control.hosts WHERE id=s.host_id;
    IF NEW.state<>'queued' OR NEW.run_id IS NOT NULL OR NEW.cluster_id<>s.cluster_id OR target_host IS DISTINCT FROM s.host_id
      OR cmd.operation IS DISTINCT FROM 'queue_deployment' OR cmd.target_id IS DISTINCT FROM NEW.cluster_id
      OR cmd.status IS DISTINCT FROM 'started' OR s.expires_at<=clock_timestamp() OR closed IS DISTINCT FROM true
      OR host_state IS DISTINCT FROM 'active' OR EXISTS(SELECT 1 FROM roomqc_control.deployment_runs
        WHERE cluster_id=NEW.cluster_id AND reconciliation_id IS NULL AND state IN('running','outcome_unknown','rollback_failed')) THEN
      RAISE EXCEPTION 'DEPLOYMENT_QUEUE_BLOCKED' USING ERRCODE='42501';END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.command_id,NEW.spec_id,NEW.cluster_id,NEW.created_at) IS DISTINCT FROM
    ROW(OLD.id,OLD.command_id,OLD.spec_id,OLD.cluster_id,OLD.created_at) OR OLD.state IN('succeeded','failed')
    OR (OLD.run_id IS NOT NULL AND NEW.run_id IS DISTINCT FROM OLD.run_id)
    OR (OLD.state='queued' AND NEW.state NOT IN('running','failed'))
    OR (OLD.state='running' AND NEW.state NOT IN('running','succeeded','failed','needs_review'))
    OR (OLD.state='needs_review' AND NEW.state NOT IN('succeeded','failed'))
    OR (OLD.state='running' AND NEW.state='running' AND NEW.lease_token IS DISTINCT FROM OLD.lease_token) THEN
    RAISE EXCEPTION 'DEPLOYMENT_JOB_IMMUTABLE' USING ERRCODE='42501';END IF;
  IF NEW.run_id IS NOT NULL THEN
    SELECT * INTO r FROM roomqc_control.deployment_runs WHERE id=NEW.run_id;
    IF ROW(r.cluster_id,r.host_id,r.environment,r.release_id,r.compose_sha256) IS DISTINCT FROM
      ROW(s.cluster_id,s.host_id,s.environment,s.release_id,s.compose_sha256) THEN
      RAISE EXCEPTION 'DEPLOYMENT_JOB_RUN_MISMATCH' USING ERRCODE='42501';END IF;
    SELECT outcome INTO resolved FROM roomqc_control.deployment_resolutions WHERE id=r.reconciliation_id;
    IF (NEW.state='succeeded' AND NOT(r.state='deployed' OR coalesce(resolved='candidate_healthy',false)))
      OR (NEW.state='failed' AND NOT(r.state IN('blocked','not_started','rolled_back') OR coalesce(resolved IN('previous_healthy','empty'),false)))
      OR (NEW.state='running' AND (r.state<>'running' OR r.reconciliation_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'DEPLOYMENT_JOB_RESULT_UNCONFIRMED' USING ERRCODE='42501';END IF;
  END IF;
  NEW.updated_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER deployment_job_guard BEFORE INSERT OR UPDATE OR DELETE ON roomqc_control.deployment_jobs
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_job();
REVOKE ALL ON roomqc_control.deployment_specs,roomqc_control.deployment_jobs FROM PUBLIC;
GRANT SELECT ON roomqc_control.deployment_specs,roomqc_control.deployment_jobs TO roomqc_control_api,roomqc_control_deployer;
GRANT INSERT(id,command_id,spec_id,cluster_id) ON roomqc_control.deployment_jobs TO roomqc_control_api;
GRANT INSERT ON roomqc_control.deployment_specs TO roomqc_control_deployer;
GRANT UPDATE(run_id,state,lease_token,lease_until,error_code,finished_at) ON roomqc_control.deployment_jobs TO roomqc_control_deployer;
GRANT SELECT ON roomqc_control.cluster_policies TO roomqc_control_deployer;
