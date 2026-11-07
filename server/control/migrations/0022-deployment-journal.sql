-- Operator-owned deployment receipts. The API can read, never enqueue or run SSH.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_deployer') THEN
    CREATE ROLE roomqc_control_deployer NOLOGIN;
  END IF;
END $$;
CREATE TABLE roomqc_control.deployment_runs (
  id uuid PRIMARY KEY,
  cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  host_id text NOT NULL REFERENCES roomqc_control.hosts(id),
  environment text NOT NULL CHECK(environment IN('local','staging','production')),
  release_id text NOT NULL CHECK(release_id~'^[a-z][a-z0-9-]{1,39}$'),
  compose_sha256 text NOT NULL CHECK(compose_sha256~'^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN('running','blocked','not_started','deployed','rolled_back','rollback_failed','outcome_unknown')),
  phase_index integer NOT NULL DEFAULT 0 CHECK(phase_index BETWEEN 0 AND 5),
  error_code text CHECK(error_code~'^[A-Z][A-Z0-9_]{1,119}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  CHECK((state='running')=(finished_at IS NULL)),
  CHECK(updated_at>=created_at)
);
-- An unknown commit or failed rollback requires reconciliation, never an automatic retry.
CREATE UNIQUE INDEX deployment_one_unresolved_cluster ON roomqc_control.deployment_runs(cluster_id)
  WHERE state IN('running','outcome_unknown','rollback_failed');
CREATE INDEX deployment_history_page ON roomqc_control.deployment_runs(created_at DESC,id DESC);
CREATE INDEX deployment_cluster_page ON roomqc_control.deployment_runs(cluster_id,created_at DESC,id DESC);
CREATE INDEX deployment_state_page ON roomqc_control.deployment_runs(state,created_at DESC,id DESC);
CREATE INDEX deployment_host ON roomqc_control.deployment_runs(host_id);
CREATE FUNCTION roomqc_control.guard_deployment_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'DEPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE='42501';END IF;
  IF OLD.state<>'running' OR
    ROW(NEW.id,NEW.cluster_id,NEW.host_id,NEW.environment,NEW.release_id,NEW.compose_sha256,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.cluster_id,OLD.host_id,OLD.environment,OLD.release_id,OLD.compose_sha256,OLD.created_at)
    OR NEW.phase_index<OLD.phase_index OR NEW.phase_index>OLD.phase_index+1
    OR (NEW.state='deployed' AND NEW.phase_index<>5) THEN
    RAISE EXCEPTION 'DEPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  NEW.updated_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER deployment_history_guard BEFORE UPDATE OR DELETE ON roomqc_control.deployment_runs
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_history();
REVOKE ALL ON roomqc_control.deployment_runs FROM PUBLIC;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_deployer;
GRANT SELECT ON roomqc_control.clusters,roomqc_control.hosts,roomqc_control.schema_migrations TO roomqc_control_deployer;
GRANT SELECT,INSERT ON roomqc_control.deployment_runs TO roomqc_control_deployer;
GRANT UPDATE(state,phase_index,error_code,finished_at) ON roomqc_control.deployment_runs TO roomqc_control_deployer;
GRANT SELECT ON roomqc_control.deployment_runs TO roomqc_control_api;
