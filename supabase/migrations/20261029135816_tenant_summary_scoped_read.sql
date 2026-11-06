-- Summary-only service credential: no business tables, owner impersonation,
-- provisioning or setup recovery grants. Installed disabled until authority
-- and a short-lived credential are registered by the cluster administrator.
DO $role$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_tenant_summary') THEN
    CREATE ROLE roomqc_tenant_summary NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_tenant_summary'
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_ROLE_INVALID';
  END IF;
END;
$role$;
GRANT roomqc_tenant_summary TO authenticator;
CREATE SCHEMA roomqc_summary;
REVOKE ALL ON SCHEMA roomqc_summary FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA roomqc_summary TO roomqc_tenant_summary;
DO $boundary$
BEGIN
  IF pg_catalog.has_schema_privilege('roomqc_tenant_summary','public','USAGE') THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_PUBLIC_BOUNDARY_REQUIRED';
  END IF;
END;
$boundary$;
CREATE TABLE private.tenant_summary_authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  cluster_id text NOT NULL CHECK(cluster_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE private.tenant_summary_credentials (
  id uuid PRIMARY KEY,
  cluster_id text NOT NULL CHECK(cluster_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>not_before AND expires_at<=not_before+interval '1 hour'),
  revoked_at timestamptz
);
ALTER TABLE private.tenant_summary_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tenant_summary_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tenant_summary_authority,private.tenant_summary_credentials
  FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;

CREATE FUNCTION private.assert_tenant_summary_credential() RETURNS text
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
  SELECT c.* INTO v_row FROM private.tenant_summary_credentials c
    JOIN private.tenant_summary_authority a ON a.singleton AND a.cluster_id=c.cluster_id AND a.binding_sha256=c.binding_sha256
    WHERE c.id=v_id AND c.cluster_id=v_claims->>'cluster_id' AND c.binding_sha256=v_claims->>'binding_sha256'
    FOR SHARE OF c,a;
  IF NOT FOUND OR v_row.revoked_at IS NOT NULL OR v_row.not_before>pg_catalog.clock_timestamp()
    OR v_row.expires_at<=pg_catalog.clock_timestamp()
    OR pg_catalog.date_part('epoch',v_row.expires_at)::bigint<>v_exp THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN v_row.cluster_id;
END;
$guard$;
REVOKE ALL ON FUNCTION private.assert_tenant_summary_credential() FROM PUBLIC,anon,authenticated,service_role,roomqc_tenant_summary;

CREATE FUNCTION roomqc_summary.tenant_summary(p_workspace_id uuid,p_tenant_id uuid,p_owner_id uuid,p_hotel_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $summary$
DECLARE v_cluster text;v_receipt private.workspace_provisioning%ROWTYPE;v_result jsonb;
BEGIN
  v_cluster:=private.assert_tenant_summary_credential();
  IF p_workspace_id IS NULL OR p_tenant_id IS NULL OR p_owner_id IS NULL OR p_hotel_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_TARGET_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_receipt FROM private.workspace_provisioning WHERE workspace_id=p_workspace_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('state','missing','clusterId',v_cluster,'workspaceId',p_workspace_id,'tenantId',p_tenant_id);
  END IF;
  IF v_receipt.tenant_id<>p_tenant_id OR v_receipt.owner_id<>p_owner_id OR v_receipt.hotel_id<>p_hotel_id THEN
    RAISE EXCEPTION 'TENANT_SUMMARY_BINDING_CONFLICT' USING ERRCODE='22023';
  END IF;
  -- One statement snapshot for tenant and all counts. Staff includes the owner
  -- and other nondeleted accounts assigned to this tenant, in every status.
  -- Rooms are counted from actual rows, never hotels.total_rooms estimates.
  SELECT pg_catalog.jsonb_build_object('state','available','clusterId',v_cluster,'workspaceId',p_workspace_id,
    'tenantId',t.id,'observedAt',pg_catalog.statement_timestamp(),'tenant',pg_catalog.jsonb_build_object(
    'id',t.id,'name',t.name,'subscriptionStatus',t.subscription_status,'trialEndsAt',t.trial_ends_at,
    'hotelCount',(SELECT count(*) FROM public.hotels h WHERE h.tenant_id=t.id),
    'staffCount',(SELECT count(*) FROM public.users u WHERE u.tenant_id=t.id AND u.deleted_at IS NULL),
    'roomCount',(SELECT count(*) FROM public.rooms r JOIN public.hotels h ON h.id=r.hotel_id WHERE h.tenant_id=t.id)))
    INTO v_result FROM public.tenants t WHERE t.id=p_tenant_id
      AND EXISTS(SELECT 1 FROM public.hotels h WHERE h.id=p_hotel_id AND h.tenant_id=t.id);
  IF v_result IS NULL THEN RAISE EXCEPTION 'TENANT_SUMMARY_BINDING_CONFLICT' USING ERRCODE='22023';END IF;
  PERFORM private.assert_tenant_summary_credential();
  RETURN v_result;
END;
$summary$;
REVOKE ALL ON FUNCTION roomqc_summary.tenant_summary(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION roomqc_summary.tenant_summary(uuid,uuid,uuid,uuid) TO roomqc_tenant_summary;
COMMENT ON FUNCTION roomqc_summary.tenant_summary(uuid,uuid,uuid,uuid) IS 'Read-only summary, bound to a provisioning receipt and live cluster credential. No tenant contact data or owner session.';
NOTIFY pgrst,'reload schema';
