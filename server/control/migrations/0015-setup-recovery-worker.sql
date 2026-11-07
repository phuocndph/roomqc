-- Directory only. Recovery has no direct access to workspace/job/dispatch data.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_setup_runtime') THEN
    CREATE ROLE roomqc_control_setup_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_setup_writer') THEN
    CREATE ROLE roomqc_control_setup_writer NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_setup_runtime'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member='roomqc_control_setup_runtime'::regrole) THEN
    RAISE EXCEPTION 'SETUP_RUNTIME_ROLE_UNSAFE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_setup_writer'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member='roomqc_control_setup_writer'::regrole
      OR roleid='roomqc_control_setup_writer'::regrole) THEN
    RAISE EXCEPTION 'SETUP_WRITER_ROLE_UNSAFE';
  END IF;
END $$;
ALTER TABLE roomqc_control.provisioning_jobs
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 30),
  ADD COLUMN deadline_at timestamptz;
UPDATE roomqc_control.provisioning_jobs SET deadline_at=created_at+interval '24 hours';
ALTER TABLE roomqc_control.provisioning_jobs ALTER COLUMN deadline_at SET NOT NULL,
  ALTER COLUMN deadline_at SET DEFAULT (clock_timestamp()+interval '24 hours'),
  ADD CONSTRAINT provisioning_jobs_deadline_check CHECK (deadline_at>created_at);

CREATE TABLE roomqc_control.setup_recovery_attempts (
  job_id uuid NOT NULL REFERENCES roomqc_control.provisioning_jobs(id),
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 30),lease_token uuid NOT NULL UNIQUE,
  api_url text NOT NULL,credential_ref text NOT NULL,approval_id uuid NOT NULL REFERENCES roomqc_control.release_approvals(approval_id),
  approval_epoch bigint NOT NULL,approval_digest text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN ('claimed','lease_expired','retry','waiting_owner','needs_review','succeeded')),
  error_code text CHECK (error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  PRIMARY KEY(job_id,attempt),CHECK ((outcome='claimed')=(finished_at IS NULL))
);
REVOKE ALL ON roomqc_control.setup_recovery_attempts FROM PUBLIC;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_setup_runtime;
GRANT SELECT ON roomqc_control.schema_migrations TO roomqc_control_setup_runtime;
-- Isolated non-login owner, never granted to a runtime or installer login.
-- Definer functions need only these columns and the audit identity sequence.
GRANT USAGE,CREATE ON SCHEMA roomqc_control TO roomqc_control_setup_writer;
GRANT SELECT ON roomqc_control.workspaces,roomqc_control.provisioning_jobs,roomqc_control.setup_dispatches,
  roomqc_control.setup_recovery_attempts,roomqc_control.clusters,roomqc_control.hosts,
  roomqc_control.release_authority,roomqc_control.release_approvals,roomqc_control.release_key_revocations TO roomqc_control_setup_writer;
GRANT INSERT ON roomqc_control.setup_recovery_attempts,roomqc_control.attempts TO roomqc_control_setup_writer;
GRANT USAGE ON SEQUENCE roomqc_control.attempts_id_seq TO roomqc_control_setup_writer;
GRANT UPDATE(state,attempts,lease_token,lease_until,last_error_code,next_attempt_at,updated_at)
  ON roomqc_control.provisioning_jobs TO roomqc_control_setup_writer;
GRANT UPDATE(status,tenant_id,hotel_id,expires_at,last_error_code,updated_at)
  ON roomqc_control.workspaces TO roomqc_control_setup_writer;
GRANT UPDATE(terminal_state,tenant_id,hotel_id,settled_at) ON roomqc_control.setup_dispatches TO roomqc_control_setup_writer;
GRANT UPDATE(outcome,error_code,finished_at) ON roomqc_control.setup_recovery_attempts TO roomqc_control_setup_writer;
-- PostgreSQL requires one UPDATE privilege for SELECT FOR SHARE. The function
-- only row-locks clusters; no runtime can assume this owner or call generic SQL.
GRANT UPDATE(id) ON roomqc_control.clusters TO roomqc_control_setup_writer;

CREATE FUNCTION roomqc_control.claim_setup_recovery(p_lease_ms integer,p_bindings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  w roomqc_control.workspaces%ROWTYPE;j roomqc_control.provisioning_jobs%ROWTYPE;
  d roomqc_control.setup_dispatches%ROWTYPE;v_now timestamptz;v_token uuid;v_url text;v_credential_ref text;v_code text;b jsonb;approval record;
BEGIN
  IF p_lease_ms IS NULL OR p_lease_ms NOT BETWEEN 100 AND 300000
    OR jsonb_typeof(p_bindings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_SETUP_LEASE' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_bindings) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'INVALID_SETUP_BINDINGS' USING ERRCODE='22023';
  END IF;
  -- Shared admission lock fences cluster commands/import; worker claims can run
  -- concurrently. All paths then lock workspace -> job -> dispatch -> cluster.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(727001);
  SELECT x.* INTO w FROM roomqc_control.workspaces x
    JOIN roomqc_control.provisioning_jobs q ON q.workspace_id=x.id
    WHERE x.cluster_id IN (SELECT value->>'clusterId' FROM jsonb_array_elements(p_bindings))
      AND ((q.state IN ('queued','retry') AND q.next_attempt_at<=clock_timestamp())
        OR (q.state='leased' AND q.lease_until<=clock_timestamp()))
    ORDER BY CASE WHEN q.state='leased' THEN q.lease_until ELSE q.next_attempt_at END,x.id
    LIMIT 1 FOR UPDATE OF x SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO j FROM roomqc_control.provisioning_jobs WHERE workspace_id=w.id
    AND state NOT IN ('succeeded','cancelled') FOR UPDATE;
  IF j.id IS NULL THEN RETURN NULL; END IF;
  IF j.dispatch_id IS NOT NULL THEN
    SELECT * INTO d FROM roomqc_control.setup_dispatches WHERE id=j.dispatch_id FOR UPDATE;
  END IF;
  SELECT api_url,credential_ref INTO v_url,v_credential_ref FROM roomqc_control.clusters WHERE id=w.cluster_id FOR SHARE;
  SELECT value INTO b FROM jsonb_array_elements(p_bindings) WHERE value->>'clusterId'=w.cluster_id LIMIT 1;
  SELECT ra.*,r.epoch AS current_epoch INTO approval FROM roomqc_control.release_authority r
    JOIN roomqc_control.release_approvals ra ON ra.approval_id=r.approval_id
    JOIN roomqc_control.clusters c ON c.id=r.cluster_id AND c.host_id=ra.host_id AND c.inventory_ref=ra.inventory_ref
    JOIN roomqc_control.hosts h ON h.id=c.host_id AND h.environment=ra.environment
    WHERE r.cluster_id=w.cluster_id AND r.state='active'
      AND NOT EXISTS (SELECT 1 FROM roomqc_control.release_key_revocations k WHERE k.key_fingerprint=ra.key_fingerprint);
  v_now:=clock_timestamp();
  IF NOT ((j.state IN ('queued','retry') AND j.next_attempt_at<=v_now)
    OR (j.state='leased' AND j.lease_until<=v_now)) THEN RETURN NULL; END IF;
  IF j.state='leased' THEN
    UPDATE roomqc_control.setup_recovery_attempts SET outcome='lease_expired',error_code='SETUP_LEASE_EXPIRED',finished_at=v_now
      WHERE job_id=j.id AND lease_token=j.lease_token AND outcome='claimed';
  END IF;
  v_code:=CASE
    WHEN j.deadline_at<=v_now THEN 'SETUP_DEADLINE_EXCEEDED'
    WHEN j.attempts>=j.max_attempts THEN 'SETUP_ATTEMPTS_EXHAUSTED'
    WHEN approval.approval_id IS NULL OR approval.current_epoch<>approval.epoch
      OR b->>'approvalId' IS DISTINCT FROM approval.approval_id::text OR b->'epoch' IS DISTINCT FROM to_jsonb(approval.epoch)
      OR b->>'envelopeDigest' IS DISTINCT FROM approval.envelope_digest
      OR b->>'credentialRef' IS DISTINCT FROM v_credential_ref
      OR extract(epoch FROM v_now)*1000<approval.not_before_ms OR extract(epoch FROM v_now)*1000>=approval.expires_at_ms
      THEN 'SETUP_RELEASE_CHANGED'
    WHEN d.id IS NULL THEN 'SETUP_DISPATCH_MISSING'
    WHEN d.terminal_state IS NOT NULL THEN 'SETUP_DISPATCH_TERMINAL'
    WHEN w.status<>'provisioning' OR w.tenant_id IS NOT NULL OR w.hotel_id IS NOT NULL OR v_url IS NULL
      OR d.workspace_id IS DISTINCT FROM w.id OR d.owner_id IS DISTINCT FROM w.owner_id
      OR d.cluster_id IS DISTINCT FROM w.cluster_id OR d.routing_version IS DISTINCT FROM w.routing_version
      OR j.expected_routing_version IS DISTINCT FROM w.routing_version THEN 'SETUP_IDENTITY_CHANGED'
    ELSE NULL END;
  IF v_code IS NOT NULL THEN
    UPDATE roomqc_control.provisioning_jobs SET state='needs_review',lease_token=NULL,lease_until=NULL,
      last_error_code=v_code,updated_at=v_now WHERE id=j.id;
    INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES(j.id,w.id,v_code);
    RETURN jsonb_build_object('id',j.id,'exhausted',true,'code',v_code);
  END IF;
  v_token:=pg_catalog.gen_random_uuid();
  UPDATE roomqc_control.provisioning_jobs SET state='leased',attempts=attempts+1,lease_token=v_token,
    lease_until=LEAST(v_now+p_lease_ms*interval '1 millisecond',deadline_at,
      to_timestamp(approval.expires_at_ms/1000.0)),updated_at=v_now
    WHERE id=j.id RETURNING * INTO j;
  INSERT INTO roomqc_control.setup_recovery_attempts(job_id,attempt,lease_token,api_url,credential_ref,approval_id,approval_epoch,approval_digest,outcome)
    VALUES(j.id,j.attempts,v_token,v_url,v_credential_ref,approval.approval_id,approval.epoch,approval.envelope_digest,'claimed');
  INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES(v_token,w.id,'setup_recovery_claimed');
  -- Audit/trigger/lock waits consume the lease. Expiry rolls back the whole claim.
  IF clock_timestamp()>=j.lease_until OR clock_timestamp()>=j.deadline_at THEN
    RAISE EXCEPTION 'SETUP_LEASE_EXPIRED' USING ERRCODE='P7501';
  END IF;
  RETURN jsonb_build_object('id',j.id,'token',v_token,'attempt',j.attempts,'leaseUntil',j.lease_until,
    'approval',jsonb_build_object('approvalId',approval.approval_id,'epoch',approval.epoch,'envelopeDigest',approval.envelope_digest),
    'workspace',jsonb_build_object('id',w.id,'owner_id',w.owner_id,'cluster_id',w.cluster_id,
      'routing_version',w.routing_version,'api_url',v_url),
    'dispatch',jsonb_build_object('id',d.id,'workspace_id',d.workspace_id,'owner_id',d.owner_id,
      'cluster_id',d.cluster_id,'routing_version',d.routing_version,'payload_sha256',d.payload_sha256));
EXCEPTION WHEN SQLSTATE 'P7501' THEN RETURN NULL;
END;
$$;

CREATE FUNCTION roomqc_control.settle_setup_recovery(p_job uuid,p_token uuid,p_attempt integer,p_result jsonb,p_retry_base_ms integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_workspace uuid;w roomqc_control.workspaces%ROWTYPE;j roomqc_control.provisioning_jobs%ROWTYPE;
  d roomqc_control.setup_dispatches%ROWTYPE;a roomqc_control.setup_recovery_attempts%ROWTYPE;
  v_now timestamptz;v_url text;v_credential_ref text;v_state text;v_code text;v_outcome text;r jsonb;v_tenant uuid;v_hotel uuid;v_delay double precision;approval record;
BEGIN
  IF p_job IS NULL OR p_token IS NULL OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 30
    OR p_retry_base_ms IS NULL OR p_retry_base_ms NOT BETWEEN 10 AND 60000
    OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_SETUP_RESULT' USING ERRCODE='22023';
  END IF;
  v_outcome:=p_result->>'outcome';v_code:=p_result->>'code';r:=p_result->'receipt';
  IF v_outcome IS NULL OR v_outcome NOT IN ('terminal','retry','review')
    OR (v_outcome='terminal' AND (v_code IS NOT NULL OR jsonb_typeof(r) IS DISTINCT FROM 'object'))
    OR (v_outcome<>'terminal' AND (v_code IS NULL OR v_code NOT IN ('SETUP_BUSY','SETUP_INTERRUPTED',
      'SETUP_TIMEOUT','RECOVERY_UNAVAILABLE','RECOVERY_CREDENTIAL_INVALID','RECOVERY_CREDENTIAL_DENIED',
      'RECOVERY_RECEIPT_INVALID','RECOVERY_TARGET_CHANGED','SETUP_TARGET_UNCONFIGURED'))) THEN
    RAISE EXCEPTION 'INVALID_SETUP_RESULT' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(727001);
  SELECT workspace_id INTO v_workspace FROM roomqc_control.provisioning_jobs WHERE id=p_job;
  IF NOT FOUND THEN RETURN jsonb_build_object('settled',false); END IF;
  SELECT * INTO w FROM roomqc_control.workspaces WHERE id=v_workspace FOR UPDATE;
  SELECT * INTO j FROM roomqc_control.provisioning_jobs WHERE id=p_job FOR UPDATE;
  IF j.dispatch_id IS NOT NULL THEN
    SELECT * INTO d FROM roomqc_control.setup_dispatches WHERE id=j.dispatch_id FOR UPDATE;
  END IF;
  SELECT * INTO a FROM roomqc_control.setup_recovery_attempts WHERE job_id=p_job AND attempt=p_attempt;
  SELECT api_url,credential_ref INTO v_url,v_credential_ref FROM roomqc_control.clusters WHERE id=w.cluster_id FOR SHARE;
  SELECT ra.*,r.epoch AS current_epoch INTO approval FROM roomqc_control.release_authority r
    JOIN roomqc_control.release_approvals ra ON ra.approval_id=r.approval_id
    JOIN roomqc_control.clusters c ON c.id=r.cluster_id AND c.host_id=ra.host_id AND c.inventory_ref=ra.inventory_ref
    JOIN roomqc_control.hosts h ON h.id=c.host_id AND h.environment=ra.environment
    WHERE r.cluster_id=w.cluster_id AND r.state='active'
      AND NOT EXISTS (SELECT 1 FROM roomqc_control.release_key_revocations k WHERE k.key_fingerprint=ra.key_fingerprint);
  v_now:=clock_timestamp();
  IF j.id IS NULL OR w.id IS NULL OR d.id IS NULL OR a.job_id IS NULL OR j.workspace_id IS DISTINCT FROM w.id
    OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM p_token OR j.attempts<>p_attempt
    OR a.lease_token IS DISTINCT FROM p_token OR a.outcome<>'claimed'
    OR j.lease_until<=v_now OR j.deadline_at<=v_now OR a.api_url IS DISTINCT FROM v_url
    OR a.credential_ref IS DISTINCT FROM v_credential_ref
    OR approval.approval_id IS NULL OR approval.current_epoch<>approval.epoch
    OR a.approval_id IS DISTINCT FROM approval.approval_id OR a.approval_epoch IS DISTINCT FROM approval.epoch
    OR a.approval_digest IS DISTINCT FROM approval.envelope_digest
    OR extract(epoch FROM v_now)*1000<approval.not_before_ms OR extract(epoch FROM v_now)*1000>=approval.expires_at_ms
    OR w.status<>'provisioning' OR w.tenant_id IS NOT NULL OR w.hotel_id IS NOT NULL OR d.terminal_state IS NOT NULL
    OR d.workspace_id IS DISTINCT FROM w.id OR d.owner_id IS DISTINCT FROM w.owner_id
    OR d.cluster_id IS DISTINCT FROM w.cluster_id OR d.routing_version IS DISTINCT FROM w.routing_version
    OR j.expected_routing_version IS DISTINCT FROM w.routing_version THEN
    RETURN jsonb_build_object('settled',false);
  END IF;
  IF v_outcome='terminal' THEN
    IF r->'dispatch_id' IS DISTINCT FROM to_jsonb(d.id) OR r->'workspace_id' IS DISTINCT FROM to_jsonb(w.id)
      OR r->'owner_id' IS DISTINCT FROM to_jsonb(w.owner_id) OR r->'routing_version' IS DISTINCT FROM to_jsonb(w.routing_version)
      OR r->'payload_sha256' IS DISTINCT FROM to_jsonb(d.payload_sha256)
      OR r->>'state' IS NULL OR r->>'state' NOT IN ('closed','committed') THEN
      RAISE EXCEPTION 'INVALID_SETUP_RECEIPT' USING ERRCODE='22023';
    END IF;
    IF r->>'state'='closed' THEN
      IF r->'success' IS DISTINCT FROM 'false'::jsonb OR r->'tenant_id' IS DISTINCT FROM 'null'::jsonb
        OR r->'hotel_id' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'INVALID_SETUP_RECEIPT' USING ERRCODE='22023';
      END IF;
      v_state:='waiting_owner';v_code:='SETUP_DISPATCH_CLOSED';
    ELSE
      IF r->'success' IS DISTINCT FROM 'true'::jsonb
        OR COALESCE(r->>'tenant_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        OR COALESCE(r->>'hotel_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'INVALID_SETUP_RECEIPT' USING ERRCODE='22023';
      END IF;
      v_state:='succeeded';v_tenant:=(r->>'tenant_id')::uuid;v_hotel:=(r->>'hotel_id')::uuid;
    END IF;
    UPDATE roomqc_control.setup_dispatches SET terminal_state=r->>'state',tenant_id=v_tenant,hotel_id=v_hotel,
      settled_at=clock_timestamp() WHERE id=d.id;
    IF v_state='succeeded' THEN
      UPDATE roomqc_control.workspaces SET status='active',tenant_id=v_tenant,hotel_id=v_hotel,expires_at=NULL,
        last_error_code=NULL,updated_at=clock_timestamp() WHERE id=w.id;
    END IF;
  ELSE
    v_state:=CASE WHEN v_outcome='review' OR j.attempts>=j.max_attempts THEN 'needs_review' ELSE 'retry' END;
  END IF;
  v_delay:=LEAST(300000,p_retry_base_ms*power(2,LEAST(j.attempts-1,10)))*(0.5+pg_catalog.random()*0.5);
  UPDATE roomqc_control.provisioning_jobs SET state=v_state,lease_token=NULL,lease_until=NULL,last_error_code=v_code,
    next_attempt_at=LEAST(clock_timestamp()+v_delay*interval '1 millisecond',deadline_at),updated_at=clock_timestamp() WHERE id=j.id;
  UPDATE roomqc_control.setup_recovery_attempts SET outcome=v_state,error_code=v_code,finished_at=clock_timestamp()
    WHERE job_id=j.id AND attempt=p_attempt;
  INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES(p_token,w.id,'setup_recovery_'||v_state);
  -- Final wall-clock fence includes every write, immediate audit/trigger wait and
  -- lock above. Raising inside this block rolls all of those changes back.
  IF clock_timestamp()>=j.lease_until OR clock_timestamp()>=j.deadline_at THEN
    RAISE EXCEPTION 'SETUP_LEASE_EXPIRED' USING ERRCODE='P7501';
  END IF;
  RETURN jsonb_build_object('settled',true,'state',v_state);
EXCEPTION WHEN SQLSTATE 'P7501' THEN RETURN jsonb_build_object('settled',false);
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.claim_setup_recovery(integer,jsonb),
  roomqc_control.settle_setup_recovery(uuid,uuid,integer,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION roomqc_control.claim_setup_recovery(integer,jsonb),
  roomqc_control.settle_setup_recovery(uuid,uuid,integer,jsonb,integer) TO roomqc_control_setup_runtime;
ALTER FUNCTION roomqc_control.claim_setup_recovery(integer,jsonb) OWNER TO roomqc_control_setup_writer;
ALTER FUNCTION roomqc_control.settle_setup_recovery(uuid,uuid,integer,jsonb,integer) OWNER TO roomqc_control_setup_writer;
REVOKE CREATE ON SCHEMA roomqc_control FROM roomqc_control_setup_writer;
