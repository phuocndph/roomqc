-- Scoped recovery API. No worker SQL login or service-role credential is used.
-- PUBLIC schema privileges cannot be denied to a single role: preserve every
-- existing other role's effective USAGE/CREATE while removing PUBLIC grants.
DO $public_boundary$
DECLARE v_role record;v_bit text;v_actual boolean;v_before jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'usage',has_schema_privilege(r.oid,'public','USAGE'),
    'create',has_schema_privilege(r.oid,'public','CREATE')) ORDER BY r.rolname)
    INTO v_before FROM pg_catalog.pg_roles r WHERE r.rolname<>'roomqc_setup_recovery';
  REVOKE ALL ON SCHEMA public FROM PUBLIC,roomqc_setup_recovery;
  FOR v_role IN SELECT * FROM jsonb_to_recordset(v_before) AS x(name text,usage boolean,"create" boolean) LOOP
    FOREACH v_bit IN ARRAY ARRAY['USAGE','CREATE'] LOOP
      v_actual:=has_schema_privilege(v_role.name,'public',v_bit);
      IF (CASE v_bit WHEN 'USAGE' THEN v_role.usage ELSE v_role."create" END) AND NOT v_actual THEN
        EXECUTE format('GRANT %s ON SCHEMA public TO %I',v_bit,v_role.name);
      END IF;
    END LOOP;
  END LOOP;
  FOR v_role IN SELECT * FROM jsonb_to_recordset(v_before) AS x(name text,usage boolean,"create" boolean) LOOP
    IF has_schema_privilege(v_role.name,'public','USAGE') IS DISTINCT FROM v_role.usage
      OR has_schema_privilege(v_role.name,'public','CREATE') IS DISTINCT FROM v_role."create" THEN
      RAISE EXCEPTION 'SETUP_RECOVERY_PUBLIC_PRIVILEGE_MISMATCH';
    END IF;
  END LOOP;
  IF has_schema_privilege('roomqc_setup_recovery','public','USAGE,CREATE') THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_PUBLIC_PRIVILEGE_MISMATCH';
  END IF;
END;
$public_boundary$;

REVOKE EXECUTE ON FUNCTION public.get_workspace_provisioning(uuid),
  public.close_workspace_setup_dispatch(uuid,uuid,uuid,integer,text) FROM roomqc_setup_recovery;

CREATE SCHEMA roomqc_setup;
REVOKE ALL ON SCHEMA roomqc_setup FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA roomqc_setup TO roomqc_setup_recovery;
CREATE TABLE private.setup_recovery_authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  cluster_id text NOT NULL CHECK(cluster_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE private.setup_recovery_credentials (
  id uuid PRIMARY KEY,
  cluster_id text NOT NULL CHECK(cluster_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>not_before AND expires_at<=not_before+interval '1 hour'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.setup_recovery_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.setup_recovery_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.setup_recovery_authority,private.setup_recovery_credentials
  FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;

CREATE FUNCTION private.assert_setup_recovery_credential() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $guard$
DECLARE v_claims jsonb;v_id uuid;v_exp bigint;v_row private.setup_recovery_credentials%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('role',true) IS DISTINCT FROM 'roomqc_setup_recovery' THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_claims:=pg_catalog.current_setting('request.jwt.claims',true)::jsonb;
    IF v_claims->>'role' IS DISTINCT FROM 'roomqc_setup_recovery'
      OR v_claims->>'iss' IS DISTINCT FROM 'roomqc-setup-recovery/v1'
      OR v_claims->>'aud' IS DISTINCT FROM 'authenticated'
      OR pg_catalog.jsonb_typeof(v_claims->'exp') IS DISTINCT FROM 'number'
      OR COALESCE(v_claims->>'exp','') !~ '^[0-9]{1,12}$' THEN
      RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
    END IF;
    v_id:=(v_claims->>'jti')::uuid;v_exp:=(v_claims->>'exp')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END;
  -- Hold both rows until the RPC ends. Revocation/authority changes cannot
  -- commit while an authorized close is still writing its terminal journal.
  SELECT c.* INTO v_row FROM private.setup_recovery_credentials c
    JOIN private.setup_recovery_authority a ON a.singleton AND a.cluster_id=c.cluster_id
      AND a.binding_sha256=c.binding_sha256
    WHERE c.id=v_id AND c.cluster_id=v_claims->>'cluster_id'
      AND c.binding_sha256=v_claims->>'binding_sha256'
    FOR SHARE OF c,a;
  IF NOT FOUND OR v_row.revoked_at IS NOT NULL OR v_row.not_before>pg_catalog.clock_timestamp()
    OR v_row.expires_at<=pg_catalog.clock_timestamp()
    OR v_exp<=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp())
    OR pg_catalog.to_timestamp(v_exp)>v_row.expires_at THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_CREDENTIAL_DENIED' USING ERRCODE='42501';
  END IF;
END;
$guard$;
REVOKE ALL ON FUNCTION private.assert_setup_recovery_credential() FROM PUBLIC,anon,authenticated,service_role,roomqc_setup_recovery;

CREATE FUNCTION roomqc_setup.close_dispatch(
  p_workspace_id uuid,p_dispatch_id uuid,p_owner_id uuid,p_routing_version integer,p_payload_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $close$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_setup_recovery_credential();
  v_result:=public.close_workspace_setup_dispatch(p_workspace_id,p_dispatch_id,p_owner_id,p_routing_version,p_payload_sha256);
  PERFORM private.assert_setup_recovery_credential();
  RETURN v_result;
END;
$close$;
CREATE FUNCTION roomqc_setup.receipt(p_workspace_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $receipt$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.assert_setup_recovery_credential();
  v_result:=public.get_workspace_provisioning(p_workspace_id);
  PERFORM private.assert_setup_recovery_credential();
  RETURN v_result;
END;
$receipt$;
REVOKE ALL ON FUNCTION roomqc_setup.close_dispatch(uuid,uuid,uuid,integer,text),roomqc_setup.receipt(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION roomqc_setup.close_dispatch(uuid,uuid,uuid,integer,text),roomqc_setup.receipt(uuid)
  TO roomqc_setup_recovery;
NOTIFY pgrst,'reload schema';
