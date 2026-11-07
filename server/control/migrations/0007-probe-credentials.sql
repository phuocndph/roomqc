-- Directory only. Never install this schema into a hotel/Supabase backend.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_probe_runtime') THEN
    CREATE ROLE roomqc_control_probe_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_probe_installer') THEN
    CREATE ROLE roomqc_control_probe_installer NOLOGIN;
  END IF;
END $$;
CREATE TABLE roomqc_control.probe_credentials (
  cluster_id text PRIMARY KEY REFERENCES roomqc_control.clusters(id),
  credential_ref text NOT NULL CHECK (credential_ref ~ '^[a-z][a-z0-9-]{1,63}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  state text NOT NULL CHECK (state IN ('ready','refreshing','needs_recovery')),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope)='object' AND octet_length(envelope::text)<=65536),
  auth_user_id uuid NOT NULL, auth_session_id uuid NOT NULL,
  auth_expires_at timestamptz NOT NULL, probe_expires_at timestamptz NOT NULL,
  lease_id uuid, lease_until timestamptz,
  reason_code text CHECK (reason_code IN ('REFRESH_UNCERTAIN','REFRESH_LEASE_EXPIRED')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT probe_credential_state CHECK (
    (state='ready' AND lease_id IS NULL AND lease_until IS NULL AND reason_code IS NULL)
    OR (state='refreshing' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND reason_code IS NULL)
    OR (state='needs_recovery' AND lease_id IS NULL AND lease_until IS NULL AND reason_code IS NOT NULL)
  )
);
REVOKE ALL ON roomqc_control.probe_credentials FROM PUBLIC,
  roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_probe_runtime,roomqc_control_probe_installer;
GRANT SELECT ON roomqc_control.schema_migrations TO roomqc_control_probe_runtime,roomqc_control_probe_installer;
GRANT SELECT(id,api_url,credential_ref,inventory_ref,release_id,schema_manifest_hash)
  ON roomqc_control.clusters TO roomqc_control_probe_runtime,roomqc_control_probe_installer;
GRANT UPDATE(updated_at) ON roomqc_control.probe_credentials TO roomqc_control_probe_runtime;
GRANT SELECT ON roomqc_control.probe_credentials TO roomqc_control_probe_runtime,roomqc_control_probe_installer;
GRANT INSERT,UPDATE ON roomqc_control.probe_credentials TO roomqc_control_probe_installer;
GRANT UPDATE(revision,state,envelope,auth_expires_at,probe_expires_at,lease_id,lease_until,reason_code)
  ON roomqc_control.probe_credentials TO roomqc_control_probe_runtime;
GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_probe_runtime,roomqc_control_probe_installer;
GRANT USAGE ON SEQUENCE roomqc_control.cluster_events_id_seq TO roomqc_control_probe_runtime,roomqc_control_probe_installer;
