-- Directory-only inventory. This role cannot enqueue, close or settle setup.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_backfill_reader') THEN
    CREATE ROLE roomqc_control_backfill_reader NOLOGIN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_backfill_reader'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member='roomqc_control_backfill_reader'::regrole) THEN
    RAISE EXCEPTION 'SETUP_BACKFILL_ROLE_UNSAFE';
  END IF;
END $$;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_backfill_reader;
GRANT SELECT(version,checksum) ON roomqc_control.schema_migrations TO roomqc_control_backfill_reader;
GRANT SELECT(id,cluster_id,owner_id,tenant_id,hotel_id,status,routing_version,created_at,updated_at)
  ON roomqc_control.workspaces TO roomqc_control_backfill_reader;
GRANT SELECT(id,workspace_id,state,attempts,lease_token,lease_until,expected_routing_version,dispatch_id,
  next_attempt_at,created_at,updated_at,max_attempts,deadline_at)
  ON roomqc_control.provisioning_jobs TO roomqc_control_backfill_reader;
GRANT SELECT(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256,terminal_state,
  tenant_id,hotel_id,created_at,settled_at)
  ON roomqc_control.setup_dispatches TO roomqc_control_backfill_reader;
GRANT SELECT(id,api_url,status,credential_ref,host_id,inventory_ref)
  ON roomqc_control.clusters TO roomqc_control_backfill_reader;
GRANT SELECT(id,environment) ON roomqc_control.hosts TO roomqc_control_backfill_reader;
GRANT SELECT(cluster_id,approval_id,epoch,row_version,state,updated_at)
  ON roomqc_control.release_authority TO roomqc_control_backfill_reader;
GRANT SELECT(approval_id,cluster_id,epoch,envelope_digest,key_fingerprint,host_id,inventory_ref,
  environment,not_before_ms,expires_at_ms)
  ON roomqc_control.release_approvals TO roomqc_control_backfill_reader;
GRANT SELECT(key_fingerprint) ON roomqc_control.release_key_revocations TO roomqc_control_backfill_reader;
-- Read-only server identity is needed to reject a DSN that points at another
-- server with the same database name/OID. No pg_monitor/admin membership.
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO roomqc_control_backfill_reader;
