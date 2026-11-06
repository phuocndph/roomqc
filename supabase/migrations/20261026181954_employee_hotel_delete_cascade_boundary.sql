-- Direct authority writes remain revoked. A real, immediate hotel FK cascade
-- sees the parent row already gone; ordinary relation validation must not turn
-- that authorized parent deletion into a missing-hotel 42501. Never trust a
-- client GUC, a trigger depth alone, or a missing parent without the live root.
CREATE FUNCTION private.employee_hotel_delete_cascade_allowed(p_target_tenant uuid,p_hotel uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR pg_catalog.pg_trigger_depth()<>2 OR p_target_tenant IS NULL OR p_hotel IS NULL
    OR EXISTS(SELECT 1 FROM public.hotels WHERE id=p_hotel) THEN RETURN false; END IF;
  -- The validated nondeferrable FK makes an absent parent possible here only
  -- inside the actual parent deletion. Browser callers cannot create triggers,
  -- disable the FK, write an orphan assignment, or execute this helper directly.
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid='public.user_hotels'::pg_catalog.regclass
      AND c.confrelid='public.hotels'::pg_catalog.regclass AND c.contype='f'
      AND c.conname='user_hotels_hotel_id_fkey' AND c.convalidated AND NOT c.condeferrable
      AND c.confdeltype='c' AND c.confupdtype='a'
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid=c.conrelid AND attname='hotel_id' AND NOT attisdropped)]::smallint[]
      AND c.confkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid=c.confrelid AND attname='id' AND NOT attisdropped)]::smallint[]
  ) THEN RETURN false; END IF;
  v_actor:=private.lock_live_role_actor('owner');
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=v_actor
    AND u.tenant_id=p_target_tenant AND u.user_level_code='tenant_owner' AND u.role::text='owner'
    AND NOT COALESCE(u.is_super_admin,false))
    OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_actor
      AND u.banned_until IS NOT NULL AND u.banned_until>clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor
      AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION private.employee_hotel_delete_cascade_allowed(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.enforce_employee_authority_relation()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target_tenant uuid; v_hotel_tenant uuid; v_registration boolean:=false;
  v_row jsonb; v_old jsonb; v_target uuid; v_tenant uuid; v_hotel uuid; v_hotel_found boolean;
BEGIN
  IF TG_OP='DELETE' AND current_setting('role',true) NOT IN ('authenticated','anon') THEN RETURN OLD; END IF;
  v_row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_target:=(v_row->>'user_id')::uuid;
  SELECT tenant_id INTO v_target_tenant FROM public.users WHERE id=v_target FOR SHARE;
  IF NOT FOUND OR v_target_tenant IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_TARGET_SCOPE_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_target ORDER BY role FOR SHARE;
  IF TG_TABLE_NAME='user_permissions' THEN
    v_tenant:=(v_row->>'tenant_id')::uuid;
    IF v_tenant IS DISTINCT FROM v_target_tenant THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_TARGET_SCOPE_REQUIRED' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='user_hotels' THEN
    v_hotel:=(v_row->>'hotel_id')::uuid;
    SELECT tenant_id INTO v_hotel_tenant FROM public.hotels WHERE id=v_hotel FOR SHARE;
    v_hotel_found:=FOUND;
    IF NOT v_hotel_found AND TG_OP='DELETE' AND TG_TABLE_SCHEMA='public'
      AND private.employee_hotel_delete_cascade_allowed(v_target_tenant,v_hotel) THEN
      -- Only this membership is removed. The next version trigger still runs;
      -- receipt FK refusals roll the parent, membership and version back together.
      RETURN OLD;
    END IF;
    IF NOT v_hotel_found OR v_hotel_tenant IS DISTINCT FROM v_target_tenant THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_HOTEL_SCOPE_REQUIRED' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_UNEXPECTED_RELATION' USING ERRCODE='42501';
  END IF;
  IF current_setting('role',true) IN ('authenticated','anon') THEN
    IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
      AND s.id::text=(SELECT auth.jwt()->>'session_id')
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
      RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
    END IF;
    IF TG_TABLE_NAME='user_hotels' AND TG_OP IN ('INSERT','UPDATE') THEN
      v_registration:=v_target=(SELECT auth.uid())
      AND current_setting('roomqc.registration_provisioning',true)='true'
      AND current_setting('roomqc.registration_user_id',true)=v_target::text
      AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=v_target
        AND u.tenant_id=v_hotel_tenant AND u.hotel_id=v_hotel
        AND u.user_level_code='tenant_owner' AND u.role::text='owner'
        AND u.is_primary_owner=true AND u.status='active' AND u.deleted_at IS NULL
        AND NOT COALESCE(u.account_locked,false) AND NOT COALESCE(u.is_super_admin,false));
    END IF;
    IF NOT COALESCE(v_registration,false) THEN
      IF TG_TABLE_NAME='user_permissions' THEN
        IF NOT private.employee_authority_target_allowed(v_target,v_tenant)
          OR (TG_OP='UPDATE' AND NOT private.employee_authority_target_allowed((v_old->>'user_id')::uuid,(v_old->>'tenant_id')::uuid)) THEN
          RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_TARGET_NOT_ALLOWED' USING ERRCODE='42501';
        END IF;
      ELSE
        IF NOT private.employee_hotel_target_allowed(v_target,v_hotel)
          OR (TG_OP='UPDATE' AND NOT private.employee_hotel_target_allowed((v_old->>'user_id')::uuid,(v_old->>'hotel_id')::uuid)) THEN
          RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_HOTEL_NOT_ALLOWED' USING ERRCODE='42501';
        END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.enforce_employee_authority_relation() FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.employee_hotel_delete_cascade_allowed(uuid,uuid) IS
  'Internal only: live same-tenant owner, depth-two immediate validated hotel FK cascade with absent parent. No direct grants or client context flag.';
NOTIFY pgrst,'reload schema';
