-- Directory commands for platform actors. Operator backfill journals stay separate.
-- Retain cancelled/finished attempt history when an operator starts ONE bounded
-- recovery cycle for the SAME immutable dispatch. Only one live job is allowed
-- per dispatch, in addition to the existing live workspace/kind constraint.
DROP INDEX roomqc_control.provisioning_jobs_dispatch_idx;
CREATE UNIQUE INDEX provisioning_jobs_dispatch_idx ON roomqc_control.provisioning_jobs(dispatch_id)
  WHERE dispatch_id IS NOT NULL AND state NOT IN ('succeeded','cancelled');
CREATE TABLE roomqc_control.workspace_recheck_commands (
  id uuid PRIMARY KEY,actor_id uuid NOT NULL,authority_cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  workspace_id uuid NOT NULL REFERENCES roomqc_control.workspaces(id),operation text NOT NULL DEFAULT 'recheck' CHECK(operation='recheck'),
  idempotency_key uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,authority_cluster_id,operation,workspace_id,idempotency_key)
);
CREATE TABLE roomqc_control.workspace_recheck_cycles (
  workspace_id uuid NOT NULL REFERENCES roomqc_control.workspaces(id),dispatch_id uuid NOT NULL REFERENCES roomqc_control.setup_dispatches(id),
  job_id uuid NOT NULL UNIQUE REFERENCES roomqc_control.provisioning_jobs(id),
  previous_job_id uuid REFERENCES roomqc_control.provisioning_jobs(id),
  command_id uuid NOT NULL REFERENCES roomqc_control.workspace_recheck_commands(id) DEFERRABLE INITIALLY DEFERRED,
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts=3),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL,
  PRIMARY KEY(workspace_id,dispatch_id),CHECK(deadline_at>created_at AND deadline_at<=created_at+interval '15 minutes')
);
CREATE TABLE roomqc_control.workspace_recheck_events (
  command_id uuid PRIMARY KEY REFERENCES roomqc_control.workspace_recheck_commands(id),
  workspace_id uuid NOT NULL REFERENCES roomqc_control.workspaces(id),actor_id uuid NOT NULL,request_id uuid NOT NULL,
  outcome text NOT NULL,reason_code text NOT NULL CHECK(reason_code ~ '^SETUP_[A-Z0-9_]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON roomqc_control.workspace_recheck_commands,roomqc_control.workspace_recheck_cycles,roomqc_control.workspace_recheck_events FROM PUBLIC;
GRANT SELECT,INSERT ON roomqc_control.workspace_recheck_commands,roomqc_control.workspace_recheck_cycles,roomqc_control.workspace_recheck_events TO roomqc_control_api;
-- API already has table access. Share only the canonical, microsecond-preserving
-- invoker projection, never an operator command or operator identity/authority.
GRANT EXECUTE ON FUNCTION roomqc_control.setup_backfill_snapshot_value(uuid,text) TO roomqc_control_api;
GRANT SELECT ON roomqc_control.setup_recovery_attempts TO roomqc_control_api;
GRANT UPDATE(outcome,error_code,finished_at) ON roomqc_control.setup_recovery_attempts TO roomqc_control_api;
CREATE FUNCTION roomqc_control.guard_workspace_recheck_history() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
  RAISE EXCEPTION 'WORKSPACE_RECHECK_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION roomqc_control.guard_workspace_recheck_history() FROM PUBLIC;
CREATE TRIGGER workspace_recheck_commands_immutable BEFORE UPDATE OR DELETE ON roomqc_control.workspace_recheck_commands
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_workspace_recheck_history();
CREATE TRIGGER workspace_recheck_cycles_immutable BEFORE UPDATE OR DELETE ON roomqc_control.workspace_recheck_cycles
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_workspace_recheck_history();
CREATE TRIGGER workspace_recheck_events_immutable BEFORE UPDATE OR DELETE ON roomqc_control.workspace_recheck_events
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_workspace_recheck_history();
