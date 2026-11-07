-- Summary capability maintenance, separate from setup and from the Data API.
-- Credential management is a maintenance interface, never a Data API schema.
-- This migration grants no LOGIN, password, authenticator membership or runtime
-- permission. Dedicated operator logins must be provisioned outside this file.
DO $maintenance$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$maintenance$;
CREATE ROLE roomqc_summary_credential_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE roomqc_summary_credential_issuer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE roomqc_summary_credential_installer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA roomqc_summary_admin;
REVOKE ALL ON SCHEMA roomqc_summary_admin FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;
GRANT USAGE ON SCHEMA roomqc_summary_admin TO roomqc_summary_credential_issuer,roomqc_summary_credential_installer;
GRANT USAGE ON SCHEMA private TO roomqc_summary_credential_owner;

ALTER TABLE private.tenant_summary_credentials ADD COLUMN retire_after timestamptz;
ALTER TABLE private.tenant_summary_credentials ADD CONSTRAINT tenant_summary_retirement_bound
  CHECK(retire_after IS NULL OR retire_after<=expires_at);

CREATE TABLE private.tenant_summary_management (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version bigint NOT NULL CHECK(version>=0 AND version<9007199254740990),
  release_sha256 text CHECK(release_sha256 ~ '^[a-f0-9]{64}$'),
  head_credential_id uuid REFERENCES private.tenant_summary_credentials(id)
);
INSERT INTO private.tenant_summary_management(singleton,version) VALUES(true,0);
CREATE TABLE private.tenant_summary_commands (
  key uuid PRIMARY KEY,
  caller name NOT NULL,
  request jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(request)='object'),
  result jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TABLE private.tenant_summary_credential_audit (
  command_key uuid PRIMARY KEY REFERENCES private.tenant_summary_commands(key),
  caller name NOT NULL,
  operation text NOT NULL CHECK(operation IN ('bind','issue','revoke')),
  reason text NOT NULL,
  resulting_version bigint NOT NULL,
  affected_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.tenant_summary_management ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tenant_summary_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tenant_summary_credential_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tenant_summary_management,private.tenant_summary_commands,private.tenant_summary_credential_audit
  FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary,roomqc_summary_credential_issuer,roomqc_summary_credential_installer;
-- The owner of the narrow definer interface has no membership in migration,
-- Auth, service-role or application roles and no table deletion privileges.
GRANT SELECT,INSERT,UPDATE ON private.tenant_summary_management TO roomqc_summary_credential_owner;
GRANT SELECT,INSERT ON private.tenant_summary_commands,private.tenant_summary_credential_audit TO roomqc_summary_credential_owner;
GRANT SELECT,INSERT,UPDATE ON private.tenant_summary_authority TO roomqc_summary_credential_owner;
GRANT SELECT,INSERT ON private.tenant_summary_credentials TO roomqc_summary_credential_owner;
GRANT UPDATE(revoked_at,retire_after) ON private.tenant_summary_credentials TO roomqc_summary_credential_owner;
CREATE POLICY summary_management_owner ON private.tenant_summary_management TO roomqc_summary_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY summary_command_owner ON private.tenant_summary_commands TO roomqc_summary_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY summary_audit_owner ON private.tenant_summary_credential_audit TO roomqc_summary_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY summary_authority_owner ON private.tenant_summary_authority TO roomqc_summary_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY summary_credential_owner ON private.tenant_summary_credentials TO roomqc_summary_credential_owner USING(true) WITH CHECK(true);

CREATE FUNCTION private.tenant_summary_history_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $immutable$
BEGIN
  RAISE EXCEPTION 'SUMMARY_CREDENTIAL_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END;
$immutable$;
REVOKE ALL ON FUNCTION private.tenant_summary_history_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tenant_summary_command_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON private.tenant_summary_commands
  FOR EACH STATEMENT EXECUTE FUNCTION private.tenant_summary_history_immutable();
CREATE TRIGGER tenant_summary_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON private.tenant_summary_credential_audit
  FOR EACH STATEMENT EXECUTE FUNCTION private.tenant_summary_history_immutable();

CREATE FUNCTION private.assert_summary_credential_operator(p_issuer boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $operator$
DECLARE v_role text:=CASE WHEN p_issuer THEN 'roomqc_summary_credential_issuer' ELSE 'roomqc_summary_credential_installer' END;
BEGIN
  IF NOT pg_catalog.pg_has_role(session_user,v_role,'USAGE')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_catalog.pg_has_role(session_user,r.oid,'MEMBER')
      AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
        OR r.rolname IN ('anon','authenticated','service_role','authenticator','roomqc_tenant_summary','roomqc_summary_credential_owner')))
    OR (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user))<>1
    OR (pg_catalog.pg_has_role(session_user,'roomqc_summary_credential_issuer','USAGE')
      AND pg_catalog.pg_has_role(session_user,'roomqc_summary_credential_installer','USAGE')) THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_OPERATOR_DENIED' USING ERRCODE='42501';
  END IF;
END;
$operator$;
REVOKE ALL ON FUNCTION private.assert_summary_credential_operator(boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.assert_summary_credential_operator(boolean) TO roomqc_summary_credential_owner;

CREATE FUNCTION private.tenant_summary_credential_command(p_command jsonb,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $command$
DECLARE
  v_keys text[];v_expected_keys text[];v_key uuid;v_request uuid;v_predecessor uuid;v_id uuid;
  v_state private.tenant_summary_management%ROWTYPE;v_authority private.tenant_summary_authority%ROWTYPE;
  v_previous private.tenant_summary_commands%ROWTYPE;v_credential private.tenant_summary_credentials%ROWTYPE;
  v_expected bigint;v_ttl integer;v_overlap integer;v_now timestamptz;v_deadline timestamptz;
  v_result jsonb;v_affected uuid[]:=ARRAY[]::uuid[];v_had_authority boolean;
BEGIN
  PERFORM private.assert_summary_credential_operator(p_operation='issue');
  IF p_operation NOT IN ('bind','issue','revoke') OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_COMMAND_INVALID';
  END IF;
  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_keys FROM pg_catalog.jsonb_object_keys(p_command) k;
  v_expected_keys:=ARRAY['version','operation','key','requestId','reason','expectedVersion','clusterId','bindingSha256','releaseSha256'];
  v_expected_keys:=v_expected_keys||CASE p_operation WHEN 'issue' THEN ARRAY['predecessorId','ttlSeconds','overlapSeconds','signerAlgorithm','signerFingerprint']
    WHEN 'bind' THEN ARRAY['expectedClusterId','expectedBindingSha256'] ELSE ARRAY['credentialId'] END;
  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_expected_keys FROM pg_catalog.unnest(v_expected_keys) k;
  IF v_keys IS DISTINCT FROM v_expected_keys OR p_command->'version' IS DISTINCT FROM '1'::jsonb
    OR p_command->>'operation' IS DISTINCT FROM p_operation
    OR pg_catalog.jsonb_typeof(p_command->'key') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_command->'requestId') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string'
    OR pg_catalog.length(p_command->>'reason') NOT BETWEEN 5 AND 1000
    OR pg_catalog.btrim(p_command->>'reason') IS DISTINCT FROM p_command->>'reason'
    OR pg_catalog.jsonb_typeof(p_command->'expectedVersion') IS DISTINCT FROM 'number'
    OR COALESCE(p_command->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,15})$'
    OR pg_catalog.jsonb_typeof(p_command->'clusterId') IS DISTINCT FROM 'string'
    OR COALESCE(p_command->>'clusterId','') !~ '^[a-z][a-z0-9-]{1,39}$'
    OR pg_catalog.jsonb_typeof(p_command->'bindingSha256') IS DISTINCT FROM 'string'
    OR COALESCE(p_command->>'bindingSha256','') !~ '^[a-f0-9]{64}$'
    OR pg_catalog.jsonb_typeof(p_command->'releaseSha256') IS DISTINCT FROM 'string'
    OR COALESCE(p_command->>'releaseSha256','') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_COMMAND_INVALID';
  END IF;
  BEGIN
    v_key:=(p_command->>'key')::uuid;v_request:=(p_command->>'requestId')::uuid;
    v_expected:=(p_command->>'expectedVersion')::bigint;
    IF v_key IS NULL OR v_request IS NULL OR v_expected>=9007199254740990 THEN RAISE invalid_text_representation; END IF;
    IF p_operation='issue' THEN
      IF pg_catalog.jsonb_typeof(p_command->'predecessorId') NOT IN ('null','string')
        OR pg_catalog.jsonb_typeof(p_command->'ttlSeconds') IS DISTINCT FROM 'number'
        OR COALESCE(p_command->>'ttlSeconds','') !~ '^[0-9]{1,4}$'
        OR pg_catalog.jsonb_typeof(p_command->'overlapSeconds') IS DISTINCT FROM 'number'
        OR COALESCE(p_command->>'overlapSeconds','') !~ '^[0-9]{1,2}$'
        OR COALESCE(p_command->>'signerAlgorithm','') NOT IN ('HS256','RS256','ES256')
        OR pg_catalog.jsonb_typeof(p_command->'signerFingerprint') IS DISTINCT FROM 'string'
        OR COALESCE(p_command->>'signerFingerprint','') !~ '^[a-f0-9]{64}$' THEN RAISE invalid_text_representation; END IF;
      v_predecessor:=(p_command->>'predecessorId')::uuid;
      v_ttl:=(p_command->>'ttlSeconds')::integer;v_overlap:=(p_command->>'overlapSeconds')::integer;
      IF v_ttl NOT BETWEEN 120 AND 3600 OR v_overlap NOT BETWEEN 10 AND 60 THEN RAISE invalid_text_representation; END IF;
    ELSIF p_operation='revoke' THEN
      IF pg_catalog.jsonb_typeof(p_command->'credentialId') IS DISTINCT FROM 'string' THEN RAISE invalid_text_representation; END IF;
      v_id:=(p_command->>'credentialId')::uuid;IF v_id IS NULL THEN RAISE invalid_text_representation; END IF;
    ELSE
      IF pg_catalog.jsonb_typeof(p_command->'expectedClusterId') NOT IN ('null','string')
        OR pg_catalog.jsonb_typeof(p_command->'expectedBindingSha256') NOT IN ('null','string') THEN RAISE invalid_text_representation; END IF;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'SUMMARY_CREDENTIAL_COMMAND_INVALID';
  END;
  -- One bounded maintenance writer per business database. Runtime operations
  -- take authority then credential SHARE locks, in the same order below.
  PERFORM pg_catalog.pg_advisory_xact_lock(727013);
  SELECT * INTO v_previous FROM private.tenant_summary_commands WHERE key=v_key;
  IF FOUND THEN
    IF v_previous.caller IS DISTINCT FROM session_user OR v_previous.request IS DISTINCT FROM p_command THEN
      RAISE EXCEPTION 'SUMMARY_CREDENTIAL_KEY_CONFLICT';
    END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO STRICT v_state FROM private.tenant_summary_management WHERE singleton FOR UPDATE;
  IF v_state.version<>v_expected THEN RAISE EXCEPTION 'SUMMARY_CREDENTIAL_VERSION_CONFLICT'; END IF;
  SELECT * INTO v_authority FROM private.tenant_summary_authority WHERE singleton FOR UPDATE;
  v_had_authority:=FOUND;
  v_now:=pg_catalog.date_trunc('second',pg_catalog.clock_timestamp());
  IF p_operation='bind' THEN
    IF (v_had_authority AND (v_authority.cluster_id IS DISTINCT FROM p_command->>'expectedClusterId'
      OR v_authority.binding_sha256 IS DISTINCT FROM p_command->>'expectedBindingSha256'))
      OR (NOT v_had_authority AND (p_command->'expectedClusterId'<>'null'::jsonb OR p_command->'expectedBindingSha256'<>'null'::jsonb)) THEN
      RAISE EXCEPTION 'SUMMARY_CREDENTIAL_TARGET_CONFLICT';
    END IF;
    WITH changed AS (UPDATE private.tenant_summary_credentials SET revoked_at=pg_catalog.clock_timestamp()
      WHERE revoked_at IS NULL RETURNING id) SELECT COALESCE(pg_catalog.array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO v_affected FROM changed;
    INSERT INTO private.tenant_summary_authority(singleton,cluster_id,binding_sha256)
      VALUES(true,p_command->>'clusterId',p_command->>'bindingSha256')
      ON CONFLICT(singleton) DO UPDATE SET cluster_id=EXCLUDED.cluster_id,binding_sha256=EXCLUDED.binding_sha256;
    UPDATE private.tenant_summary_management SET head_credential_id=NULL,release_sha256=p_command->>'releaseSha256' WHERE singleton;
  ELSE
    IF NOT v_had_authority OR v_authority.cluster_id IS DISTINCT FROM p_command->>'clusterId'
      OR v_authority.binding_sha256 IS DISTINCT FROM p_command->>'bindingSha256'
      OR v_state.release_sha256 IS DISTINCT FROM p_command->>'releaseSha256' THEN RAISE EXCEPTION 'SUMMARY_CREDENTIAL_TARGET_CONFLICT'; END IF;
    IF p_operation='issue' THEN
      IF v_state.head_credential_id IS DISTINCT FROM v_predecessor THEN RAISE EXCEPTION 'SUMMARY_CREDENTIAL_PREDECESSOR_CONFLICT'; END IF;
      IF EXISTS(SELECT 1 FROM private.tenant_summary_credentials WHERE id IS DISTINCT FROM v_predecessor AND revoked_at IS NULL
        AND expires_at>pg_catalog.clock_timestamp() AND (retire_after IS NULL OR retire_after>pg_catalog.clock_timestamp())) THEN
        RAISE EXCEPTION 'SUMMARY_CREDENTIAL_OVERLAP_BUSY';
      END IF;
      IF v_predecessor IS NOT NULL THEN
        SELECT * INTO STRICT v_credential FROM private.tenant_summary_credentials WHERE id=v_predecessor FOR UPDATE;
        v_deadline:=LEAST(v_credential.expires_at,COALESCE(v_credential.retire_after,v_credential.expires_at),v_now+v_overlap*interval '1 second');
        UPDATE private.tenant_summary_credentials SET retire_after=v_deadline WHERE id=v_predecessor;
      END IF;
      v_id:=pg_catalog.gen_random_uuid();
      INSERT INTO private.tenant_summary_credentials(id,cluster_id,binding_sha256,not_before,expires_at)
        VALUES(v_id,v_authority.cluster_id,v_authority.binding_sha256,v_now,v_now+v_ttl*interval '1 second');
      UPDATE private.tenant_summary_management SET head_credential_id=v_id WHERE singleton;
      v_affected:=ARRAY[v_id];
    ELSE
      SELECT * INTO v_credential FROM private.tenant_summary_credentials WHERE id=v_id FOR UPDATE;
      IF NOT FOUND OR v_credential.cluster_id<>v_authority.cluster_id OR v_credential.binding_sha256<>v_authority.binding_sha256 THEN
        RAISE EXCEPTION 'SUMMARY_CREDENTIAL_TARGET_CONFLICT';
      END IF;
      UPDATE private.tenant_summary_credentials SET revoked_at=COALESCE(revoked_at,pg_catalog.clock_timestamp()) WHERE id=v_id;
      v_affected:=ARRAY[v_id];
    END IF;
  END IF;
  UPDATE private.tenant_summary_management SET version=version+1 WHERE singleton RETURNING version INTO v_expected;
  v_result:=pg_catalog.jsonb_build_object('commandId',v_key,'operation',p_operation,'version',v_expected,
    'clusterId',p_command->>'clusterId','bindingSha256',p_command->>'bindingSha256','releaseSha256',p_command->>'releaseSha256',
    'credentialId',CASE WHEN p_operation='bind' THEN NULL ELSE v_id END,'affectedIds',v_affected,'historicalResult',true);
  IF p_operation='issue' THEN
    v_result:=v_result||pg_catalog.jsonb_build_object('predecessorId',v_predecessor,'overlapDeadline',v_deadline,
      'iat',pg_catalog.date_part('epoch',v_now)::bigint,'exp',pg_catalog.date_part('epoch',v_now)::bigint+v_ttl,
      'signerAlgorithm',p_command->>'signerAlgorithm','signerFingerprint',p_command->>'signerFingerprint');
  END IF;
  INSERT INTO private.tenant_summary_commands(key,caller,request,result) VALUES(v_key,session_user,p_command,v_result);
  INSERT INTO private.tenant_summary_credential_audit(command_key,caller,operation,reason,resulting_version,affected_ids)
    VALUES(v_key,session_user,p_operation,p_command->>'reason',v_expected,v_affected);
  RETURN v_result;
END;
$command$;
REVOKE ALL ON FUNCTION private.tenant_summary_credential_command(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.tenant_summary_credential_command(jsonb,text) TO roomqc_summary_credential_owner;

CREATE FUNCTION roomqc_summary_admin.bind(p_command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $bind$
  SELECT private.tenant_summary_credential_command(p_command,'bind');
$bind$;
CREATE FUNCTION roomqc_summary_admin.issue(p_command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $issue$
  SELECT private.tenant_summary_credential_command(p_command,'issue');
$issue$;
CREATE FUNCTION roomqc_summary_admin.revoke(p_command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $revoke$
  SELECT private.tenant_summary_credential_command(p_command,'revoke');
$revoke$;
CREATE FUNCTION roomqc_summary_admin.receipt(p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $receipt$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_summary_credential_operator(pg_catalog.pg_has_role(session_user,'roomqc_summary_credential_issuer','USAGE'));
  SELECT result INTO v_result FROM private.tenant_summary_commands WHERE key=p_key AND caller=session_user;
  RETURN v_result;
END;
$receipt$;
REVOKE ALL ON FUNCTION roomqc_summary_admin.bind(jsonb),roomqc_summary_admin.issue(jsonb),roomqc_summary_admin.revoke(jsonb),roomqc_summary_admin.receipt(uuid)
  FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;
GRANT EXECUTE ON FUNCTION roomqc_summary_admin.issue(jsonb),roomqc_summary_admin.receipt(uuid) TO roomqc_summary_credential_issuer;
GRANT EXECUTE ON FUNCTION roomqc_summary_admin.bind(jsonb),roomqc_summary_admin.revoke(jsonb),roomqc_summary_admin.receipt(uuid) TO roomqc_summary_credential_installer;
-- ALTER OWNER requires CREATE during transfer only; the final owner cannot
-- install another interface in the maintenance schema.
-- Use the dedicated privileged maintenance session for owner transfer. Never
-- give the ordinary migration login a new role membership to bypass this check.
GRANT CREATE ON SCHEMA roomqc_summary_admin TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.bind(jsonb) OWNER TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.issue(jsonb) OWNER TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.revoke(jsonb) OWNER TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.receipt(uuid) OWNER TO roomqc_summary_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_summary_admin FROM roomqc_summary_credential_owner;
GRANT USAGE ON SCHEMA roomqc_summary_admin TO roomqc_summary_credential_owner;


-- Private maintenance projection. Historical command receipts are never used
-- as current readiness. No signer/bearer, Auth identity or business row returned.
DO $maintenance$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$maintenance$;
CREATE FUNCTION roomqc_summary_admin.status() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $status$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_summary_credential_operator(pg_catalog.pg_has_role(session_user,'roomqc_summary_credential_issuer','USAGE'));
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
    FROM private.tenant_summary_management m CROSS JOIN observation o
    LEFT JOIN private.tenant_summary_authority a ON a.singleton
    LEFT JOIN private.tenant_summary_credentials c ON c.id=m.head_credential_id WHERE m.singleton
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
REVOKE ALL ON FUNCTION roomqc_summary_admin.status() FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;
GRANT EXECUTE ON FUNCTION roomqc_summary_admin.status() TO roomqc_summary_credential_issuer,roomqc_summary_credential_installer;
GRANT CREATE ON SCHEMA roomqc_summary_admin TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.status() OWNER TO roomqc_summary_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_summary_admin FROM roomqc_summary_credential_owner;

-- Automatic rotation may only replace a live head. Manual bootstrap/recovery
-- remains the separate issue capability; no new LOGIN or public API grant.
DO $maintenance$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$maintenance$;

CREATE FUNCTION roomqc_summary_admin.rotate(p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rotate$
DECLARE
  v_state private.tenant_summary_management%ROWTYPE;
  v_authority private.tenant_summary_authority%ROWTYPE;
  v_credential private.tenant_summary_credentials%ROWTYPE;
  v_now timestamptz;
BEGIN
  PERFORM private.assert_summary_credential_operator(true);
  PERFORM pg_catalog.pg_advisory_xact_lock(727013);
  -- Replay precedes current-head checks. The existing command engine validates
  -- exact caller/key/body and returns the original immutable receipt.
  IF EXISTS(SELECT 1 FROM private.tenant_summary_commands WHERE key=(p_command->>'key')::uuid) THEN
    RETURN private.tenant_summary_credential_command(p_command,'issue');
  END IF;
  SELECT * INTO STRICT v_state FROM private.tenant_summary_management WHERE singleton FOR UPDATE;
  IF v_state.version IS DISTINCT FROM (p_command->>'expectedVersion')::bigint THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_VERSION_CONFLICT';
  END IF;
  SELECT * INTO v_authority FROM private.tenant_summary_authority WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_authority.cluster_id IS DISTINCT FROM p_command->>'clusterId'
    OR v_authority.binding_sha256 IS DISTINCT FROM p_command->>'bindingSha256'
    OR v_state.release_sha256 IS DISTINCT FROM p_command->>'releaseSha256' THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_TARGET_CONFLICT';
  END IF;
  IF v_state.head_credential_id IS DISTINCT FROM (p_command->>'predecessorId')::uuid THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_PREDECESSOR_CONFLICT';
  END IF;
  SELECT * INTO v_credential FROM private.tenant_summary_credentials WHERE id=v_state.head_credential_id FOR UPDATE;
  -- This locked DB-clock check is the authorization point for a new rotation.
  -- Concurrent revoke/rotation uses the same mutex and authority/credential
  -- locks. A daemon restart cannot revive an expired or revoked predecessor.
  v_now:=pg_catalog.clock_timestamp();
  IF NOT FOUND OR v_credential.cluster_id IS DISTINCT FROM v_authority.cluster_id
    OR v_credential.binding_sha256 IS DISTINCT FROM v_authority.binding_sha256
    OR v_credential.revoked_at IS NOT NULL OR v_credential.not_before>v_now
    OR v_credential.expires_at<=v_now
    OR (v_credential.retire_after IS NOT NULL AND v_credential.retire_after<=v_now) THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_ROTATION_HEAD_UNREADY';
  END IF;
  RETURN private.tenant_summary_credential_command(p_command,'issue');
END;
$rotate$;
REVOKE ALL ON FUNCTION roomqc_summary_admin.rotate(jsonb) FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary,roomqc_summary_credential_installer;
GRANT EXECUTE ON FUNCTION roomqc_summary_admin.rotate(jsonb) TO roomqc_summary_credential_issuer;
GRANT CREATE ON SCHEMA roomqc_summary_admin TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.rotate(jsonb) OWNER TO roomqc_summary_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_summary_admin FROM roomqc_summary_credential_owner;

CREATE OR REPLACE FUNCTION private.assert_tenant_summary_credential() RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $guard$
DECLARE v_claims jsonb;v_row private.tenant_summary_credentials%ROWTYPE;v_id uuid;v_exp bigint;
BEGIN
  IF pg_catalog.current_setting('role',true) IS DISTINCT FROM 'roomqc_tenant_summary' THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_claims:=pg_catalog.current_setting('request.jwt.claims',true)::jsonb;
    IF v_claims->>'role' IS DISTINCT FROM 'roomqc_tenant_summary'
      OR v_claims->>'iss' IS DISTINCT FROM 'roomqc-tenant-summary/v1'
      OR v_claims->>'aud' IS DISTINCT FROM 'authenticated'
      OR pg_catalog.jsonb_typeof(v_claims->'exp') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'invalid';
    END IF;
    v_id:=(v_claims->>'jti')::uuid;v_exp:=(v_claims->>'exp')::bigint;
    IF v_id IS NULL OR v_exp IS NULL THEN RAISE EXCEPTION 'invalid';END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END;
  -- Same lock order as maintenance: authority before credential.
  PERFORM 1 FROM private.tenant_summary_authority WHERE singleton
    AND cluster_id=v_claims->>'cluster_id' AND binding_sha256=v_claims->>'binding_sha256' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_SUMMARY_CREDENTIAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM private.tenant_summary_credentials WHERE id=v_id FOR SHARE;
  IF NOT FOUND OR v_row.cluster_id IS DISTINCT FROM v_claims->>'cluster_id'
    OR v_row.binding_sha256 IS DISTINCT FROM v_claims->>'binding_sha256'
    OR v_row.revoked_at IS NOT NULL OR v_row.not_before>pg_catalog.clock_timestamp()
    OR v_row.expires_at<=pg_catalog.clock_timestamp()
    OR (v_row.retire_after IS NOT NULL AND v_row.retire_after<=pg_catalog.clock_timestamp())
    OR pg_catalog.date_part('epoch',v_row.expires_at)::bigint<>v_exp THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN v_row.cluster_id;
END;
$guard$;
REVOKE ALL ON FUNCTION private.assert_tenant_summary_credential() FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;


-- Dedicated maintenance session only. Runtime receives neither monitor role
-- nor direct catalog helper privileges; the private projection has no inputs.
DO $maintenance$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SUMMARY_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END $maintenance$;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO roomqc_summary_credential_owner;
GRANT USAGE ON SCHEMA supabase_migrations TO roomqc_summary_credential_owner;
GRANT SELECT(version) ON supabase_migrations.schema_migrations TO roomqc_summary_credential_owner;
GRANT SELECT ON private.roomqc_release_manifest TO roomqc_summary_credential_owner;
-- A table grant alone remains filtered by RLS. Only the NOLOGIN function
-- owner may read this singleton; callers receive no direct metadata access.
CREATE POLICY roomqc_summary_credential_release_read ON private.roomqc_release_manifest
  FOR SELECT TO roomqc_summary_credential_owner USING (singleton);
-- The catalog-only partition helper resolves realtime.messages by name.
-- USAGE permits name resolution; it grants no table access or data writes.
DO $metadata$ BEGIN
  IF pg_catalog.to_regnamespace('realtime') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA realtime TO roomqc_summary_credential_owner;
  END IF;
END $metadata$;
GRANT EXECUTE ON FUNCTION private.roomqc_schema_fingerprint(),private.roomqc_sorted_acl(aclitem[]),
  private.roomqc_managed_realtime_partition_ids(),private.roomqc_partition_column_shape(oid),
  private.roomqc_partition_index_shape(oid) TO roomqc_summary_credential_owner;

CREATE FUNCTION roomqc_summary_admin.preflight() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $preflight$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_summary_credential_operator(pg_catalog.pg_has_role(session_user,'roomqc_summary_credential_issuer','USAGE'));
  SELECT pg_catalog.jsonb_build_object('contractVersion',1,
    'systemIdentifier',s.system_identifier::text,'databaseOid',d.oid::text,'databaseName',d.datname,
    'role',session_user::text,'roleConnectionLimit',r.rolconnlimit,'inRecovery',pg_catalog.pg_is_in_recovery(),
    'readOnly',pg_catalog.current_setting('transaction_read_only')='on','observedAt',pg_catalog.clock_timestamp(),
    'maxConnections',pg_catalog.current_setting('max_connections')::integer,
    'reservedConnections',pg_catalog.current_setting('superuser_reserved_connections')::integer
      +COALESCE(pg_catalog.current_setting('reserved_connections',true),'0')::integer,
    'capability',CASE WHEN pg_catalog.pg_has_role(session_user,'roomqc_summary_credential_issuer','USAGE') THEN 'issuer' ELSE 'installer' END,
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
REVOKE ALL ON FUNCTION roomqc_summary_admin.preflight() FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;
GRANT EXECUTE ON FUNCTION roomqc_summary_admin.preflight() TO roomqc_summary_credential_issuer,roomqc_summary_credential_installer;
GRANT CREATE ON SCHEMA roomqc_summary_admin TO roomqc_summary_credential_owner;
ALTER FUNCTION roomqc_summary_admin.preflight() OWNER TO roomqc_summary_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_summary_admin FROM roomqc_summary_credential_owner;

-- Keep catalog format v3; expand its explicit application namespace set.
-- The function definition and migration list are themselves hashed: old
-- approved hashes cannot authorize this schema. No manifest is auto-approved.
-- The existing authenticator role graph also covers the new summary role.
CREATE OR REPLACE FUNCTION private.roomqc_schema_fingerprint()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
WITH RECURSIVE
managed_partitions AS MATERIALIZED (
  SELECT private.roomqc_managed_realtime_partition_ids() AS ids
),
app_namespaces AS (
  SELECT * FROM pg_namespace WHERE nspname IN ('public','private','auth','storage','realtime','roomqc_setup','roomqc_setup_admin','roomqc_summary','roomqc_summary_admin')
),
app_relations AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN app_namespaces n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','S','f','c')
    AND NOT c.oid=ANY((SELECT ids FROM managed_partitions)::oid[])
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass
      AND d.objid=c.oid AND d.deptype='e')
),
app_types AS (
  SELECT t.*,n.nspname FROM pg_type t JOIN app_namespaces n ON n.oid=t.typnamespace
  WHERE t.typelem=0 AND (t.typrelid=0 OR EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c'))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass
      AND d.objid=t.oid AND d.deptype='e')
),
api_role_graph(role_id) AS (
  SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator','roomqc_control_probe',
    'roomqc_setup_recovery','roomqc_setup_credential_owner','roomqc_setup_credential_issuer','roomqc_setup_credential_installer','roomqc_summary_credential_owner','roomqc_summary_credential_issuer','roomqc_summary_credential_installer')
  UNION
  SELECT CASE WHEN m.roleid=g.role_id THEN m.member ELSE m.roleid END
  FROM api_role_graph g JOIN pg_auth_members m ON m.member=g.role_id OR m.roleid=g.role_id
),
parts AS (
  SELECT 'namespace' AS kind,n.nspname::text AS identity,jsonb_build_object('owner',r.rolname,
    'acl',private.roomqc_sorted_acl(coalesce(n.nspacl,acldefault('n',n.nspowner)))) AS definition
  FROM app_namespaces n JOIN pg_roles r ON r.oid=n.nspowner
  UNION ALL
  SELECT 'relation',c.nspname||'.'||c.relname,jsonb_build_object('kind',c.relkind,'persistence',c.relpersistence,
    'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident,'owner',r.rolname,'options',c.reloptions,
    'acl',private.roomqc_sorted_acl(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))),
    'view',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,false) END,
    'partitionKey',CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END,
    'partitionBound',pg_get_expr(c.relpartbound,c.oid,false),
    'parents',(SELECT jsonb_agg(np.nspname||'.'||p.relname ORDER BY i.inhseqno)
      FROM pg_inherits i JOIN pg_class p ON p.oid=i.inhparent JOIN pg_namespace np ON np.oid=p.relnamespace WHERE i.inhrelid=c.oid))
  FROM app_relations c JOIN pg_roles r ON r.oid=c.relowner
  UNION ALL
  SELECT 'column',c.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('position',a.attnum,
    'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'identity',a.attidentity,
    'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid,false),
    'collation',CASE WHEN a.attcollation<>0 THEN cn.nspname||'.'||co.collname END,
    'acl',private.roomqc_sorted_acl(a.attacl))
  FROM app_relations c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
  UNION ALL
  SELECT 'sequence',c.nspname||'.'||c.relname,to_jsonb(s)-'seqrelid'-'seqtypid'||jsonb_build_object('type',format_type(s.seqtypid,NULL))
  FROM app_relations c JOIN pg_sequence s ON s.seqrelid=c.oid
  UNION ALL
  SELECT 'constraint',coalesce(c.nspname||'.'||c.relname,t.nspname||'.'||t.typname)||'.'||k.conname,
    jsonb_build_object('definition',pg_get_constraintdef(k.oid,false),'validated',k.convalidated)
  FROM pg_constraint k LEFT JOIN app_relations c ON c.oid=k.conrelid LEFT JOIN app_types t ON t.oid=k.contypid
  WHERE c.oid IS NOT NULL OR t.oid IS NOT NULL
  UNION ALL
  SELECT 'index',c.nspname||'.'||c.relname||'.'||i.relname,jsonb_build_object('definition',pg_get_indexdef(i.oid,0,false),
    'valid',x.indisvalid,'ready',x.indisready,'replicaIdentity',x.indisreplident)
  FROM app_relations c JOIN pg_index x ON x.indrelid=c.oid JOIN pg_class i ON i.oid=x.indexrelid
  UNION ALL
  SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',r.rolname,
      'acl',private.roomqc_sorted_acl(coalesce(p.proacl,acldefault('f',p.proowner))))
  FROM pg_proc p JOIN app_namespaces n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.prokind IN ('f','p','w') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  UNION ALL
  SELECT 'type',t.nspname||'.'||t.typname,jsonb_build_object('kind',t.typtype,'owner',r.rolname,
    'baseType',format_type(t.typbasetype,t.typtypmod),'notNull',t.typnotnull,'default',t.typdefault,
    'acl',private.roomqc_sorted_acl(coalesce(t.typacl,acldefault('T',t.typowner))),
    'enum',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))
  FROM app_types t JOIN pg_roles r ON r.oid=t.typowner
  UNION ALL
  SELECT 'policy',c.nspname||'.'||c.relname||'.'||p.polname,jsonb_build_object('command',p.polcmd,
    'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid,false),'check',pg_get_expr(p.polwithcheck,p.polrelid,false),
    'roles',(SELECT jsonb_agg(CASE WHEN v=0 THEN 'PUBLIC' ELSE r.rolname END ORDER BY CASE WHEN v=0 THEN 'PUBLIC' ELSE r.rolname END COLLATE "C")
      FROM unnest(p.polroles) v LEFT JOIN pg_roles r ON r.oid=v))
  FROM app_relations c JOIN pg_policy p ON p.polrelid=c.oid
  UNION ALL
  SELECT 'trigger',c.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled)
  FROM app_relations c JOIN pg_trigger t ON t.tgrelid=c.oid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'defaultAcl',coalesce(n.nspname,'*')||'.'||r.rolname||'.'||d.defaclobjtype::text,
    private.roomqc_sorted_acl(d.defaclacl)
  FROM pg_default_acl d LEFT JOIN app_namespaces n ON n.oid=d.defaclnamespace JOIN pg_roles r ON r.oid=d.defaclrole
  WHERE d.defaclnamespace=0 OR n.oid IS NOT NULL
  UNION ALL
  SELECT 'publication',p.pubname::text,jsonb_build_object('owner',r.rolname,
    'allTables',p.puballtables,'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate,'viaRoot',p.pubviaroot)
  FROM pg_publication p JOIN pg_roles r ON r.oid=p.pubowner
  UNION ALL
  SELECT 'publicationMember',p.pubname||'.'||c.nspname||'.'||c.relname,
    jsonb_build_object(
      'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_publication_rel pr
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(pr.prattrs) WHERE pr.prpubid=p.oid AND pr.prrelid=c.oid),
      'filter',(SELECT pg_get_expr(pr.prqual,c.oid,false) FROM pg_publication_rel pr WHERE pr.prpubid=p.oid AND pr.prrelid=c.oid))
  FROM pg_publication p CROSS JOIN app_relations c
  WHERE p.puballtables OR EXISTS(SELECT 1 FROM pg_publication_rel pr WHERE pr.prpubid=p.oid AND pr.prrelid=c.oid)
    OR EXISTS(SELECT 1 FROM pg_publication_namespace pn WHERE pn.pnpubid=p.oid AND pn.pnnspid=c.relnamespace)
  UNION ALL
  SELECT 'apiRole',r.rolname,jsonb_build_object('inherit',r.rolinherit,'superuser',r.rolsuper,'bypassRls',r.rolbypassrls,
    'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication,'login',r.rolcanlogin,'config',r.rolconfig)
  FROM api_role_graph g JOIN pg_roles r ON r.oid=g.role_id
  UNION ALL
  SELECT 'apiRoleGrant',r.rolname||'.'||m.rolname||'.'||grantor.rolname,jsonb_build_object('admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option)
  FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
  JOIN pg_roles grantor ON grantor.oid=a.grantor
  WHERE a.roleid IN(SELECT role_id FROM api_role_graph) OR a.member IN(SELECT role_id FROM api_role_graph)
)
SELECT encode(sha256(convert_to(jsonb_build_object('version',3,'managedRealtimePartitionSpec',1,'setupRecoverySpec',1,
  'postgresMajor',current_setting('server_version_num')::integer/10000,
  'migrations',(SELECT coalesce(jsonb_agg(version ORDER BY version COLLATE "C"),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
  'parts',(SELECT jsonb_agg(jsonb_build_array(kind,identity,definition) ORDER BY kind COLLATE "C",identity COLLATE "C",definition::text COLLATE "C") FROM parts))::text,'UTF8')),'hex')
$function$;
NOTIFY pgrst, 'reload schema';
