-- Only release/target metadata, never workspace identities or hotel data.
DO $observer$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_setup_credential_observer') THEN
    CREATE ROLE roomqc_control_setup_credential_observer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_setup_credential_observer'
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members a JOIN pg_catalog.pg_roles r ON r.oid=a.member
      WHERE r.rolname='roomqc_control_setup_credential_observer') THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_OBSERVER_UNSAFE' USING ERRCODE='42501';
  END IF;
END $observer$;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_setup_credential_observer;
GRANT SELECT(version,checksum) ON roomqc_control.schema_migrations TO roomqc_control_setup_credential_observer;
GRANT SELECT ON roomqc_control.release_approvals,roomqc_control.release_authority,roomqc_control.release_key_revocations
  TO roomqc_control_setup_credential_observer;
GRANT SELECT(id,api_url,host_id,inventory_ref,credential_ref) ON roomqc_control.clusters TO roomqc_control_setup_credential_observer;
GRANT SELECT(id,environment) ON roomqc_control.hosts TO roomqc_control_setup_credential_observer;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO roomqc_control_setup_credential_observer;
