-- Directory only. Read-only reader0016 is intentionally unchanged.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_backfill_runtime') THEN
    CREATE ROLE roomqc_control_backfill_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_backfill_writer') THEN
    CREATE ROLE roomqc_control_backfill_writer NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN('roomqc_control_backfill_runtime','roomqc_control_backfill_writer')
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member IN('roomqc_control_backfill_runtime'::regrole,'roomqc_control_backfill_writer'::regrole)
      OR roleid='roomqc_control_backfill_writer'::regrole) THEN
    RAISE EXCEPTION 'SETUP_BACKFILL_ROLE_UNSAFE';
  END IF;
END $$;

CREATE TABLE roomqc_control.setup_backfill_commands(
  caller name NOT NULL,command_id uuid NOT NULL,workspace_id uuid NOT NULL,cluster_id text NOT NULL,
  report_sha256 text NOT NULL CHECK(report_sha256 ~ '^[a-f0-9]{64}$'),
  expected_sha256 text NOT NULL CHECK(expected_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(caller,command_id)
);
REVOKE ALL ON roomqc_control.setup_backfill_commands FROM PUBLIC;
CREATE FUNCTION roomqc_control.guard_setup_backfill_command() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
  RAISE EXCEPTION 'SETUP_BACKFILL_COMMAND_IMMUTABLE' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION roomqc_control.guard_setup_backfill_command() FROM PUBLIC;
CREATE TRIGGER setup_backfill_command_immutable BEFORE UPDATE OR DELETE ON roomqc_control.setup_backfill_commands
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_setup_backfill_command();

GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_backfill_runtime;
GRANT SELECT(version,checksum) ON roomqc_control.schema_migrations TO roomqc_control_backfill_runtime;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO roomqc_control_backfill_runtime;
GRANT USAGE,CREATE ON SCHEMA roomqc_control TO roomqc_control_backfill_writer;
GRANT SELECT ON roomqc_control.workspaces,roomqc_control.provisioning_jobs,roomqc_control.setup_dispatches,
  roomqc_control.clusters,roomqc_control.hosts,roomqc_control.release_authority,roomqc_control.release_approvals,
  roomqc_control.release_key_revocations,roomqc_control.setup_recovery_attempts,roomqc_control.setup_backfill_commands
  TO roomqc_control_backfill_writer;
GRANT INSERT ON roomqc_control.provisioning_jobs,roomqc_control.setup_backfill_commands,roomqc_control.attempts
  TO roomqc_control_backfill_writer;
GRANT USAGE ON SEQUENCE roomqc_control.attempts_id_seq TO roomqc_control_backfill_writer;
GRANT UPDATE(status,tenant_id,hotel_id,expires_at,last_error_code,updated_at) ON roomqc_control.workspaces TO roomqc_control_backfill_writer;
GRANT UPDATE(state,lease_token,lease_until,last_error_code,updated_at) ON roomqc_control.provisioning_jobs TO roomqc_control_backfill_writer;
GRANT UPDATE(id) ON roomqc_control.setup_dispatches,roomqc_control.clusters TO roomqc_control_backfill_writer;
GRANT UPDATE(outcome,error_code,finished_at) ON roomqc_control.setup_recovery_attempts TO roomqc_control_backfill_writer;

-- Private invoker helper. Projection matches reader0016, including timestamp
-- microseconds. It is never directly executable by a runtime or PUBLIC.
CREATE FUNCTION roomqc_control.setup_backfill_snapshot_value(p_workspace uuid,p_cluster text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'workspace',jsonb_build_object('id',w.id,'cluster_id',w.cluster_id,'owner_id',w.owner_id,'tenant_id',w.tenant_id,
    'hotel_id',w.hotel_id,'status',w.status,'routing_version',w.routing_version,'created_at',w.created_at,'updated_at',w.updated_at),
  'job',CASE WHEN j.id IS NOT NULL THEN jsonb_build_object('id',j.id,'workspace_id',j.workspace_id,'state',j.state,
    'attempts',j.attempts,'lease_token',j.lease_token,'lease_until',j.lease_until,'expected_routing_version',j.expected_routing_version,
    'dispatch_id',j.dispatch_id,'next_attempt_at',j.next_attempt_at,'created_at',j.created_at,'updated_at',j.updated_at,
    'max_attempts',j.max_attempts,'deadline_at',j.deadline_at) END,
  'dispatch',CASE WHEN d.id IS NOT NULL THEN jsonb_build_object('id',d.id,'workspace_id',d.workspace_id,'cluster_id',d.cluster_id,
    'owner_id',d.owner_id,'routing_version',d.routing_version,'payload_sha256',d.payload_sha256,'terminal_state',d.terminal_state,
    'tenant_id',d.tenant_id,'hotel_id',d.hotel_id,'created_at',d.created_at,'settled_at',d.settled_at) END,
  'cluster',jsonb_build_object('id',c.id,'api_url',c.api_url,'status',c.status,'credential_ref',c.credential_ref,'host_id',c.host_id,'inventory_ref',c.inventory_ref),
  'authority',CASE WHEN a.cluster_id IS NOT NULL THEN jsonb_build_object('cluster_id',a.cluster_id,'approval_id',a.approval_id,
    'epoch',a.epoch,'row_version',a.row_version,'state',a.state,'updated_at',a.updated_at) END,
  'approval',CASE WHEN p.approval_id IS NOT NULL THEN jsonb_build_object('approval_id',p.approval_id,'cluster_id',p.cluster_id,
    'epoch',p.epoch,'envelope_digest',p.envelope_digest,'key_fingerprint',p.key_fingerprint,'host_id',p.host_id,
    'inventory_ref',p.inventory_ref,'environment',p.environment,'not_before_ms',p.not_before_ms,'expires_at_ms',p.expires_at_ms) END,
  'environment',h.environment,'keyRevoked',k.key_fingerprint IS NOT NULL)
 FROM roomqc_control.workspaces w JOIN roomqc_control.clusters c ON c.id=w.cluster_id
 LEFT JOIN roomqc_control.hosts h ON h.id=c.host_id
 LEFT JOIN LATERAL(SELECT q.* FROM roomqc_control.provisioning_jobs q WHERE q.workspace_id=w.id
   ORDER BY (q.state NOT IN('succeeded','cancelled')) DESC,q.created_at DESC,q.id DESC LIMIT 1) j ON true
 LEFT JOIN LATERAL(SELECT x.* FROM roomqc_control.setup_dispatches x WHERE x.workspace_id=w.id AND(j.id IS NULL OR x.id=j.dispatch_id)
   ORDER BY x.created_at DESC,x.id DESC LIMIT 1) d ON true
 LEFT JOIN roomqc_control.release_authority a ON a.cluster_id=c.id
 LEFT JOIN roomqc_control.release_approvals p ON p.approval_id=a.approval_id
 LEFT JOIN roomqc_control.release_key_revocations k ON k.key_fingerprint=p.key_fingerprint
 WHERE w.id=p_workspace AND w.cluster_id=p_cluster
$$;
REVOKE ALL ON FUNCTION roomqc_control.setup_backfill_snapshot_value(uuid,text) FROM PUBLIC;
ALTER FUNCTION roomqc_control.setup_backfill_snapshot_value(uuid,text) OWNER TO roomqc_control_backfill_writer;

CREATE FUNCTION roomqc_control.read_setup_backfill_snapshot(p_workspace uuid,p_cluster text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT roomqc_control.setup_backfill_snapshot_value(p_workspace,p_cluster)
$$;
REVOKE ALL ON FUNCTION roomqc_control.read_setup_backfill_snapshot(uuid,text) FROM PUBLIC;
ALTER FUNCTION roomqc_control.read_setup_backfill_snapshot(uuid,text) OWNER TO roomqc_control_backfill_writer;

CREATE FUNCTION roomqc_control.apply_setup_backfill(p_key uuid,p_workspace uuid,p_cluster text,p_report_sha text,
  p_snapshot_sha text,p_group text,p_binding jsonb,p_expected jsonb,p_observation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_payload jsonb;v_previous roomqc_control.setup_backfill_commands%ROWTYPE;v_snapshot jsonb;v_after jsonb;
  w roomqc_control.workspaces%ROWTYPE;j roomqc_control.provisioning_jobs%ROWTYPE;d roomqc_control.setup_dispatches%ROWTYPE;
  v_result jsonb;v_outcome text;v_reason text;v_now timestamptz;v_valid_release boolean:=false;v_job uuid;
  r jsonb;v_observed text;v_receipt_matches boolean;v_applied boolean:=false;v_deadline timestamptz;
BEGIN
  IF p_key IS NULL OR p_workspace IS NULL OR p_cluster IS NULL OR p_cluster !~ '^[a-z][a-z0-9-]{1,39}$'
    OR p_report_sha IS NULL OR p_report_sha !~ '^[a-f0-9]{64}$' OR p_snapshot_sha IS NULL OR p_snapshot_sha !~ '^[a-f0-9]{64}$'
    OR p_group IS NULL OR p_group NOT IN('active_valid','committed_pending','dispatch_pending','closed','legacy_unknown','conflict','unavailable')
    OR jsonb_typeof(p_binding) IS DISTINCT FROM 'object'
    OR (p_expected IS NOT NULL AND jsonb_typeof(p_expected) IS DISTINCT FROM 'object')
    OR jsonb_typeof(p_observation) IS DISTINCT FROM 'object'
    OR p_observation->>'status' IS NULL OR p_observation->>'status' NOT IN('present','missing','unavailable','conflict') THEN
    RAISE EXCEPTION 'INVALID_SETUP_BACKFILL' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_binding))<>5
    OR NOT(p_binding ?& ARRAY['clusterId','approvalId','epoch','envelopeDigest','credentialRef'])
    OR octet_length(p_binding::text)>4096 OR octet_length(p_observation::text)>8192
    OR octet_length(p_expected::text)>65536 THEN
    RAISE EXCEPTION 'INVALID_SETUP_BACKFILL' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('workspaceId',p_workspace,'clusterId',p_cluster,'reportSha256',p_report_sha,
    'snapshotSha256',p_snapshot_sha,'group',p_group,'binding',p_binding);
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(727001);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(session_user::text||':'||p_key::text,727017));
  SELECT * INTO v_previous FROM roomqc_control.setup_backfill_commands WHERE caller=session_user AND command_id=p_key;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'SETUP_BACKFILL_KEY_CONFLICT' USING ERRCODE='P7502'; END IF;
    RETURN v_previous.result;
  END IF;
  SELECT * INTO w FROM roomqc_control.workspaces WHERE id=p_workspace FOR UPDATE;
  IF w.id IS NOT NULL THEN
    SELECT * INTO j FROM roomqc_control.provisioning_jobs WHERE workspace_id=w.id
      ORDER BY (state NOT IN('succeeded','cancelled')) DESC,created_at DESC,id DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO d FROM roomqc_control.setup_dispatches WHERE workspace_id=w.id AND(j.id IS NULL OR id=j.dispatch_id)
      ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
    PERFORM 1 FROM roomqc_control.clusters WHERE id=w.cluster_id FOR SHARE;
  END IF;
  v_snapshot:=roomqc_control.setup_backfill_snapshot_value(p_workspace,p_cluster);v_now:=clock_timestamp();v_job:=j.id;
  v_valid_release:=COALESCE(v_snapshot->'authority'->>'state'='active'
    AND v_snapshot->'authority'->'approval_id'=v_snapshot->'approval'->'approval_id'
    AND v_snapshot->'authority'->'epoch'=v_snapshot->'approval'->'epoch'
    AND v_snapshot->'approval'->>'cluster_id'=p_cluster
    AND v_snapshot->'approval'->'host_id'=v_snapshot->'cluster'->'host_id'
    AND v_snapshot->'approval'->'inventory_ref'=v_snapshot->'cluster'->'inventory_ref'
    AND v_snapshot->'approval'->'environment'=v_snapshot->'environment'
    AND v_snapshot->'keyRevoked'='false'::jsonb
    AND extract(epoch FROM v_now)*1000 >= (v_snapshot->'approval'->>'not_before_ms')::numeric
    AND extract(epoch FROM v_now)*1000 < (v_snapshot->'approval'->>'expires_at_ms')::numeric
    AND p_binding->>'clusterId'=p_cluster AND p_binding->'approvalId'=v_snapshot->'approval'->'approval_id'
    AND p_binding->'epoch'=v_snapshot->'approval'->'epoch'
    AND p_binding->'envelopeDigest'=v_snapshot->'approval'->'envelope_digest'
    AND p_binding->'credentialRef'=v_snapshot->'cluster'->'credential_ref',false);
  v_observed:=p_observation->>'status';r:=p_observation->'receipt';
  v_receipt_matches:=COALESCE(v_observed='present' AND jsonb_typeof(r)='object'
    AND r->'workspace_id'=to_jsonb(w.id) AND r->'owner_id'=to_jsonb(w.owner_id)
    AND COALESCE(r->>'tenant_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND COALESCE(r->>'hotel_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',false);

  IF v_snapshot IS NULL OR p_expected IS NULL OR v_snapshot IS DISTINCT FROM p_expected THEN
    v_outcome:='skipped_stale';v_reason:='SETUP_SNAPSHOT_CHANGED';
  ELSIF w.status NOT IN('active','provisioning') OR w.owner_id IS NULL THEN
    v_outcome:='manual_review';v_reason:='SETUP_STATE_PROTECTED';
  ELSIF NOT v_valid_release OR v_snapshot->'cluster'->>'status'='offline' OR v_observed='unavailable' OR p_group='unavailable' THEN
    v_outcome:='unavailable';v_reason:='SETUP_BACKFILL_UNAVAILABLE';
  ELSIF v_observed='conflict' OR p_group='conflict' OR (v_observed='present' AND NOT v_receipt_matches)
    OR (j.id IS NOT NULL AND (j.expected_routing_version<>w.routing_version OR j.dispatch_id IS DISTINCT FROM d.id))
    OR (d.id IS NOT NULL AND (d.owner_id IS DISTINCT FROM w.owner_id OR d.cluster_id<>w.cluster_id OR d.routing_version<>w.routing_version)) THEN
    v_outcome:='conflict';v_reason:='SETUP_BACKFILL_IDENTITY_CONFLICT';
  ELSIF w.status='active' THEN
    IF p_group='active_valid' AND v_receipt_matches AND r->'tenant_id'=to_jsonb(w.tenant_id) AND r->'hotel_id'=to_jsonb(w.hotel_id)
      AND (j.id IS NULL OR j.state IN('succeeded','cancelled'))
      AND (d.id IS NULL OR (d.terminal_state='committed' AND d.tenant_id=w.tenant_id AND d.hotel_id=w.hotel_id)) THEN
      v_outcome:='no_op';v_reason:='SETUP_ACTIVE_VERIFIED';
    ELSE v_outcome:='manual_review';v_reason:='SETUP_ACTIVE_CONFLICT';END IF;
  ELSIF w.tenant_id IS NOT NULL OR w.hotel_id IS NOT NULL THEN
    v_outcome:='conflict';v_reason:='SETUP_BINDING_CONFLICT';
  ELSIF j.state='leased' AND j.lease_until>v_now THEN
    v_outcome:='skipped_busy';v_reason:='SETUP_LEASE_HELD';
  ELSIF d.id IS NULL OR p_group='legacy_unknown' THEN
    v_outcome:='manual_review';v_reason:='SETUP_DISPATCH_MISSING';
  ELSIF j.state='waiting_owner' AND d.terminal_state='closed' AND p_group='closed' AND v_observed='missing' THEN
    v_outcome:='no_op';v_reason:='SETUP_CLOSED_VERIFIED';
  ELSIF j.id IS NOT NULL AND (j.state IN('succeeded','cancelled','needs_review','waiting_owner')
    OR j.deadline_at<=v_now OR j.attempts>=j.max_attempts) THEN
    v_outcome:='manual_review';v_reason:='SETUP_JOB_BUDGET_PROTECTED';
  ELSIF j.id IS NULL AND (d.created_at>v_now OR d.created_at+interval '24 hours'<=v_now) THEN
    v_outcome:='manual_review';v_reason:='SETUP_ORIGINAL_DEADLINE_EXCEEDED';
  ELSIF d.terminal_state='committed' THEN
    IF p_group='committed_pending' AND v_receipt_matches AND r->'tenant_id'=to_jsonb(d.tenant_id) AND r->'hotel_id'=to_jsonb(d.hotel_id) THEN
      v_outcome:='activated';v_reason:='SETUP_COMMITTED_VERIFIED';
    ELSE v_outcome:='conflict';v_reason:='SETUP_COMMITTED_CONFLICT';END IF;
  ELSIF d.terminal_state='closed' THEN
    IF p_group='closed' AND v_observed='missing' THEN v_outcome:='waiting_owner';v_reason:='SETUP_CLOSED_VERIFIED';
    ELSE v_outcome:='conflict';v_reason:='SETUP_CLOSED_CONFLICT';END IF;
  ELSIF p_group='dispatch_pending' THEN
    v_outcome:=CASE WHEN j.id IS NULL THEN 'queued' ELSE 'reused_job' END;v_reason:='SETUP_DISPATCH_RECONCILE';
  ELSE v_outcome:='manual_review';v_reason:='SETUP_PROOF_REQUIRED';END IF;

  IF v_outcome IN('activated','waiting_owner','queued') THEN
    IF j.id IS NULL THEN
      v_job:=pg_catalog.gen_random_uuid();v_deadline:=d.created_at+interval '24 hours';
      INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version,dispatch_id,state,created_at,deadline_at)
        VALUES(v_job,w.id,w.routing_version,d.id,CASE v_outcome WHEN 'activated' THEN 'succeeded' WHEN 'waiting_owner' THEN 'waiting_owner' ELSE 'queued' END,
          d.created_at,v_deadline);
    ELSE
      IF j.state='leased' THEN
        UPDATE roomqc_control.setup_recovery_attempts SET outcome='lease_expired',error_code='SETUP_LEASE_EXPIRED',finished_at=clock_timestamp()
          WHERE job_id=j.id AND lease_token=j.lease_token AND outcome='claimed';
      END IF;
      UPDATE roomqc_control.provisioning_jobs SET state=CASE WHEN v_outcome='activated' THEN 'succeeded' ELSE 'waiting_owner' END,
        lease_token=NULL,lease_until=NULL,last_error_code=CASE WHEN v_outcome='waiting_owner' THEN 'SETUP_DISPATCH_CLOSED' ELSE NULL END,
        updated_at=clock_timestamp() WHERE id=j.id;
    END IF;
    IF v_outcome='activated' THEN
      UPDATE roomqc_control.workspaces SET status='active',tenant_id=d.tenant_id,hotel_id=d.hotel_id,expires_at=NULL,
        last_error_code=NULL,updated_at=clock_timestamp() WHERE id=w.id;
    END IF;
    v_applied:=true;
  END IF;
  v_result:=jsonb_build_object('commandId',p_key,'workspaceId',p_workspace,'clusterId',p_cluster,'jobId',v_job,
    'outcome',v_outcome,'reason',v_reason,'applied',v_applied);
  INSERT INTO roomqc_control.setup_backfill_commands(caller,command_id,workspace_id,cluster_id,report_sha256,expected_sha256,payload,result)
    VALUES(session_user,p_key,p_workspace,p_cluster,p_report_sha,p_snapshot_sha,v_payload,v_result);
  IF w.id IS NOT NULL THEN
    INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES(p_key,w.id,'setup_backfill_'||v_outcome);
  END IF;
  IF v_valid_release THEN
    v_after:=roomqc_control.setup_backfill_snapshot_value(p_workspace,p_cluster);
    IF v_after->'cluster' IS DISTINCT FROM v_snapshot->'cluster' OR v_after->'authority' IS DISTINCT FROM v_snapshot->'authority'
      OR v_after->'approval' IS DISTINCT FROM v_snapshot->'approval' OR v_after->'keyRevoked' IS DISTINCT FROM 'false'::jsonb
      OR extract(epoch FROM clock_timestamp())*1000 >= (v_snapshot->'approval'->>'expires_at_ms')::numeric THEN
      RAISE EXCEPTION 'SETUP_BACKFILL_RELEASE_EXPIRED' USING ERRCODE='P7501';
    END IF;
    IF v_applied AND j.id IS NOT NULL AND clock_timestamp()>=j.deadline_at THEN
      RAISE EXCEPTION 'SETUP_BACKFILL_DEADLINE_EXPIRED' USING ERRCODE='P7501';
    END IF;
    IF v_applied AND j.id IS NULL AND clock_timestamp()>=v_deadline THEN
      RAISE EXCEPTION 'SETUP_BACKFILL_DEADLINE_EXPIRED' USING ERRCODE='P7501';
    END IF;
  END IF;
  RETURN v_result;
EXCEPTION WHEN SQLSTATE 'P7501' THEN
  RETURN jsonb_build_object('commandId',p_key,'workspaceId',p_workspace,'clusterId',p_cluster,
    'outcome','retry_later','reason','SETUP_BACKFILL_FENCE_EXPIRED','applied',false);
END $$;
REVOKE ALL ON FUNCTION roomqc_control.apply_setup_backfill(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC;
ALTER FUNCTION roomqc_control.apply_setup_backfill(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb) OWNER TO roomqc_control_backfill_writer;
GRANT EXECUTE ON FUNCTION roomqc_control.read_setup_backfill_snapshot(uuid,text),
  roomqc_control.apply_setup_backfill(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb) TO roomqc_control_backfill_runtime;
REVOKE CREATE ON SCHEMA roomqc_control FROM roomqc_control_backfill_writer;
