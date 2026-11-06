-- Directory T12 protocol. A close tombstone is committed under the same
-- workspace lock as provisioning, so a late request cannot create business data.
-- Cutover must drain pre-migration RPC invocations before adopting this protocol.
DO $role$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_setup_recovery') THEN
    CREATE ROLE roomqc_setup_recovery NOLOGIN NOINHERIT;
  ELSIF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_setup_recovery'
    AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname='roomqc_setup_recovery') THEN
    RAISE EXCEPTION 'UNSAFE_SETUP_RECOVERY_ROLE';
  END IF;
END;
$role$;
GRANT roomqc_setup_recovery TO authenticator;
GRANT USAGE ON SCHEMA public TO roomqc_setup_recovery;
GRANT EXECUTE ON FUNCTION public.get_workspace_provisioning(uuid) TO roomqc_setup_recovery;
CREATE TABLE private.workspace_setup_dispatches (
  dispatch_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  routing_version integer NOT NULL CHECK (routing_version>0),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('closed','committed')),
  tenant_id uuid,
  hotel_id uuid,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN ('DISPATCH_CLOSED','DISPATCH_REJECTED')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  finished_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((state='committed')=(tenant_id IS NOT NULL AND hotel_id IS NOT NULL)),
  CHECK (state='committed' OR (tenant_id IS NULL AND hotel_id IS NULL))
);
CREATE INDEX workspace_setup_dispatches_workspace_idx
  ON private.workspace_setup_dispatches(workspace_id,routing_version DESC);
ALTER TABLE private.workspace_setup_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workspace_setup_dispatches FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;

CREATE FUNCTION private.setup_dispatch_identity(
  p_workspace_id uuid,p_dispatch_id uuid,p_owner_id uuid,p_routing_version integer,p_payload_sha256 text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_dispatch private.workspace_setup_dispatches%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_dispatch_id IS NULL OR p_owner_id IS NULL
    OR p_routing_version IS NULL OR p_routing_version<1 OR p_payload_sha256 IS NULL
    OR p_payload_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_SETUP_DISPATCH' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_dispatch FROM private.workspace_setup_dispatches WHERE dispatch_id=p_dispatch_id;
  IF FOUND AND (v_dispatch.workspace_id<>p_workspace_id OR v_dispatch.owner_id<>p_owner_id
    OR v_dispatch.routing_version<>p_routing_version OR v_dispatch.payload_sha256<>p_payload_sha256) THEN
    RAISE EXCEPTION 'SETUP_DISPATCH_CONFLICT' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM private.workspace_setup_dispatches WHERE workspace_id=p_workspace_id
    AND routing_version>p_routing_version) THEN
    RAISE EXCEPTION 'SETUP_ROUTING_CHANGED' USING ERRCODE='42501';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION private.setup_dispatch_identity(uuid,uuid,uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;

CREATE FUNCTION private.setup_dispatch_result(p_dispatch_id uuid,p_idempotent boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT pg_catalog.jsonb_build_object('dispatch_id',dispatch_id,'workspace_id',workspace_id,
    'owner_id',owner_id,'routing_version',routing_version,'payload_sha256',payload_sha256,
    'state',state,'success',state='committed','tenant_id',tenant_id,'hotel_id',hotel_id,
    'last_error_code',last_error_code,'idempotent',p_idempotent)
  FROM private.workspace_setup_dispatches WHERE dispatch_id=p_dispatch_id;
$fn$;
REVOKE ALL ON FUNCTION private.setup_dispatch_result(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;

-- Preserve the existing service-only entry point for unadopted workspaces.
-- Once any dispatch exists, only the fenced wrapper below may invoke it.
CREATE OR REPLACE FUNCTION public.provision_workspace_registration(
  p_workspace_id uuid,p_owner_id uuid,p_fields jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM private.registration_owner(p_owner_id,p_fields->>'registrationSessionId',
    COALESCE(p_fields ? 'registrationSessionId',false));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,727002));
  IF EXISTS(SELECT 1 FROM private.workspace_setup_dispatches WHERE workspace_id=p_workspace_id)
    AND NOT EXISTS(SELECT 1 FROM private.workspace_setup_dispatches WHERE workspace_id=p_workspace_id
      AND owner_id=p_owner_id AND dispatch_id::text=pg_catalog.current_setting('roomqc.setup_dispatch_id',true)) THEN
    RAISE EXCEPTION 'SETUP_DISPATCH_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN public.provision_workspace_registration_impl(p_workspace_id,p_owner_id,p_fields);
END;
$fn$;
REVOKE ALL ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,roomqc_setup_recovery;
GRANT EXECUTE ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.provision_workspace_setup_dispatch(
  p_workspace_id uuid,p_dispatch_id uuid,p_owner_id uuid,p_routing_version integer,
  p_payload_sha256 text,p_fields_json text,p_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_fields jsonb;v_result jsonb;v_dispatch private.workspace_setup_dispatches%ROWTYPE;
  v_receipt private.workspace_provisioning%ROWTYPE;
  v_previous text:=pg_catalog.current_setting('roomqc.setup_dispatch_id',true);
BEGIN
  IF p_session_id IS NULL OR p_fields_json IS NULL OR pg_catalog.octet_length(p_fields_json)>16384
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_fields_json,'UTF8')),'hex') IS DISTINCT FROM p_payload_sha256 THEN
    RAISE EXCEPTION 'INVALID_SETUP_DISPATCH' USING ERRCODE='22023';
  END IF;
  v_fields:=p_fields_json::jsonb;
  IF pg_catalog.jsonb_typeof(v_fields) IS DISTINCT FROM 'object' OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_object_keys(v_fields) k
    WHERE k NOT IN ('fullName','phone','tenantName','hotelName','hotelAddress','hotelPhone','hotelEmail','totalRooms','workspaceSlug')
  ) THEN RAISE EXCEPTION 'INVALID_SETUP_DISPATCH_FIELDS' USING ERRCODE='22023'; END IF;
  -- Lock order matches the existing registration boundary: owner/profile/session
  -- before workspace. The service-only close RPC never locks an Auth actor.
  PERFORM private.registration_owner(p_owner_id,p_session_id::text,true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,727002));
  PERFORM private.setup_dispatch_identity(p_workspace_id,p_dispatch_id,p_owner_id,p_routing_version,p_payload_sha256);
  SELECT * INTO v_dispatch FROM private.workspace_setup_dispatches WHERE dispatch_id=p_dispatch_id;
  IF FOUND THEN
    IF v_dispatch.state='committed' THEN
      SELECT * INTO v_receipt FROM private.workspace_provisioning WHERE workspace_id=p_workspace_id;
      IF NOT FOUND OR v_receipt.owner_id<>p_owner_id OR v_receipt.tenant_id<>v_dispatch.tenant_id
        OR v_receipt.hotel_id<>v_dispatch.hotel_id THEN
        RAISE EXCEPTION 'SETUP_RECEIPT_CONFLICT' USING ERRCODE='42501';
      END IF;
    END IF;
    RETURN private.setup_dispatch_result(p_dispatch_id,true);
  END IF;
  INSERT INTO private.workspace_setup_dispatches(dispatch_id,workspace_id,owner_id,routing_version,payload_sha256,state,last_error_code)
    VALUES(p_dispatch_id,p_workspace_id,p_owner_id,p_routing_version,p_payload_sha256,'closed','DISPATCH_CLOSED');
  -- Subtransaction rolls back every business effect if the RPC rejects or its
  -- result is invalid; the outer close tombstone remains durable.
  BEGIN
    PERFORM pg_catalog.set_config('roomqc.setup_dispatch_id',p_dispatch_id::text,true);
    v_result:=public.provision_workspace_registration(p_workspace_id,p_owner_id,
      v_fields||pg_catalog.jsonb_build_object('registrationSessionId',p_session_id));
    IF (v_result->>'success')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'SETUP_DISPATCH_REJECTED';
    END IF;
    SELECT * INTO v_receipt FROM private.workspace_provisioning WHERE workspace_id=p_workspace_id;
    IF NOT FOUND OR v_receipt.owner_id<>p_owner_id OR v_result->>'tenant_id' IS DISTINCT FROM v_receipt.tenant_id::text
      OR v_result->>'hotel_id' IS DISTINCT FROM v_receipt.hotel_id::text OR v_result->>'owner_id' IS DISTINCT FROM p_owner_id::text THEN
      RAISE EXCEPTION 'SETUP_RECEIPT_CONFLICT';
    END IF;
    -- A session can expire by wall clock while an insert waits on a lock.
    -- registration_owner already holds its row against concurrent revocation;
    -- now() is the transaction start time and cannot be the final expiry fence.
    IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session_id AND user_id=p_owner_id
      AND (not_after IS NULL OR not_after>pg_catalog.clock_timestamp())) THEN
      RAISE EXCEPTION 'ACTIVE_REGISTRATION_SESSION_REQUIRED' USING ERRCODE='42501';
    END IF;
    UPDATE private.workspace_setup_dispatches SET state='committed',tenant_id=v_receipt.tenant_id,
      hotel_id=v_receipt.hotel_id,last_error_code=NULL,finished_at=pg_catalog.clock_timestamp() WHERE dispatch_id=p_dispatch_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE private.workspace_setup_dispatches SET last_error_code='DISPATCH_REJECTED',
      finished_at=pg_catalog.clock_timestamp() WHERE dispatch_id=p_dispatch_id;
  END;
  PERFORM pg_catalog.set_config('roomqc.setup_dispatch_id',COALESCE(v_previous,''),true);
  RETURN private.setup_dispatch_result(p_dispatch_id,false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.provision_workspace_setup_dispatch(uuid,uuid,uuid,integer,text,text,uuid)
  FROM PUBLIC,anon,authenticated,roomqc_setup_recovery;
GRANT EXECUTE ON FUNCTION public.provision_workspace_setup_dispatch(uuid,uuid,uuid,integer,text,text,uuid) TO service_role;

-- Receipt-only worker action: never invokes registration, never needs an owner
-- token or session, and never treats lock contention as a proven closed attempt.
CREATE FUNCTION public.close_workspace_setup_dispatch(
  p_workspace_id uuid,p_dispatch_id uuid,p_owner_id uuid,p_routing_version integer,p_payload_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_dispatch private.workspace_setup_dispatches%ROWTYPE;v_receipt private.workspace_provisioning%ROWTYPE;v_existing boolean;
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'INVALID_SETUP_DISPATCH' USING ERRCODE='22023'; END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,727002)) THEN
    RETURN pg_catalog.jsonb_build_object('dispatch_id',p_dispatch_id,'workspace_id',p_workspace_id,
      'owner_id',p_owner_id,'routing_version',p_routing_version,'payload_sha256',p_payload_sha256,'state','busy');
  END IF;
  PERFORM private.setup_dispatch_identity(p_workspace_id,p_dispatch_id,p_owner_id,p_routing_version,p_payload_sha256);
  SELECT * INTO v_dispatch FROM private.workspace_setup_dispatches WHERE dispatch_id=p_dispatch_id;
  v_existing:=FOUND;
  SELECT * INTO v_receipt FROM private.workspace_provisioning WHERE workspace_id=p_workspace_id;
  IF FOUND THEN
    IF v_receipt.owner_id<>p_owner_id OR (v_existing AND v_dispatch.state='committed'
      AND (v_dispatch.tenant_id<>v_receipt.tenant_id OR v_dispatch.hotel_id<>v_receipt.hotel_id)) THEN
      RAISE EXCEPTION 'SETUP_RECEIPT_CONFLICT' USING ERRCODE='42501';
    END IF;
    IF NOT v_existing THEN
      INSERT INTO private.workspace_setup_dispatches(dispatch_id,workspace_id,owner_id,routing_version,payload_sha256,
        state,tenant_id,hotel_id) VALUES(p_dispatch_id,p_workspace_id,p_owner_id,p_routing_version,p_payload_sha256,
        'committed',v_receipt.tenant_id,v_receipt.hotel_id);
    ELSIF v_dispatch.state<>'committed' THEN
      UPDATE private.workspace_setup_dispatches SET state='committed',tenant_id=v_receipt.tenant_id,hotel_id=v_receipt.hotel_id,
        last_error_code=NULL,finished_at=pg_catalog.clock_timestamp() WHERE dispatch_id=p_dispatch_id;
    END IF;
  ELSE
    IF v_existing AND v_dispatch.state='committed' THEN
      RAISE EXCEPTION 'SETUP_RECEIPT_CONFLICT' USING ERRCODE='42501';
    END IF;
    IF NOT v_existing THEN
      INSERT INTO private.workspace_setup_dispatches(dispatch_id,workspace_id,owner_id,routing_version,payload_sha256,state,last_error_code)
        VALUES(p_dispatch_id,p_workspace_id,p_owner_id,p_routing_version,p_payload_sha256,'closed','DISPATCH_CLOSED');
    END IF;
  END IF;
  RETURN private.setup_dispatch_result(p_dispatch_id,v_existing);
END;
$fn$;
REVOKE ALL ON FUNCTION public.close_workspace_setup_dispatch(uuid,uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_workspace_setup_dispatch(uuid,uuid,uuid,integer,text) TO service_role,roomqc_setup_recovery;
