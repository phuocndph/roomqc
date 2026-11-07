-- A validation response is not proof that another same-key request did not
-- commit. Persist abandonment under the command's existing key lock before a
-- client can discard pending recovery data or submit a new request identity.
CREATE TABLE private.employee_authority_cancellations (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  target_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.employee_authority_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.employee_authority_cancellations FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE private.employee_authority_cancellations IS
  'Durable same-key no-future-commit outcomes. No tokens, cascade deletion, expiry or automatic garbage collection; retention must preserve offline client recovery safety.';

-- Syntactic identity intentionally does not require the current business
-- catalog. A validly formed request rejected by that catalog must still be
-- recoverable, and old completed receipts remain readable after catalog drift.
CREATE FUNCTION private.employee_authority_command_identity(
  p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_entry jsonb; v_entries jsonb;
BEGIN
  IF p_target_id IS NULL OR p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('grants','hotels')
    OR p_expected_version IS NULL OR p_expected_version !~ '^(0|[1-9][0-9]{0,18})$'
    OR p_entries IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_COMMAND' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_entries)>256 OR octet_length(p_entries::text)>131072 THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_PAYLOAD_TOO_LARGE' USING ERRCODE='22023';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_ENTRY' USING ERRCODE='22023';
    END IF;
    IF p_kind='grants' THEN
      IF (SELECT count(*) FROM jsonb_object_keys(v_entry))<>3
        OR jsonb_typeof(v_entry->'module') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_entry->'action') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_entry->'enabled') IS DISTINCT FROM 'boolean'
        OR length(v_entry->>'module') NOT BETWEEN 1 AND 100
        OR length(v_entry->>'action') NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_GRANT' USING ERRCODE='22023';
      END IF;
    ELSE
      IF (SELECT count(*) FROM jsonb_object_keys(v_entry))<>6
        OR jsonb_typeof(v_entry->'hotel_id') IS DISTINCT FROM 'string'
        OR EXISTS(SELECT 1 FROM unnest(ARRAY['can_create_managers','can_create_staff','can_view_reports',
          'can_export_data','can_approve_requests']) flag WHERE jsonb_typeof(v_entry->flag) IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_MEMBERSHIP' USING ERRCODE='22023';
      END IF;
      PERFORM (v_entry->>'hotel_id')::uuid;
    END IF;
  END LOOP;
  IF p_kind='grants' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('module',e->>'module','action',
      CASE e->>'action' WHEN 'edit' THEN 'update' ELSE e->>'action' END,'enabled',(e->>'enabled')::boolean)
      ORDER BY e->>'module',CASE e->>'action' WHEN 'edit' THEN 'update' ELSE e->>'action' END),'[]'::jsonb)
      INTO v_entries FROM jsonb_array_elements(p_entries) e;
    IF (SELECT count(*) FROM (SELECT DISTINCT e->>'module',e->>'action' FROM jsonb_array_elements(v_entries) e) d)
      <>jsonb_array_length(v_entries) THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_DUPLICATE_GRANT' USING ERRCODE='22023';
    END IF;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_set(e,'{hotel_id}',to_jsonb((e->>'hotel_id')::uuid))
      ORDER BY (e->>'hotel_id')::uuid),'[]'::jsonb) INTO v_entries FROM jsonb_array_elements(p_entries) e;
    IF (SELECT count(DISTINCT (e->>'hotel_id')::uuid) FROM jsonb_array_elements(v_entries) e)<>jsonb_array_length(v_entries) THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_DUPLICATE_MEMBERSHIP' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN jsonb_build_object('target_id',p_target_id,'kind',p_kind,'entries',v_entries,'expected_version',p_expected_version);
END;
$fn$;
REVOKE ALL ON FUNCTION private.employee_authority_command_identity(uuid,text,jsonb,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- The old implementation remains the one atomic mutation. Only the new
-- guarded wrapper can reach it; old direct grants cannot bypass a tombstone.
ALTER FUNCTION private.replace_employee_authority(uuid,text,jsonb,text,uuid)
  RENAME TO apply_employee_authority_command;
REVOKE ALL ON FUNCTION private.apply_employee_authority_command(uuid,text,jsonb,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.replace_employee_authority(
  p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_payload jsonb;
  v_receipt private.employee_authority_receipts%ROWTYPE;
  v_cancel private.employee_authority_cancellations%ROWTYPE;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  v_payload:=private.employee_authority_command_identity(p_target_id,p_kind,p_entries,p_expected_version,p_request_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor.id::text||':'||p_request_id::text,26145640));
  PERFORM private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_receipt FROM private.employee_authority_receipts WHERE actor_id=v_actor.id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_receipt.result;
  END IF;
  SELECT * INTO v_cancel FROM private.employee_authority_cancellations WHERE actor_id=v_actor.id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_cancel.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_cancel.result;
  END IF;
  RETURN private.apply_employee_authority_command(p_target_id,p_kind,p_entries,p_expected_version,p_request_id);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replace_employee_authority(uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.replace_employee_authority(uuid,text,jsonb,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.replace_employee_authority(p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.replace_employee_authority(p_target_id,p_kind,p_entries,p_expected_version,p_request_id);
$fn$;

CREATE FUNCTION private.cancel_employee_authority_command(
  p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_target public.users%ROWTYPE; v_payload jsonb; v_result jsonb;
  v_receipt private.employee_authority_receipts%ROWTYPE;
  v_cancel private.employee_authority_cancellations%ROWTYPE;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  v_payload:=private.employee_authority_command_identity(p_target_id,p_kind,p_entries,p_expected_version,p_request_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor.id::text||':'||p_request_id::text,26145640));
  v_target:=private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_receipt FROM private.employee_authority_receipts WHERE actor_id=v_actor.id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_receipt.result;
  END IF;
  SELECT * INTO v_cancel FROM private.employee_authority_cancellations WHERE actor_id=v_actor.id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_cancel.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_cancel.result;
  END IF;
  v_result:=jsonb_build_object('state','cancelled','reason','not_applied','target_id',p_target_id,'kind',p_kind,
    'request_id',p_request_id,'expected_version',p_expected_version,'entries',v_payload->'entries');
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,
    action,description,new_values) VALUES(v_actor.tenant_id,v_actor.id,v_actor.full_name,v_actor.role,
      'user',p_target_id,v_target.full_name,'update','Kết thúc lần lưu quyền chưa được áp dụng',v_result);
  INSERT INTO private.employee_authority_cancellations(actor_id,request_id,target_id,tenant_id,payload,result)
    VALUES(v_actor.id,p_request_id,p_target_id,v_actor.tenant_id,v_payload,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.cancel_employee_authority_command(uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cancel_employee_authority_command(uuid,text,jsonb,text,uuid) TO authenticated;
CREATE FUNCTION public.cancel_employee_authority_command(p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.cancel_employee_authority_command(p_target_id,p_kind,p_entries,p_expected_version,p_request_id);
$fn$;
REVOKE ALL ON FUNCTION public.cancel_employee_authority_command(uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_employee_authority_command(uuid,text,jsonb,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_employee_authority_command_result(p_target_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_result jsonb;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  PERFORM private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  SELECT result INTO v_result FROM private.employee_authority_receipts
    WHERE actor_id=v_actor.id AND request_id=p_request_id AND target_id=p_target_id AND tenant_id=v_actor.tenant_id;
  IF FOUND THEN RETURN v_result; END IF;
  SELECT result INTO v_result FROM private.employee_authority_cancellations
    WHERE actor_id=v_actor.id AND request_id=p_request_id AND target_id=p_target_id AND tenant_id=v_actor.tenant_id;
  RETURN COALESCE(v_result,jsonb_build_object('state','not_found'));
END;
$fn$;
COMMENT ON FUNCTION public.cancel_employee_authority_command(uuid,text,jsonb,text,uuid) IS
  'Reauthorized exact-key abandonment: returns an existing success or durable cancellation that fences all future same-key writes. Not a rollback of an already committed save.';
NOTIFY pgrst,'reload schema';
