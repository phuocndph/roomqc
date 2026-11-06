-- Automatic rotation may only replace a live head. Manual bootstrap/recovery
-- remains the separate issue capability; no new LOGIN or public API grant.
DO $maintenance$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$maintenance$;

CREATE FUNCTION roomqc_setup_admin.rotate(p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rotate$
DECLARE
  v_state private.setup_recovery_management%ROWTYPE;
  v_authority private.setup_recovery_authority%ROWTYPE;
  v_credential private.setup_recovery_credentials%ROWTYPE;
  v_now timestamptz;
BEGIN
  PERFORM private.assert_setup_credential_operator(true);
  PERFORM pg_catalog.pg_advisory_xact_lock(727012);
  -- Replay precedes current-head checks. The existing command engine validates
  -- exact caller/key/body and returns the original immutable receipt.
  IF EXISTS(SELECT 1 FROM private.setup_recovery_commands WHERE key=(p_command->>'key')::uuid) THEN
    RETURN private.setup_recovery_credential_command(p_command,'issue');
  END IF;
  SELECT * INTO STRICT v_state FROM private.setup_recovery_management WHERE singleton FOR UPDATE;
  IF v_state.version IS DISTINCT FROM (p_command->>'expectedVersion')::bigint THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_VERSION_CONFLICT';
  END IF;
  SELECT * INTO v_authority FROM private.setup_recovery_authority WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_authority.cluster_id IS DISTINCT FROM p_command->>'clusterId'
    OR v_authority.binding_sha256 IS DISTINCT FROM p_command->>'bindingSha256'
    OR v_state.release_sha256 IS DISTINCT FROM p_command->>'releaseSha256' THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_TARGET_CONFLICT';
  END IF;
  IF v_state.head_credential_id IS DISTINCT FROM (p_command->>'predecessorId')::uuid THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_PREDECESSOR_CONFLICT';
  END IF;
  SELECT * INTO v_credential FROM private.setup_recovery_credentials WHERE id=v_state.head_credential_id FOR UPDATE;
  -- This locked DB-clock check is the authorization point for a new rotation.
  -- Concurrent revoke/rotation uses the same mutex and authority/credential
  -- locks. A daemon restart cannot revive an expired or revoked predecessor.
  v_now:=pg_catalog.clock_timestamp();
  IF NOT FOUND OR v_credential.cluster_id IS DISTINCT FROM v_authority.cluster_id
    OR v_credential.binding_sha256 IS DISTINCT FROM v_authority.binding_sha256
    OR v_credential.revoked_at IS NOT NULL OR v_credential.not_before>v_now
    OR v_credential.expires_at<=v_now
    OR (v_credential.retire_after IS NOT NULL AND v_credential.retire_after<=v_now) THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_ROTATION_HEAD_UNREADY';
  END IF;
  RETURN private.setup_recovery_credential_command(p_command,'issue');
END;
$rotate$;
REVOKE ALL ON FUNCTION roomqc_setup_admin.rotate(jsonb) FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery,roomqc_setup_credential_installer;
GRANT EXECUTE ON FUNCTION roomqc_setup_admin.rotate(jsonb) TO roomqc_setup_credential_issuer;
GRANT CREATE ON SCHEMA roomqc_setup_admin TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.rotate(jsonb) OWNER TO roomqc_setup_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_setup_admin FROM roomqc_setup_credential_owner;
