-- Durable cluster-side receipt. A directory retry must recover this receipt,
-- never create a second tenant after a cross-service response was lost.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.workspace_provisioning (
  workspace_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.workspace_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workspace_provisioning FROM PUBLIC, anon, authenticated;

-- Off by default for legacy deployments. Enable explicitly during directory
-- cutover; new clusters must enable before accepting registrations.
CREATE TABLE IF NOT EXISTS private.roomqc_cluster_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  directory_required boolean NOT NULL DEFAULT false
);
INSERT INTO private.roomqc_cluster_config(singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE private.roomqc_cluster_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.roomqc_cluster_config FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid, p_full_name text, p_phone text, p_tenant_name text,
  p_email text, p_hotel_name text, p_hotel_address text, p_hotel_phone text,
  p_hotel_email text, p_total_rooms integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_service boolean := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS DISTINCT FROM p_user_id AND NOT v_service) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT v_service AND EXISTS(SELECT 1 FROM private.roomqc_cluster_config WHERE directory_required) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Registration requires the RoomQC directory');
  END IF;
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  PERFORM pg_catalog.set_config('roomqc.registration_provisioning', 'true', true);
  PERFORM pg_catalog.set_config('roomqc.registration_user_id', p_user_id::text, true);
  RETURN public.complete_registration_impl(p_user_id,p_full_name,p_phone,p_tenant_name,p_email,
    p_hotel_name,p_hotel_address,p_hotel_phone,p_hotel_email,p_total_rooms);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_workspace_provisioning(p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT pg_catalog.jsonb_build_object('workspace_id',w.workspace_id,'owner_id',w.owner_id,
    'tenant_id',w.tenant_id,'hotel_id',w.hotel_id)
  FROM private.workspace_provisioning w WHERE w.workspace_id=p_workspace_id;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_workspace_provisioning(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_provisioning(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.provision_workspace_registration(
  p_workspace_id uuid, p_owner_id uuid, p_fields jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_email text;
  v_confirmed timestamptz;
  v_receipt private.workspace_provisioning%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_workspace_id IS NULL OR p_owner_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Missing workspace or owner');
  END IF;
  SELECT email,email_confirmed_at INTO v_email,v_confirmed FROM auth.users WHERE id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR v_confirmed IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Verified owner required');
  END IF;
  -- Lock the workspace as well as user; service mistakes cannot race different
  -- owners into the same workspace. A hash collision only serializes requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,727002));
  SELECT * INTO v_receipt FROM private.workspace_provisioning WHERE workspace_id=p_workspace_id;
  IF FOUND THEN
    IF v_receipt.owner_id <> p_owner_id THEN
      RETURN pg_catalog.jsonb_build_object('success',false,'error','Workspace belongs to another owner');
    END IF;
    RETURN pg_catalog.jsonb_build_object('success',true,'tenant_id',v_receipt.tenant_id,
      'hotel_id',v_receipt.hotel_id,'owner_id',p_owner_id,'idempotent',true);
  END IF;
  IF EXISTS(SELECT 1 FROM private.workspace_provisioning WHERE owner_id=p_owner_id)
    OR EXISTS(SELECT 1 FROM public.users WHERE id=p_owner_id AND tenant_id IS NOT NULL
      AND COALESCE(status,'') NOT IN ('pending_setup','')) THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Account is already provisioned');
  END IF;
  IF pg_catalog.jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR COALESCE(p_fields->>'totalRooms','') !~ '^[1-9][0-9]{0,4}$'
    OR (p_fields->>'totalRooms')::integer > 10000 THEN
    RETURN pg_catalog.jsonb_build_object('success',false,'error','Invalid setup fields');
  END IF;
  -- Legacy implementation reads the singular claim GUC. Modern PostgREST
  -- supplies JSON claims instead. Only this service-only entry point bridges
  -- that compatibility value, inside the current transaction.
  PERFORM pg_catalog.set_config('request.jwt.claim.role','service_role',true);
  v_result := public.complete_registration(p_owner_id,p_fields->>'fullName',p_fields->>'phone',
    p_fields->>'tenantName',v_email,p_fields->>'hotelName',p_fields->>'hotelAddress',
    p_fields->>'hotelPhone',p_fields->>'hotelEmail',(p_fields->>'totalRooms')::integer);
  IF NOT COALESCE((v_result->>'success')::boolean,false) THEN RETURN v_result; END IF;
  INSERT INTO private.workspace_provisioning(workspace_id,owner_id,tenant_id,hotel_id)
    VALUES(p_workspace_id,p_owner_id,(v_result->>'tenant_id')::uuid,(v_result->>'hotel_id')::uuid);
  RETURN v_result || pg_catalog.jsonb_build_object('owner_id',p_owner_id);
EXCEPTION WHEN OTHERS THEN
  -- Rolls back the receipt and business provisioning together.
  RETURN pg_catalog.jsonb_build_object('success',false,'error','Workspace provisioning failed','detail',SQLSTATE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) TO service_role;
