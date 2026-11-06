-- Dedicated maintenance session only. Runtime receives neither monitor role
-- nor direct catalog helper privileges; the private projection has no inputs.
DO $maintenance$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END $maintenance$;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO roomqc_setup_credential_owner;
GRANT USAGE ON SCHEMA supabase_migrations TO roomqc_setup_credential_owner;
GRANT SELECT(version) ON supabase_migrations.schema_migrations TO roomqc_setup_credential_owner;
GRANT SELECT ON private.roomqc_release_manifest TO roomqc_setup_credential_owner;
-- A table grant alone remains filtered by RLS. Only the NOLOGIN function
-- owner may read this singleton; callers receive no direct metadata access.
CREATE POLICY roomqc_credential_release_read ON private.roomqc_release_manifest
  FOR SELECT TO roomqc_setup_credential_owner USING (singleton);
-- The catalog-only partition helper resolves realtime.messages by name.
-- USAGE permits name resolution; it grants no table access or data writes.
DO $metadata$ BEGIN
  IF pg_catalog.to_regnamespace('realtime') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA realtime TO roomqc_setup_credential_owner;
  END IF;
END $metadata$;
GRANT EXECUTE ON FUNCTION private.roomqc_schema_fingerprint(),private.roomqc_sorted_acl(aclitem[]),
  private.roomqc_managed_realtime_partition_ids(),private.roomqc_partition_column_shape(oid),
  private.roomqc_partition_index_shape(oid) TO roomqc_setup_credential_owner;

CREATE FUNCTION roomqc_setup_admin.preflight() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $preflight$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_setup_credential_operator(pg_catalog.pg_has_role(session_user,'roomqc_setup_credential_issuer','USAGE'));
  SELECT pg_catalog.jsonb_build_object('contractVersion',1,
    'systemIdentifier',s.system_identifier::text,'databaseOid',d.oid::text,'databaseName',d.datname,
    'role',session_user::text,'roleConnectionLimit',r.rolconnlimit,'inRecovery',pg_catalog.pg_is_in_recovery(),
    'readOnly',pg_catalog.current_setting('transaction_read_only')='on','observedAt',pg_catalog.clock_timestamp(),
    'maxConnections',pg_catalog.current_setting('max_connections')::integer,
    'reservedConnections',pg_catalog.current_setting('superuser_reserved_connections')::integer
      +COALESCE(pg_catalog.current_setting('reserved_connections',true),'0')::integer,
    'capability',CASE WHEN pg_catalog.pg_has_role(session_user,'roomqc_setup_credential_issuer','USAGE') THEN 'issuer' ELSE 'installer' END,
    'memberships',(SELECT count(*) FROM pg_catalog.pg_auth_members a WHERE a.member=r.oid),
    'schemaFingerprintVersion',3,'schemaManifestHash',private.roomqc_schema_fingerprint(),
    'manifest',(SELECT pg_catalog.jsonb_build_object('contractVersion',m.contract_version,'schemaFingerprintVersion',m.schema_fingerprint_version,
      'clusterId',m.cluster_id,'releaseId',m.release_id,'artifactDigest',m.artifact_digest,
      'frontendArtifactDigest',m.frontend_artifact_digest,'migrationSetHash',m.migration_set_hash,'expectedSchemaManifestHash',m.expected_schema_hash)
      FROM private.roomqc_release_manifest m WHERE m.singleton)) INTO STRICT v_result
  FROM pg_catalog.pg_control_system() s JOIN pg_catalog.pg_database d ON d.datname=pg_catalog.current_database()
  JOIN pg_catalog.pg_roles r ON r.rolname=session_user;
  RETURN v_result;
END $preflight$;
REVOKE ALL ON FUNCTION roomqc_setup_admin.preflight() FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;
GRANT EXECUTE ON FUNCTION roomqc_setup_admin.preflight() TO roomqc_setup_credential_issuer,roomqc_setup_credential_installer;
GRANT CREATE ON SCHEMA roomqc_setup_admin TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.preflight() OWNER TO roomqc_setup_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_setup_admin FROM roomqc_setup_credential_owner;
