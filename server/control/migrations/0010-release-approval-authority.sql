-- Directory only. Existing migration checksums and hotel databases are unchanged.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_release_installer') THEN
    CREATE ROLE roomqc_control_release_installer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_release_writer') THEN
    CREATE ROLE roomqc_control_release_writer NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('roomqc_control_release_writer','roomqc_control_release_installer')
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid='roomqc_control_release_writer'::regrole
      OR member='roomqc_control_release_writer'::regrole) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RELEASE_APPROVAL_ROLE_UNSAFE';
  END IF;
END $$;

-- The NOLOGIN writer owns only this command boundary. No runtime/installer is
-- its member. SECURITY DEFINER is needed solely to allow API withdrawal without
-- granting API direct writes or any ability to install/reactivate an approval.
GRANT USAGE,CREATE ON SCHEMA roomqc_control TO roomqc_control_release_writer;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_release_installer;
CREATE TABLE roomqc_control.release_approvals (
  approval_id uuid PRIMARY KEY,cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  epoch bigint NOT NULL CHECK (epoch BETWEEN 1 AND 9007199254740990),
  envelope_digest text NOT NULL UNIQUE CHECK (envelope_digest ~ '^[a-f0-9]{64}$'),
  issuer_id text NOT NULL CHECK (issuer_id ~ '^[a-z][a-z0-9-]{1,63}$'),
  key_id text NOT NULL CHECK (key_id ~ '^[a-z][a-z0-9-]{1,63}$'),
  key_fingerprint text NOT NULL CHECK (key_fingerprint ~ '^[a-f0-9]{64}$'),
  inventory_ref text NOT NULL CHECK (inventory_ref ~ '^[a-z][a-z0-9-]{1,63}$'),
  host_id text NOT NULL REFERENCES roomqc_control.hosts(id),
  environment text NOT NULL CHECK (environment IN ('local','staging','production')),
  endpoint_fingerprint text NOT NULL CHECK (endpoint_fingerprint ~ '^[a-f0-9]{64}$'),
  expectation_fingerprint text NOT NULL CHECK (expectation_fingerprint ~ '^[a-f0-9]{64}$'),
  expected jsonb NOT NULL CHECK (jsonb_typeof(expected)='object' AND octet_length(expected::text)<=4096),
  not_before_ms bigint NOT NULL CHECK (not_before_ms BETWEEN 0 AND 8640000000000000),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms>not_before_ms AND expires_at_ms<=8640000000000000),
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(cluster_id,epoch)
);
CREATE INDEX release_approvals_key_idx ON roomqc_control.release_approvals(key_fingerprint,cluster_id);
CREATE TABLE roomqc_control.release_authority (
  cluster_id text PRIMARY KEY REFERENCES roomqc_control.clusters(id),
  approval_id uuid NOT NULL REFERENCES roomqc_control.release_approvals(approval_id),
  epoch bigint NOT NULL CHECK (epoch BETWEEN 1 AND 9007199254740990),
  row_version bigint NOT NULL CHECK (row_version BETWEEN 1 AND 9007199254740990),
  state text NOT NULL CHECK (state IN ('active','withdrawn')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE roomqc_control.release_commands (
  id uuid PRIMARY KEY,caller_name name NOT NULL,client_key uuid NOT NULL,
  cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  operation text NOT NULL CHECK (operation IN ('install','withdraw')),
  expected_version bigint NOT NULL CHECK (expected_version BETWEEN 0 AND 9007199254740989),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid NOT NULL,reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(caller_name,client_key)
);
ALTER TABLE roomqc_control.release_approvals OWNER TO roomqc_control_release_writer;
ALTER TABLE roomqc_control.release_authority OWNER TO roomqc_control_release_writer;
ALTER TABLE roomqc_control.release_commands OWNER TO roomqc_control_release_writer;
REVOKE ALL ON roomqc_control.release_approvals,roomqc_control.release_authority,roomqc_control.release_commands
  FROM PUBLIC,roomqc_control_api,roomqc_control_worker,roomqc_control_metrics,
  roomqc_control_probe_runtime,roomqc_control_probe_installer,roomqc_control_release_installer;
GRANT SELECT ON roomqc_control.release_approvals,roomqc_control.release_authority
  TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics,roomqc_control_probe_runtime,roomqc_control_release_installer;
GRANT SELECT(id,host_id,inventory_ref) ON roomqc_control.clusters TO roomqc_control_probe_runtime;
GRANT SELECT(id,environment) ON roomqc_control.hosts TO roomqc_control_probe_runtime;
GRANT SELECT ON roomqc_control.schema_migrations TO roomqc_control_release_installer;
GRANT SELECT(id,host_id,inventory_ref) ON roomqc_control.clusters TO roomqc_control_release_installer,roomqc_control_release_writer;
GRANT SELECT(id,environment) ON roomqc_control.hosts TO roomqc_control_release_installer,roomqc_control_release_writer;
GRANT SELECT(cluster_id) ON roomqc_control.cluster_policies TO roomqc_control_release_writer;
GRANT UPDATE(manual_closed,operator_reopen_required,updated_at) ON roomqc_control.cluster_policies TO roomqc_control_release_writer;
GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_release_writer;
GRANT USAGE ON SEQUENCE roomqc_control.cluster_events_id_seq TO roomqc_control_release_writer;

CREATE TRIGGER fence_release_approvals BEFORE INSERT OR UPDATE OR DELETE ON roomqc_control.release_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION roomqc_control.fence_probe_credentials();
CREATE TRIGGER fence_release_authority BEFORE INSERT OR UPDATE OR DELETE ON roomqc_control.release_authority
  FOR EACH STATEMENT EXECUTE FUNCTION roomqc_control.fence_probe_credentials();
CREATE TRIGGER fence_release_commands BEFORE INSERT OR UPDATE OR DELETE ON roomqc_control.release_commands
  FOR EACH STATEMENT EXECUTE FUNCTION roomqc_control.fence_probe_credentials();

CREATE FUNCTION roomqc_control.guard_release_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.source='release_approval' OR NEW.type IN ('release_approval_installed','release_approval_withdrawn'))
    AND current_user<>'roomqc_control_release_writer' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RELEASE_APPROVAL_COMMAND_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_release_audit() FROM PUBLIC;
CREATE TRIGGER guard_release_audit BEFORE INSERT ON roomqc_control.cluster_events
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_release_audit();

CREATE FUNCTION roomqc_control.release_approval_command(
  p_operation text,p_cluster_id text,p_expected_version bigint,p_client_key uuid,
  p_reason text,p_request_id uuid,p_approval jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  prior roomqc_control.release_commands%ROWTYPE;
  current_authority roomqc_control.release_authority%ROWTYPE;
  current_version bigint;next_epoch bigint;request_hash text;command_id uuid;
  outcome jsonb;db_now_ms numeric;target record;before_state jsonb;
BEGIN
  -- session_user is the actual DB login, never an HTTP actor/JWT/session GUC.
  IF p_operation IS NULL OR p_operation NOT IN ('install','withdraw')
    OR (p_operation='install' AND NOT pg_has_role(session_user,'roomqc_control_release_installer','USAGE'))
    OR (p_operation='withdraw' AND NOT (pg_has_role(session_user,'roomqc_control_api','USAGE')
      OR pg_has_role(session_user,'roomqc_control_release_installer','USAGE'))) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RELEASE_APPROVAL_PERMISSION_REQUIRED';
  END IF;
  IF p_cluster_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740989
    OR p_client_key IS NULL OR p_request_id IS NULL OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 5 AND 1000
    OR p_reason<>btrim(p_reason) OR p_approval IS NULL OR jsonb_typeof(p_approval)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RELEASE_APPROVAL_COMMAND_INVALID';
  END IF;
  -- Lock order shared by health, validation, allocation and credential mutation.
  PERFORM pg_advisory_xact_lock(727001);
  request_hash:=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'clusterId',p_cluster_id,
    'expectedVersion',p_expected_version,'reason',p_reason,'approval',p_approval)::text,'UTF8')),'hex');
  SELECT * INTO prior FROM roomqc_control.release_commands WHERE caller_name=session_user AND client_key=p_client_key;
  IF FOUND THEN
    IF prior.payload_hash<>request_hash THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN prior.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT c.id,c.host_id,c.inventory_ref,h.environment INTO target FROM roomqc_control.clusters c
    JOIN roomqc_control.hosts h ON h.id=c.host_id WHERE c.id=p_cluster_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_BINDING_CHANGED'; END IF;
  SELECT * INTO current_authority FROM roomqc_control.release_authority WHERE cluster_id=p_cluster_id FOR UPDATE;
  current_version:=coalesce(current_authority.row_version,0);next_epoch:=coalesce(current_authority.epoch,0)+1;
  IF current_version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_VERSION_CONFLICT';
  END IF;
  before_state:=CASE WHEN current_version=0 THEN NULL ELSE jsonb_build_object('approvalId',current_authority.approval_id,
    'epoch',current_authority.epoch,'version',current_version,'state',current_authority.state) END;
  db_now_ms:=extract(epoch FROM clock_timestamp())*1000;
  IF p_operation='install' THEN
    -- Cryptography is performed by the installer with public trust material.
    -- The trusted installer still cannot bypass durable epoch, clock or binding.
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_approval) k) IS DISTINCT FROM
      ARRAY['approvalId','clusterId','endpointFingerprint','envelopeDigest','environment','epoch','expectationFingerprint',
        'expected','expiresAt','hostId','inventoryRef','issuerId','keyFingerprint','keyId','notBefore']::text[]
      OR p_approval->>'clusterId' IS DISTINCT FROM p_cluster_id
      OR p_approval->>'hostId' IS DISTINCT FROM target.host_id
      OR p_approval->>'inventoryRef' IS DISTINCT FROM target.inventory_ref
      OR p_approval->>'environment' IS DISTINCT FROM target.environment
      OR jsonb_typeof(p_approval->'epoch') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_approval->'notBefore') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_approval->'expiresAt') IS DISTINCT FROM 'number'
      OR (p_approval->>'epoch')::numeric<>next_epoch
      OR (p_approval->>'notBefore')::numeric>db_now_ms OR (p_approval->>'expiresAt')::numeric<=db_now_ms THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_INSTALL_INVALID';
    END IF;
    IF EXISTS (SELECT 1 FROM roomqc_control.release_approvals WHERE approval_id=(p_approval->>'approvalId')::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_ID_REUSED';
    END IF;
    INSERT INTO roomqc_control.release_approvals(approval_id,cluster_id,epoch,envelope_digest,issuer_id,key_id,key_fingerprint,
      inventory_ref,host_id,environment,endpoint_fingerprint,expectation_fingerprint,expected,not_before_ms,expires_at_ms)
    VALUES((p_approval->>'approvalId')::uuid,p_cluster_id,next_epoch,p_approval->>'envelopeDigest',p_approval->>'issuerId',
      p_approval->>'keyId',p_approval->>'keyFingerprint',p_approval->>'inventoryRef',p_approval->>'hostId',p_approval->>'environment',
      p_approval->>'endpointFingerprint',p_approval->>'expectationFingerprint',p_approval->'expected',
      (p_approval->>'notBefore')::bigint,(p_approval->>'expiresAt')::bigint);
    INSERT INTO roomqc_control.release_authority(cluster_id,approval_id,epoch,row_version,state)
      VALUES(p_cluster_id,(p_approval->>'approvalId')::uuid,next_epoch,current_version+1,'active')
      ON CONFLICT(cluster_id) DO UPDATE SET approval_id=excluded.approval_id,epoch=excluded.epoch,
        row_version=excluded.row_version,state=excluded.state,updated_at=clock_timestamp();
  ELSE
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_approval) k) IS DISTINCT FROM ARRAY['approvalId']::text[]
      OR current_authority.state IS DISTINCT FROM 'active'
      OR p_approval->>'approvalId' IS DISTINCT FROM current_authority.approval_id::text THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_WITHDRAW_INVALID';
    END IF;
    UPDATE roomqc_control.release_authority SET state='withdrawn',epoch=next_epoch,row_version=current_version+1,
      updated_at=clock_timestamp() WHERE cluster_id=p_cluster_id;
  END IF;
  -- Installing never reopens admission, clears recovery latches or changes routing.
  UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true,updated_at=clock_timestamp()
    WHERE cluster_id=p_cluster_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_BINDING_CHANGED'; END IF;
  command_id:=gen_random_uuid();
  outcome:=jsonb_build_object('commandId',command_id,'clusterId',p_cluster_id,'approvalId',p_approval->>'approvalId',
    'epoch',next_epoch,'version',current_version+1,'state',CASE WHEN p_operation='install' THEN 'active' ELSE 'withdrawn' END);
  INSERT INTO roomqc_control.release_commands(id,caller_name,client_key,cluster_id,operation,expected_version,payload_hash,request_id,reason,result)
    VALUES(command_id,session_user,p_client_key,p_cluster_id,p_operation,p_expected_version,request_hash,p_request_id,p_reason,outcome);
  INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source,request_id)
    VALUES(p_cluster_id,CASE WHEN p_operation='install' THEN 'release_approval_installed' ELSE 'release_approval_withdrawn' END,
      before_state,outcome,'release_approval',p_request_id);
  RETURN outcome||jsonb_build_object('replayed',false);
END;
$$;
ALTER FUNCTION roomqc_control.release_approval_command(text,text,bigint,uuid,text,uuid,jsonb) OWNER TO roomqc_control_release_writer;
REVOKE ALL ON FUNCTION roomqc_control.release_approval_command(text,text,bigint,uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roomqc_control.release_approval_command(text,text,bigint,uuid,text,uuid,jsonb)
  TO roomqc_control_release_installer,roomqc_control_api;

-- Historical receipts are scoped to the actual login. This read never repairs,
-- replays or claims that an old successful install is current authority.
CREATE FUNCTION roomqc_control.release_approval_receipt(p_client_key uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT result FROM roomqc_control.release_commands WHERE caller_name=session_user AND client_key=p_client_key
$$;
ALTER FUNCTION roomqc_control.release_approval_receipt(uuid) OWNER TO roomqc_control_release_writer;
REVOKE ALL ON FUNCTION roomqc_control.release_approval_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roomqc_control.release_approval_receipt(uuid) TO roomqc_control_release_installer,roomqc_control_api;
REVOKE CREATE ON SCHEMA roomqc_control FROM roomqc_control_release_writer;
