-- Authority relations need live-actor fencing before their row locks.
-- RLS is restrictive: existing policies still decide allowed operations; this
-- migration supplies no new permissive grants and rewrites no historical data.
CREATE FUNCTION private.enforce_live_employee_actor()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
  v_session auth.sessions%ROWTYPE; v_role text;
BEGIN
  IF current_setting('role',true) NOT IN ('authenticated','anon') THEN RETURN NULL; END IF;
  IF current_setting('role',true)='anon' OR v_actor IS NULL
    OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  -- Same order as the existing profile command: Auth -> profile -> roles ->
  -- session -> custom/role capability. Revocation holds these locks until commit.
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR COALESCE(v_profile.account_locked,false) OR COALESCE(v_profile.is_super_admin,false) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor ORDER BY role FOR SHARE;
  v_role:=CASE v_profile.user_level_code WHEN 'tenant_owner' THEN 'owner'
    WHEN 'manager' THEN 'hotel_manager' WHEN 'department_manager' THEN 'department_manager' END;
  IF v_role IS NULL OR v_profile.role::text IS DISTINCT FROM v_role
    OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role::text=v_role)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role::text='super_admin') THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_session FROM auth.sessions
    WHERE user_id=v_actor AND id::text=auth.jwt()->>'session_id' FOR SHARE;
  -- Transaction start time is insufficient if authorization waited on a lock.
  IF NOT FOUND OR (v_session.not_after IS NOT NULL AND v_session.not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_permissions WHERE user_id=v_actor ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code=v_role AND (r.tenant_id=v_profile.tenant_id
      OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      AND p.module='users' AND p.action IN ('update','edit')
    ORDER BY r.id,p.id FOR SHARE OF rp,r,p;
  IF NOT public.has_user_permission(v_actor,'users','update') THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_CAPABILITY_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION private.enforce_live_employee_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.employee_authority_target_allowed(p_target uuid,p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users actor
    JOIN public.users target ON target.id=p_target AND target.tenant_id=actor.tenant_id
    WHERE actor.id=(SELECT auth.uid()) AND actor.tenant_id=p_tenant
      AND actor.status='active' AND actor.deleted_at IS NULL
      AND NOT COALESCE(actor.account_locked,false) AND NOT COALESCE(actor.is_super_admin,false)
      AND actor.user_level_code IN ('tenant_owner','manager','department_manager')
      AND actor.role::text=CASE actor.user_level_code WHEN 'tenant_owner' THEN 'owner'
        WHEN 'manager' THEN 'hotel_manager' ELSE 'department_manager' END
      AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=actor.id AND r.role::text=actor.role::text)
      AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=actor.id AND r.role::text='super_admin')
      AND target.id<>actor.id AND target.deleted_at IS NULL
      AND NOT COALESCE(target.is_super_admin,false) AND NOT COALESCE(target.is_primary_owner,false)
      AND target.user_level_code IN ('manager','department_manager','staff')
      AND target.role::text=CASE target.user_level_code WHEN 'manager' THEN 'hotel_manager'
        WHEN 'department_manager' THEN 'department_manager' ELSE 'staff' END
      AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=target.id AND r.role::text=target.role::text)
      AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=target.id AND r.role::text='super_admin')
      AND public.can_manage_user(actor.id,target.id)
      AND public.has_user_permission(actor.id,'users','update')
      AND (actor.user_level_code='tenant_owner' OR (
        EXISTS(SELECT 1 FROM public.user_hotels h WHERE h.user_id=actor.id AND h.hotel_id=target.hotel_id)
        AND (actor.user_level_code<>'department_manager' OR actor.department IS NOT DISTINCT FROM target.department)
      ))
  );
$fn$;
REVOKE ALL ON FUNCTION private.employee_authority_target_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.employee_authority_target_allowed(uuid,uuid) TO authenticated;

CREATE FUNCTION private.employee_hotel_target_allowed(p_target uuid,p_hotel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.hotels h
    WHERE h.id=p_hotel
      AND private.employee_authority_target_allowed(p_target,h.tenant_id)
      AND EXISTS(SELECT 1 FROM public.users actor WHERE actor.id=(SELECT auth.uid())
        AND (actor.user_level_code='tenant_owner' OR EXISTS(
          SELECT 1 FROM public.user_hotels assignment WHERE assignment.user_id=actor.id AND assignment.hotel_id=h.id)))
  );
$fn$;
REVOKE ALL ON FUNCTION private.employee_hotel_target_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.employee_hotel_target_allowed(uuid,uuid) TO authenticated;

DO $migration$
DECLARE v_table text; v_predicate text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['user_permissions','user_hotels'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER enforce_live_employee_actor BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.enforce_live_employee_actor()',v_table);
    v_predicate:=CASE v_table WHEN 'user_permissions'
      THEN 'private.employee_authority_target_allowed(user_id,tenant_id)'
      ELSE 'private.employee_hotel_target_allowed(user_id,hotel_id)' END;
    EXECUTE pg_catalog.format(
      'CREATE POLICY employee_authority_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT private.business_actor_is_live()) AND %s)',v_table,v_predicate);
    EXECUTE pg_catalog.format(
      'CREATE POLICY employee_authority_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT private.business_actor_is_live()) AND %s) WITH CHECK ((SELECT private.business_actor_is_live()) AND %s)',v_table,v_predicate,v_predicate);
    EXECUTE pg_catalog.format(
      'CREATE POLICY employee_authority_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT private.business_actor_is_live()) AND %s)',v_table,v_predicate);
  END LOOP;
END;
$migration$;

-- Relation invariants also cover privileged RPC/trigger writers that bypass RLS.
-- Check the real target, never just the supplied tenant/hotel. Row locks fence
-- concurrent user/hotel transfers until this transaction commits. A stale actor
-- is fenced earlier by the statement trigger, before authority/business locks.
CREATE FUNCTION private.enforce_employee_authority_relation()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target_tenant uuid; v_hotel_tenant uuid; v_registration boolean:=false;
  v_row jsonb; v_old jsonb; v_target uuid; v_tenant uuid; v_hotel uuid;
BEGIN
  -- A trusted cleanup can remove an old invalid relation without manufacturing
  -- a valid replacement. Browser DELETE still rechecks the live target below.
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
    IF NOT FOUND OR v_hotel_tenant IS DISTINCT FROM v_target_tenant THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_HOTEL_SCOPE_REQUIRED' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_UNEXPECTED_RELATION' USING ERRCODE='42501';
  END IF;
  IF current_setting('role',true) IN ('authenticated','anon') THEN
    -- The session may expire by wall clock while a target/hotel lock is held,
    -- even though the statement guard locked an eligible session earlier.
    IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
      AND s.id::text=(SELECT auth.jwt()->>'session_id')
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
      RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
    END IF;
    -- RLS uses the outer statement snapshot. Recheck after a target lock wait
    -- in this volatile trigger so committed scope/hierarchy changes win.
    -- Only the existing guarded first-owner registration root sets both local
    -- markers. Its own membership is not a staff-management operation.
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
CREATE TRIGGER enforce_employee_authority_relation BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_employee_authority_relation();
CREATE TRIGGER enforce_employee_authority_relation BEFORE INSERT OR UPDATE OR DELETE ON public.user_hotels
  FOR EACH ROW EXECUTE FUNCTION private.enforce_employee_authority_relation();

COMMENT ON FUNCTION private.employee_authority_target_allowed(uuid,uuid) IS
  'Caller-bound restrictive mutation predicate: real target tenant, protected targets, hierarchy, role consistency and users.update capability. No writes or permissive grants.';
COMMENT ON FUNCTION private.enforce_employee_authority_relation() IS
  'Same-tenant relation invariant for new/updated permission and hotel assignments; fresh authenticated target recheck also covers DELETE. Trusted cleanup may remove old invalid rows. Existing data is not rewritten.';
NOTIFY pgrst,'reload schema';
