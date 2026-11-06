-- Credential management is a maintenance interface, never a Data API schema.
-- This migration grants no LOGIN, password, authenticator membership or runtime
-- permission. Dedicated operator logins must be provisioned outside this file.
DO $maintenance$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_MAINTENANCE_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$maintenance$;
CREATE ROLE roomqc_setup_credential_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE roomqc_setup_credential_issuer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE roomqc_setup_credential_installer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA roomqc_setup_admin;
REVOKE ALL ON SCHEMA roomqc_setup_admin FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;
GRANT USAGE ON SCHEMA roomqc_setup_admin TO roomqc_setup_credential_issuer,roomqc_setup_credential_installer;
GRANT USAGE ON SCHEMA private TO roomqc_setup_credential_owner;

ALTER TABLE private.setup_recovery_credentials ADD COLUMN retire_after timestamptz;
ALTER TABLE private.setup_recovery_credentials ADD CONSTRAINT setup_recovery_retirement_bound
  CHECK(retire_after IS NULL OR retire_after<=expires_at);

CREATE TABLE private.setup_recovery_management (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version bigint NOT NULL CHECK(version>=0 AND version<9007199254740990),
  release_sha256 text CHECK(release_sha256 ~ '^[a-f0-9]{64}$'),
  head_credential_id uuid REFERENCES private.setup_recovery_credentials(id)
);
INSERT INTO private.setup_recovery_management(singleton,version) VALUES(true,0);
CREATE TABLE private.setup_recovery_commands (
  key uuid PRIMARY KEY,
  caller name NOT NULL,
  request jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(request)='object'),
  result jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TABLE private.setup_recovery_credential_audit (
  command_key uuid PRIMARY KEY REFERENCES private.setup_recovery_commands(key),
  caller name NOT NULL,
  operation text NOT NULL CHECK(operation IN ('bind','issue','revoke')),
  reason text NOT NULL,
  resulting_version bigint NOT NULL,
  affected_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.setup_recovery_management ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.setup_recovery_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.setup_recovery_credential_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.setup_recovery_management,private.setup_recovery_commands,private.setup_recovery_credential_audit
  FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery,roomqc_setup_credential_issuer,roomqc_setup_credential_installer;
-- The owner of the narrow definer interface has no membership in migration,
-- Auth, service-role or application roles and no table deletion privileges.
GRANT SELECT,INSERT,UPDATE ON private.setup_recovery_management TO roomqc_setup_credential_owner;
GRANT SELECT,INSERT ON private.setup_recovery_commands,private.setup_recovery_credential_audit TO roomqc_setup_credential_owner;
GRANT SELECT,INSERT,UPDATE ON private.setup_recovery_authority TO roomqc_setup_credential_owner;
GRANT SELECT,INSERT ON private.setup_recovery_credentials TO roomqc_setup_credential_owner;
GRANT UPDATE(revoked_at,retire_after) ON private.setup_recovery_credentials TO roomqc_setup_credential_owner;
CREATE POLICY recovery_management_owner ON private.setup_recovery_management TO roomqc_setup_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY recovery_command_owner ON private.setup_recovery_commands TO roomqc_setup_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY recovery_audit_owner ON private.setup_recovery_credential_audit TO roomqc_setup_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY recovery_authority_owner ON private.setup_recovery_authority TO roomqc_setup_credential_owner USING(true) WITH CHECK(true);
CREATE POLICY recovery_credential_owner ON private.setup_recovery_credentials TO roomqc_setup_credential_owner USING(true) WITH CHECK(true);

CREATE FUNCTION private.setup_recovery_history_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $immutable$
BEGIN
  RAISE EXCEPTION 'SETUP_CREDENTIAL_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END;
$immutable$;
REVOKE ALL ON FUNCTION private.setup_recovery_history_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER setup_recovery_command_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON private.setup_recovery_commands
  FOR EACH STATEMENT EXECUTE FUNCTION private.setup_recovery_history_immutable();
CREATE TRIGGER setup_recovery_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON private.setup_recovery_credential_audit
  FOR EACH STATEMENT EXECUTE FUNCTION private.setup_recovery_history_immutable();

CREATE FUNCTION private.assert_setup_credential_operator(p_issuer boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $operator$
DECLARE v_role text:=CASE WHEN p_issuer THEN 'roomqc_setup_credential_issuer' ELSE 'roomqc_setup_credential_installer' END;
BEGIN
  IF NOT pg_catalog.pg_has_role(session_user,v_role,'USAGE')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_catalog.pg_has_role(session_user,r.oid,'MEMBER')
      AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
        OR r.rolname IN ('anon','authenticated','service_role','authenticator','roomqc_setup_recovery','roomqc_setup_credential_owner')))
    OR (pg_catalog.pg_has_role(session_user,'roomqc_setup_credential_issuer','USAGE')
      AND pg_catalog.pg_has_role(session_user,'roomqc_setup_credential_installer','USAGE')) THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_OPERATOR_DENIED' USING ERRCODE='42501';
  END IF;
END;
$operator$;
REVOKE ALL ON FUNCTION private.assert_setup_credential_operator(boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.assert_setup_credential_operator(boolean) TO roomqc_setup_credential_owner;

CREATE FUNCTION private.setup_recovery_credential_command(p_command jsonb,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $command$
DECLARE
  v_keys text[];v_expected_keys text[];v_key uuid;v_request uuid;v_predecessor uuid;v_id uuid;
  v_state private.setup_recovery_management%ROWTYPE;v_authority private.setup_recovery_authority%ROWTYPE;
  v_previous private.setup_recovery_commands%ROWTYPE;v_credential private.setup_recovery_credentials%ROWTYPE;
  v_expected bigint;v_ttl integer;v_overlap integer;v_now timestamptz;v_deadline timestamptz;
  v_result jsonb;v_affected uuid[]:=ARRAY[]::uuid[];v_had_authority boolean;
BEGIN
  PERFORM private.assert_setup_credential_operator(p_operation='issue');
  IF p_operation NOT IN ('bind','issue','revoke') OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SETUP_CREDENTIAL_COMMAND_INVALID';
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
    RAISE EXCEPTION 'SETUP_CREDENTIAL_COMMAND_INVALID';
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
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'SETUP_CREDENTIAL_COMMAND_INVALID';
  END;
  -- One bounded maintenance writer per business database. Runtime operations
  -- take authority then credential SHARE locks, in the same order below.
  PERFORM pg_catalog.pg_advisory_xact_lock(727012);
  SELECT * INTO v_previous FROM private.setup_recovery_commands WHERE key=v_key;
  IF FOUND THEN
    IF v_previous.caller IS DISTINCT FROM session_user OR v_previous.request IS DISTINCT FROM p_command THEN
      RAISE EXCEPTION 'SETUP_CREDENTIAL_KEY_CONFLICT';
    END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO STRICT v_state FROM private.setup_recovery_management WHERE singleton FOR UPDATE;
  IF v_state.version<>v_expected THEN RAISE EXCEPTION 'SETUP_CREDENTIAL_VERSION_CONFLICT'; END IF;
  SELECT * INTO v_authority FROM private.setup_recovery_authority WHERE singleton FOR UPDATE;
  v_had_authority:=FOUND;
  v_now:=pg_catalog.date_trunc('second',pg_catalog.clock_timestamp());
  IF p_operation='bind' THEN
    IF (v_had_authority AND (v_authority.cluster_id IS DISTINCT FROM p_command->>'expectedClusterId'
      OR v_authority.binding_sha256 IS DISTINCT FROM p_command->>'expectedBindingSha256'))
      OR (NOT v_had_authority AND (p_command->'expectedClusterId'<>'null'::jsonb OR p_command->'expectedBindingSha256'<>'null'::jsonb)) THEN
      RAISE EXCEPTION 'SETUP_CREDENTIAL_TARGET_CONFLICT';
    END IF;
    WITH changed AS (UPDATE private.setup_recovery_credentials SET revoked_at=pg_catalog.clock_timestamp()
      WHERE revoked_at IS NULL RETURNING id) SELECT COALESCE(pg_catalog.array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO v_affected FROM changed;
    INSERT INTO private.setup_recovery_authority(singleton,cluster_id,binding_sha256)
      VALUES(true,p_command->>'clusterId',p_command->>'bindingSha256')
      ON CONFLICT(singleton) DO UPDATE SET cluster_id=EXCLUDED.cluster_id,binding_sha256=EXCLUDED.binding_sha256;
    UPDATE private.setup_recovery_management SET head_credential_id=NULL,release_sha256=p_command->>'releaseSha256' WHERE singleton;
  ELSE
    IF NOT v_had_authority OR v_authority.cluster_id IS DISTINCT FROM p_command->>'clusterId'
      OR v_authority.binding_sha256 IS DISTINCT FROM p_command->>'bindingSha256'
      OR v_state.release_sha256 IS DISTINCT FROM p_command->>'releaseSha256' THEN RAISE EXCEPTION 'SETUP_CREDENTIAL_TARGET_CONFLICT'; END IF;
    IF p_operation='issue' THEN
      IF v_state.head_credential_id IS DISTINCT FROM v_predecessor THEN RAISE EXCEPTION 'SETUP_CREDENTIAL_PREDECESSOR_CONFLICT'; END IF;
      IF EXISTS(SELECT 1 FROM private.setup_recovery_credentials WHERE id IS DISTINCT FROM v_predecessor AND revoked_at IS NULL
        AND expires_at>pg_catalog.clock_timestamp() AND (retire_after IS NULL OR retire_after>pg_catalog.clock_timestamp())) THEN
        RAISE EXCEPTION 'SETUP_CREDENTIAL_OVERLAP_BUSY';
      END IF;
      IF v_predecessor IS NOT NULL THEN
        SELECT * INTO STRICT v_credential FROM private.setup_recovery_credentials WHERE id=v_predecessor FOR UPDATE;
        v_deadline:=LEAST(v_credential.expires_at,COALESCE(v_credential.retire_after,v_credential.expires_at),v_now+v_overlap*interval '1 second');
        UPDATE private.setup_recovery_credentials SET retire_after=v_deadline WHERE id=v_predecessor;
      END IF;
      v_id:=pg_catalog.gen_random_uuid();
      INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at)
        VALUES(v_id,v_authority.cluster_id,v_authority.binding_sha256,v_now,v_now+v_ttl*interval '1 second');
      UPDATE private.setup_recovery_management SET head_credential_id=v_id WHERE singleton;
      v_affected:=ARRAY[v_id];
    ELSE
      SELECT * INTO v_credential FROM private.setup_recovery_credentials WHERE id=v_id FOR UPDATE;
      IF NOT FOUND OR v_credential.cluster_id<>v_authority.cluster_id OR v_credential.binding_sha256<>v_authority.binding_sha256 THEN
        RAISE EXCEPTION 'SETUP_CREDENTIAL_TARGET_CONFLICT';
      END IF;
      UPDATE private.setup_recovery_credentials SET revoked_at=COALESCE(revoked_at,pg_catalog.clock_timestamp()) WHERE id=v_id;
      v_affected:=ARRAY[v_id];
    END IF;
  END IF;
  UPDATE private.setup_recovery_management SET version=version+1 WHERE singleton RETURNING version INTO v_expected;
  v_result:=pg_catalog.jsonb_build_object('commandId',v_key,'operation',p_operation,'version',v_expected,
    'clusterId',p_command->>'clusterId','bindingSha256',p_command->>'bindingSha256','releaseSha256',p_command->>'releaseSha256',
    'credentialId',CASE WHEN p_operation='bind' THEN NULL ELSE v_id END,'affectedIds',v_affected,'historicalResult',true);
  IF p_operation='issue' THEN
    v_result:=v_result||pg_catalog.jsonb_build_object('predecessorId',v_predecessor,'overlapDeadline',v_deadline,
      'iat',pg_catalog.date_part('epoch',v_now)::bigint,'exp',pg_catalog.date_part('epoch',v_now)::bigint+v_ttl,
      'signerAlgorithm',p_command->>'signerAlgorithm','signerFingerprint',p_command->>'signerFingerprint');
  END IF;
  INSERT INTO private.setup_recovery_commands(key,caller,request,result) VALUES(v_key,session_user,p_command,v_result);
  INSERT INTO private.setup_recovery_credential_audit(command_key,caller,operation,reason,resulting_version,affected_ids)
    VALUES(v_key,session_user,p_operation,p_command->>'reason',v_expected,v_affected);
  RETURN v_result;
END;
$command$;
REVOKE ALL ON FUNCTION private.setup_recovery_credential_command(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.setup_recovery_credential_command(jsonb,text) TO roomqc_setup_credential_owner;

CREATE FUNCTION roomqc_setup_admin.bind(p_command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $bind$
  SELECT private.setup_recovery_credential_command(p_command,'bind');
$bind$;
CREATE FUNCTION roomqc_setup_admin.issue(p_command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $issue$
  SELECT private.setup_recovery_credential_command(p_command,'issue');
$issue$;
CREATE FUNCTION roomqc_setup_admin.revoke(p_command jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $revoke$
  SELECT private.setup_recovery_credential_command(p_command,'revoke');
$revoke$;
CREATE FUNCTION roomqc_setup_admin.receipt(p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $receipt$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_setup_credential_operator(pg_catalog.pg_has_role(session_user,'roomqc_setup_credential_issuer','USAGE'));
  SELECT result INTO v_result FROM private.setup_recovery_commands WHERE key=p_key AND caller=session_user;
  RETURN v_result;
END;
$receipt$;
REVOKE ALL ON FUNCTION roomqc_setup_admin.bind(jsonb),roomqc_setup_admin.issue(jsonb),roomqc_setup_admin.revoke(jsonb),roomqc_setup_admin.receipt(uuid)
  FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;
GRANT EXECUTE ON FUNCTION roomqc_setup_admin.issue(jsonb),roomqc_setup_admin.receipt(uuid) TO roomqc_setup_credential_issuer;
GRANT EXECUTE ON FUNCTION roomqc_setup_admin.bind(jsonb),roomqc_setup_admin.revoke(jsonb),roomqc_setup_admin.receipt(uuid) TO roomqc_setup_credential_installer;
-- ALTER OWNER requires CREATE during transfer only; the final owner cannot
-- install another interface in the maintenance schema.
-- Use the dedicated privileged maintenance session for owner transfer. Never
-- give the ordinary migration login a new role membership to bypass this check.
GRANT CREATE ON SCHEMA roomqc_setup_admin TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.bind(jsonb) OWNER TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.issue(jsonb) OWNER TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.revoke(jsonb) OWNER TO roomqc_setup_credential_owner;
ALTER FUNCTION roomqc_setup_admin.receipt(uuid) OWNER TO roomqc_setup_credential_owner;
REVOKE CREATE ON SCHEMA roomqc_setup_admin FROM roomqc_setup_credential_owner;
GRANT USAGE ON SCHEMA roomqc_setup_admin TO roomqc_setup_credential_owner;

-- Match maintenance lock order and check the bounded overlap on BOTH fences.
CREATE OR REPLACE FUNCTION private.assert_setup_recovery_credential() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $guard$
DECLARE v_claims jsonb;v_id uuid;v_exp bigint;v_row private.setup_recovery_credentials%ROWTYPE;
  v_authority private.setup_recovery_authority%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('role',true) IS DISTINCT FROM 'roomqc_setup_recovery' THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_claims:=pg_catalog.current_setting('request.jwt.claims',true)::jsonb;
    IF v_claims->>'role' IS DISTINCT FROM 'roomqc_setup_recovery' OR v_claims->>'iss' IS DISTINCT FROM 'roomqc-setup-recovery/v1'
      OR v_claims->>'aud' IS DISTINCT FROM 'authenticated' OR pg_catalog.jsonb_typeof(v_claims->'exp') IS DISTINCT FROM 'number'
      OR COALESCE(v_claims->>'exp','') !~ '^[0-9]{1,12}$' THEN RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501'; END IF;
    v_id:=(v_claims->>'jti')::uuid;v_exp:=(v_claims->>'exp')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END;
  SELECT * INTO v_authority FROM private.setup_recovery_authority WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM private.setup_recovery_credentials WHERE id=v_id FOR SHARE;
  IF NOT FOUND OR v_authority.cluster_id<>v_row.cluster_id OR v_authority.binding_sha256<>v_row.binding_sha256
    OR v_row.cluster_id IS DISTINCT FROM v_claims->>'cluster_id' OR v_row.binding_sha256 IS DISTINCT FROM v_claims->>'binding_sha256'
    OR v_row.revoked_at IS NOT NULL OR v_row.not_before>pg_catalog.clock_timestamp() OR v_row.expires_at<=pg_catalog.clock_timestamp()
    OR (v_row.retire_after IS NOT NULL AND v_row.retire_after<=pg_catalog.clock_timestamp())
    OR v_exp<=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()) OR pg_catalog.to_timestamp(v_exp)>v_row.expires_at THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
END;
$guard$;
