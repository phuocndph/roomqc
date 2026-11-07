-- Directory only. A physical signing key stays withdrawn across issuer/keyId
-- aliases, restarts and future installations. Existing v10 receipts are kept.
ALTER TABLE roomqc_control.release_commands ALTER COLUMN cluster_id DROP NOT NULL;
ALTER TABLE roomqc_control.release_commands DROP CONSTRAINT release_commands_operation_check;
ALTER TABLE roomqc_control.release_commands ADD CONSTRAINT release_commands_operation_check
  CHECK (operation IN ('install','withdraw','withdraw_key'));
ALTER TABLE roomqc_control.release_commands ADD CONSTRAINT release_commands_target_check
  CHECK ((operation='withdraw_key')=(cluster_id IS NULL));

CREATE TABLE roomqc_control.release_key_revocations (
  key_fingerprint text PRIMARY KEY CHECK (key_fingerprint ~ '^[a-f0-9]{64}$'),
  command_id uuid NOT NULL UNIQUE REFERENCES roomqc_control.release_commands(id),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE roomqc_control.release_key_revocations OWNER TO roomqc_control_release_writer;
REVOKE ALL ON roomqc_control.release_key_revocations FROM PUBLIC,roomqc_control_api,roomqc_control_worker,
  roomqc_control_metrics,roomqc_control_probe_runtime,roomqc_control_probe_installer,roomqc_control_release_installer;
GRANT SELECT ON roomqc_control.release_key_revocations TO roomqc_control_api,roomqc_control_worker,
  roomqc_control_metrics,roomqc_control_probe_runtime,roomqc_control_release_installer;
CREATE TRIGGER fence_release_key_revocations BEFORE INSERT ON roomqc_control.release_key_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION roomqc_control.fence_probe_credentials();

CREATE FUNCTION roomqc_control.guard_release_key_rewrite() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RELEASE_KEY_REVOCATION_IMMUTABLE';
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_release_key_rewrite() FROM PUBLIC;
CREATE TRIGGER guard_release_key_rewrite BEFORE UPDATE OR DELETE OR TRUNCATE ON roomqc_control.release_key_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION roomqc_control.guard_release_key_rewrite();

-- The v10 command's replay returns before INSERT. Historical successful installs
-- remain readable/replayable without resurrecting authority or bypassing this
-- guard for any fresh install. The existing BEFORE STATEMENT fence holds727001
-- before this row trigger, serializing new installs with key-wide withdrawal.
CREATE FUNCTION roomqc_control.guard_release_install_key() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM roomqc_control.release_key_revocations WHERE key_fingerprint=NEW.key_fingerprint) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_KEY_WITHDRAWN';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_release_install_key() FROM PUBLIC;
CREATE TRIGGER guard_release_install_key BEFORE INSERT ON roomqc_control.release_approvals
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_release_install_key();

CREATE OR REPLACE FUNCTION roomqc_control.guard_release_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.source='release_approval' OR NEW.type IN
    ('release_approval_installed','release_approval_withdrawn','release_key_withdrawn'))
    AND current_user<>'roomqc_control_release_writer' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RELEASE_APPROVAL_COMMAND_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_release_audit() FROM PUBLIC;

CREATE FUNCTION roomqc_control.release_key_withdrawal_command(
  p_key_fingerprint text,p_expected_version bigint,p_client_key uuid,p_reason text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  prior roomqc_control.release_commands%ROWTYPE;
  target record;current_version bigint;request_hash text;command_id uuid;
  outcome jsonb;affected jsonb:='[]'::jsonb;after_state jsonb;
BEGIN
  IF NOT (pg_has_role(session_user,'roomqc_control_api','USAGE')
    OR pg_has_role(session_user,'roomqc_control_release_installer','USAGE')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RELEASE_APPROVAL_PERMISSION_REQUIRED';
  END IF;
  IF p_key_fingerprint IS NULL OR p_key_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version NOT IN (0,1)
    OR p_client_key IS NULL OR p_request_id IS NULL OR p_reason IS NULL
    OR length(p_reason) NOT BETWEEN 5 AND 1000 OR p_reason<>btrim(p_reason) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RELEASE_APPROVAL_COMMAND_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(727001);
  request_hash:=encode(sha256(convert_to(jsonb_build_object('operation','withdraw_key',
    'keyFingerprint',p_key_fingerprint,'expectedVersion',p_expected_version,'reason',p_reason)::text,'UTF8')),'hex');
  SELECT * INTO prior FROM roomqc_control.release_commands WHERE caller_name=session_user AND client_key=p_client_key;
  IF FOUND THEN
    IF prior.payload_hash<>request_hash THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN prior.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM roomqc_control.release_key_revocations
    WHERE key_fingerprint=p_key_fingerprint) THEN 1 ELSE 0 END INTO current_version;
  IF current_version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_KEY_VERSION_CONFLICT';
  END IF;
  IF current_version=1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_KEY_ALREADY_WITHDRAWN';
  END IF;
  command_id:=gen_random_uuid();
  FOR target IN SELECT r.* FROM roomqc_control.release_authority r
    JOIN roomqc_control.release_approvals a ON a.approval_id=r.approval_id
    WHERE r.state='active' AND a.key_fingerprint=p_key_fingerprint ORDER BY r.cluster_id FOR UPDATE OF r
  LOOP
    UPDATE roomqc_control.release_authority SET state='withdrawn',epoch=target.epoch+1,
      row_version=target.row_version+1,updated_at=clock_timestamp() WHERE cluster_id=target.cluster_id;
    UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true,
      updated_at=clock_timestamp() WHERE cluster_id=target.cluster_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='RELEASE_APPROVAL_BINDING_CHANGED';
    END IF;
    after_state:=jsonb_build_object('commandId',command_id,'clusterId',target.cluster_id,
      'approvalId',target.approval_id,'epoch',target.epoch+1,'version',target.row_version+1,
      'state','withdrawn','keyFingerprint',p_key_fingerprint);
    INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source,request_id)
      VALUES(target.cluster_id,'release_key_withdrawn',jsonb_build_object('approvalId',target.approval_id,
        'epoch',target.epoch,'version',target.row_version,'state',target.state),after_state,'release_approval',p_request_id);
    affected:=affected||jsonb_build_array(after_state);
  END LOOP;
  outcome:=jsonb_build_object('commandId',command_id,'keyFingerprint',p_key_fingerprint,
    'version',1,'state','withdrawn','affected',affected);
  INSERT INTO roomqc_control.release_commands(id,caller_name,client_key,cluster_id,operation,expected_version,
    payload_hash,request_id,reason,result) VALUES(command_id,session_user,p_client_key,NULL,'withdraw_key',
    p_expected_version,request_hash,p_request_id,p_reason,outcome);
  INSERT INTO roomqc_control.release_key_revocations(key_fingerprint,command_id) VALUES(p_key_fingerprint,command_id);
  RETURN outcome||jsonb_build_object('replayed',false);
END;
$$;
ALTER FUNCTION roomqc_control.release_key_withdrawal_command(text,bigint,uuid,text,uuid) OWNER TO roomqc_control_release_writer;
REVOKE ALL ON FUNCTION roomqc_control.release_key_withdrawal_command(text,bigint,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roomqc_control.release_key_withdrawal_command(text,bigint,uuid,text,uuid)
  TO roomqc_control_api,roomqc_control_release_installer;
