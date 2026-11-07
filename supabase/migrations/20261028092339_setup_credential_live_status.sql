-- Private maintenance projection. Historical command receipts are never used
-- as current readiness. No signer/bearer, Auth identity or business row returned.
DO $maintenance$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$maintenance$;
CREATE FUNCTION roomqc_setup_admin.status() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $status$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_setup_credential_operator(pg_catalog.pg_has_role(session_user,'roomqc_setup_credential_issuer','USAGE'));
  -- A single statement snapshot for authority, version and credential. The
  -- observation is informational and does not authorize a later mutation.
  WITH observation AS MATERIALIZED (SELECT pg_catalog.clock_timestamp() AS now),
  state AS (
    SELECT m.version,m.release_sha256,a.cluster_id,a.binding_sha256,c.id,c.cluster_id AS credential_cluster,
      c.binding_sha256 AS credential_binding,c.not_before,c.expires_at,c.revoked_at,c.retire_after,o.now,
      CASE WHEN a.singleton IS NULL OR m.release_sha256 IS NULL THEN 'UNBOUND'
        WHEN m.head_credential_id IS NULL THEN 'CREDENTIAL_MISSING'
        WHEN c.id IS NULL OR c.cluster_id IS DISTINCT FROM a.cluster_id OR c.binding_sha256 IS DISTINCT FROM a.binding_sha256 THEN 'CREDENTIAL_TARGET_MISMATCH'
        WHEN c.revoked_at IS NOT NULL THEN 'CREDENTIAL_REVOKED'
        WHEN c.not_before>o.now THEN 'CREDENTIAL_NOT_YET_VALID'
        WHEN c.expires_at<=o.now THEN 'CREDENTIAL_EXPIRED'
        WHEN c.retire_after IS NOT NULL AND c.retire_after<=o.now THEN 'CREDENTIAL_RETIRED'
        ELSE NULL END AS reason
    FROM private.setup_recovery_management m CROSS JOIN observation o
    LEFT JOIN private.setup_recovery_authority a ON a.singleton
    LEFT JOIN private.setup_recovery_credentials c ON c.id=m.head_credential_id WHERE m.singleton
  )
  SELECT pg_catalog.jsonb_build_object('contractVersion',1,'version',version,'clusterId',cluster_id,
    'bindingSha256',binding_sha256,'releaseSha256',release_sha256,'observedAt',now,
    'ready',reason IS NULL,'reasonCode',reason,'historicalResult',false,
    'credential',CASE WHEN id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('id',id,
      'notBefore',not_before,'expiresAt',expires_at,'revokedAt',revoked_at,'retireAfter',retire_after) END)
    INTO STRICT v_result FROM state;
  RETURN v_result;
END;
$status$;
REVOKE ALL ON FUNCTION roomqc_setup_admin.status() FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;
GRANT EXECUTE ON FUNCTION roomqc_setup_admin.status() TO roomqc_setup_credential_issuer,roomqc_setup_credential_installer;
GRANT CREATE ON SCHEMA roomqc_setup_admin TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.status() OWNER TO roomqc_setup_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_setup_admin FROM roomqc_setup_credential_owner;
