-- Group roles contain no credentials. Provision LOGIN members separately.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_api') THEN CREATE ROLE roomqc_control_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_worker') THEN CREATE ROLE roomqc_control_worker NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_metrics') THEN CREATE ROLE roomqc_control_metrics NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;
GRANT SELECT ON roomqc_control.schema_migrations TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;
GRANT SELECT ON roomqc_control.clusters,roomqc_control.hosts,roomqc_control.cluster_policies,
  roomqc_control.cluster_health_current,roomqc_control.cluster_admission_current,roomqc_control.backup_runs,
  roomqc_control.signup_affinities,roomqc_control.signup_affinity_conflicts,roomqc_control.cluster_events,
  roomqc_control.alerts TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;
GRANT SELECT,INSERT,UPDATE ON roomqc_control.workspaces,roomqc_control.support_actions,
  roomqc_control.control_commands,roomqc_control.provisioning_jobs TO roomqc_control_api;
GRANT SELECT,INSERT ON roomqc_control.attempts TO roomqc_control_api,roomqc_control_worker;
GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;
GRANT INSERT,UPDATE ON roomqc_control.hosts,roomqc_control.clusters,roomqc_control.cluster_policies,
  roomqc_control.signup_affinities TO roomqc_control_api;
GRANT SELECT ON roomqc_control.workspaces TO roomqc_control_worker;
GRANT UPDATE(tenant_id,hotel_id,owner_id,status,expires_at,last_error_code,updated_at) ON roomqc_control.workspaces TO roomqc_control_worker;
GRANT SELECT,INSERT,UPDATE ON roomqc_control.provisioning_jobs TO roomqc_control_worker;
GRANT INSERT,UPDATE ON roomqc_control.cluster_health_current,roomqc_control.cluster_admission_current,
  roomqc_control.alerts TO roomqc_control_metrics;
GRANT USAGE ON SEQUENCE roomqc_control.attempts_id_seq TO roomqc_control_api,roomqc_control_worker;
GRANT USAGE ON SEQUENCE roomqc_control.cluster_events_id_seq TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;
ALTER DEFAULT PRIVILEGES IN SCHEMA roomqc_control REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA roomqc_control REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA roomqc_control REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
