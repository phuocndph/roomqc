-- Preserve the original outcome; append a separate operator observation.
CREATE TABLE roomqc_control.deployment_resolutions (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE REFERENCES roomqc_control.deployment_runs(id),
  expected_version timestamptz NOT NULL,
  outcome text NOT NULL CHECK(outcome IN('candidate_healthy','previous_healthy','empty')),
  current_release_id text CHECK(current_release_id~'^[a-z][a-z0-9-]{1,39}$'),
  evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=65536),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((outcome='empty')=(current_release_id IS NULL))
);
ALTER TABLE roomqc_control.deployment_runs ADD COLUMN reconciliation_id uuid UNIQUE
  REFERENCES roomqc_control.deployment_resolutions(id);
DROP INDEX roomqc_control.deployment_one_unresolved_cluster;
CREATE UNIQUE INDEX deployment_one_unresolved_cluster ON roomqc_control.deployment_runs(cluster_id)
  WHERE state IN('running','outcome_unknown','rollback_failed') AND reconciliation_id IS NULL;

CREATE OR REPLACE FUNCTION roomqc_control.guard_deployment_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'DEPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE='42501';END IF;
  IF OLD.reconciliation_id IS NULL AND NEW.reconciliation_id IS NOT NULL
    AND to_jsonb(NEW)-'reconciliation_id'=to_jsonb(OLD)-'reconciliation_id'
    AND EXISTS(SELECT 1 FROM roomqc_control.deployment_resolutions WHERE id=NEW.reconciliation_id AND run_id=OLD.id) THEN
    RETURN NEW;
  END IF;
  IF OLD.state<>'running' OR OLD.reconciliation_id IS NOT NULL OR NEW.reconciliation_id IS DISTINCT FROM OLD.reconciliation_id OR
    ROW(NEW.id,NEW.cluster_id,NEW.host_id,NEW.environment,NEW.release_id,NEW.compose_sha256,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.cluster_id,OLD.host_id,OLD.environment,OLD.release_id,OLD.compose_sha256,OLD.created_at)
    OR NEW.phase_index<OLD.phase_index OR NEW.phase_index>OLD.phase_index+1
    OR (NEW.state='deployed' AND NEW.phase_index<>5) THEN
    RAISE EXCEPTION 'DEPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  NEW.updated_at=clock_timestamp();RETURN NEW;
END $$;
CREATE FUNCTION roomqc_control.apply_deployment_resolution() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r roomqc_control.deployment_runs;
BEGIN
  SELECT * INTO r FROM roomqc_control.deployment_runs WHERE id=NEW.run_id FOR UPDATE;
  IF NOT FOUND OR r.reconciliation_id IS NOT NULL OR r.updated_at IS DISTINCT FROM NEW.expected_version
    OR NEW.observed_at<r.created_at OR NEW.observed_at>clock_timestamp()+interval '30 seconds'
    OR NEW.observed_at<clock_timestamp()-interval '5 minutes'
    OR (NEW.outcome='candidate_healthy' AND NEW.current_release_id<>r.release_id)
    OR (NEW.outcome='previous_healthy' AND NEW.current_release_id=r.release_id)
    OR NEW.evidence->>'runId' IS DISTINCT FROM r.id::text
    OR NEW.evidence->>'clusterId' IS DISTINCT FROM r.cluster_id
    OR NEW.evidence->>'hostId' IS DISTINCT FROM r.host_id
    OR NEW.evidence->>'environment' IS DISTINCT FROM r.environment
    OR NEW.evidence->>'composeSha256' IS DISTINCT FROM r.compose_sha256
    OR NEW.evidence->>'releaseId' IS DISTINCT FROM r.release_id
    OR NEW.evidence->>'outcome' IS DISTINCT FROM NEW.outcome
    OR NEW.evidence->>'currentRelease' IS DISTINCT FROM NEW.current_release_id THEN
    RAISE EXCEPTION 'DEPLOYMENT_RESOLUTION_CONFLICT' USING ERRCODE='40001';
  END IF;
  UPDATE roomqc_control.deployment_runs SET reconciliation_id=NEW.id WHERE id=r.id;
  RETURN NEW;
END $$;
CREATE TRIGGER deployment_resolution_apply AFTER INSERT ON roomqc_control.deployment_resolutions
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.apply_deployment_resolution();
CREATE FUNCTION roomqc_control.guard_deployment_resolution() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
  RAISE EXCEPTION 'DEPLOYMENT_RESOLUTION_IMMUTABLE' USING ERRCODE='42501';
END $$;
CREATE TRIGGER deployment_resolution_immutable BEFORE UPDATE OR DELETE ON roomqc_control.deployment_resolutions
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_deployment_resolution();
REVOKE ALL ON roomqc_control.deployment_resolutions FROM PUBLIC;
REVOKE ALL ON FUNCTION roomqc_control.apply_deployment_resolution() FROM PUBLIC;
REVOKE ALL ON FUNCTION roomqc_control.guard_deployment_resolution() FROM PUBLIC;
GRANT SELECT ON roomqc_control.deployment_resolutions TO roomqc_control_api,roomqc_control_deployer;
GRANT INSERT ON roomqc_control.deployment_resolutions TO roomqc_control_deployer;
