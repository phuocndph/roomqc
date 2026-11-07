-- Forward-only correction: the employee edit must use the existing activity log
-- action contract. Preserve constraint, authority, locks and transactional effects.
CREATE OR REPLACE FUNCTION private.edit_employee_profile(
  p_target_id uuid, p_changes jsonb, p_expected_updated_at timestamptz, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_auth auth.users%ROWTYPE;
  v_actor public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_after public.users%ROWTYPE;
  v_position public.positions%ROWTYPE;
  v_supervisor public.users%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_membership public.user_hotels%ROWTYPE;
  v_receipt private.employee_profile_edit_receipts%ROWTYPE;
  v_actor_role text;
  v_target_role text;
  v_name text;
  v_hotel uuid;
  v_position_id uuid;
  v_reports uuid;
  v_payload jsonb;
  v_result jsonb;
  v_old jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  IF p_target_id IS NULL OR p_request_id IS NULL
    OR p_changes IS NULL OR jsonb_typeof(p_changes)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_changes))<>4
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k
      WHERE k NOT IN ('full_name','hotel_id','position_id','reports_to'))
    OR jsonb_typeof(p_changes->'full_name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_changes->'hotel_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_changes->'position_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_changes->'reports_to') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_INVALID_FIELDS' USING ERRCODE='22023';
  END IF;
  v_name:=btrim(p_changes->>'full_name');
  IF length(v_name) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_INVALID_NAME' USING ERRCODE='22023';
  END IF;
  v_hotel:=(p_changes->>'hotel_id')::uuid;
  v_position_id:=(p_changes->>'position_id')::uuid;
  v_reports:=(p_changes->>'reports_to')::uuid;

  -- Auth -> actor profile -> authoritative roles -> session -> target.
  -- Locks fence already-committed revocation without trusting stale JWT metadata.
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor_id FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now()) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id=v_actor_id FOR SHARE;
  IF NOT FOUND OR v_actor.tenant_id IS NULL OR v_actor.status IS DISTINCT FROM 'active'
    OR v_actor.deleted_at IS NOT NULL OR COALESCE(v_actor.account_locked,false)
    OR COALESCE(v_actor.is_super_admin,false) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_ACTIVE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor_id ORDER BY role FOR SHARE;
  v_actor_role:=CASE v_actor.user_level_code WHEN 'tenant_owner' THEN 'owner'
    WHEN 'manager' THEN 'hotel_manager' WHEN 'department_manager' THEN 'department_manager' END;
  IF v_actor_role IS NULL OR v_actor.role IS DISTINCT FROM v_actor_role
    OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor_id AND role::text=v_actor_role)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor_id AND role='super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM auth.sessions WHERE user_id=v_actor_id AND id::text=auth.jwt()->>'session_id'
    AND (not_after IS NULL OR not_after>now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EDIT_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;

  -- Match the product's module/action contract as well as hierarchy. Permission
  -- revocation serializes on these rows; no authority comes from client input.
  PERFORM 1 FROM public.user_permissions WHERE user_id=v_actor_id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code=v_actor_role AND (r.tenant_id=v_actor.tenant_id
      OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      AND p.module='users' AND p.action IN ('update','edit')
    ORDER BY r.id,p.id FOR SHARE OF rp,r,p;
  IF NOT public.has_user_permission(v_actor_id,'users','update') THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_CAPABILITY_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;

  -- Request-key lock precedes target locks, including conflicting-key requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text||':'||p_request_id::text,21133739));

  SELECT * INTO v_target FROM public.users WHERE id=p_target_id FOR UPDATE;
  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_actor.tenant_id
    OR v_target.deleted_at IS NOT NULL OR COALESCE(v_target.is_super_admin,false)
    OR COALESCE(v_target.is_primary_owner,false)
    OR NOT public.can_manage_user(v_actor_id,p_target_id)
    OR v_target.user_level_code NOT IN ('manager','department_manager','staff') THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=p_target_id ORDER BY role FOR SHARE;
  v_target_role:=CASE v_target.user_level_code WHEN 'manager' THEN 'hotel_manager'
    WHEN 'department_manager' THEN 'department_manager' WHEN 'staff' THEN 'staff' END;
  IF v_target.role IS DISTINCT FROM v_target_role
    OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_target_id AND role::text=v_target_role)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_target_id AND role='super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  -- Both current and requested scope must be assigned to a non-owner manager.
  IF v_actor_role<>'owner' THEN
    PERFORM 1 FROM public.user_hotels WHERE user_id=v_actor_id AND hotel_id=v_target.hotel_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EDIT_HOTEL_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.user_hotels WHERE user_id=v_actor_id AND hotel_id=v_hotel FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EDIT_HOTEL_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  END IF;

  v_payload:=jsonb_build_object('target_id',p_target_id,'changes',p_changes,
    'expected_updated_at',p_expected_updated_at);
  SELECT * INTO v_receipt FROM private.employee_profile_edit_receipts
    WHERE actor_id=v_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'EMPLOYEE_EDIT_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_receipt.result;
  END IF;
  IF v_target.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_STALE_VERSION' USING ERRCODE='PT409';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id=v_actor.tenant_id FOR SHARE;
  IF NOT FOUND OR v_tenant.is_read_only IS DISTINCT FROM false
    OR COALESCE(v_tenant.subscription_status,'') NOT IN ('active','trial')
    OR (v_tenant.subscription_status='trial' AND (v_tenant.trial_ends_at IS NULL OR v_tenant.trial_ends_at<=now()))
    OR (v_tenant.subscription_status='active' AND (v_tenant.subscription_end_date IS NULL OR v_tenant.subscription_end_date<current_date)) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_TENANT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.hotels WHERE id=v_hotel AND tenant_id=v_actor.tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EDIT_INVALID_HOTEL' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_position FROM public.positions WHERE id=v_position_id AND tenant_id=v_actor.tenant_id
    AND status='active' FOR SHARE;
  IF NOT FOUND OR v_position.user_level_code IS DISTINCT FROM
    (CASE WHEN v_target.user_level_code='staff' THEN 'staff' ELSE 'manager' END) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_INVALID_POSITION' USING ERRCODE='22023';
  END IF;
  IF v_actor_role='department_manager'
    AND (v_actor.department IS DISTINCT FROM v_target.department
      OR v_actor.department IS DISTINCT FROM v_position.department) THEN
    RAISE EXCEPTION 'EMPLOYEE_EDIT_DEPARTMENT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  IF v_reports IS NOT NULL THEN
    SELECT s.* INTO v_supervisor FROM public.users s WHERE s.id=v_reports AND s.tenant_id=v_actor.tenant_id
      AND s.id<>p_target_id AND s.hotel_id=v_hotel
      AND s.status='active' AND s.deleted_at IS NULL AND NOT COALESCE(s.account_locked,false)
      AND s.user_level_code IN ('manager','department_manager')
      AND EXISTS(SELECT 1 FROM public.user_levels sl JOIN public.user_levels tl
        ON sl.hierarchy_level<tl.hierarchy_level WHERE sl.code=s.user_level_code AND tl.code=v_target.user_level_code)
      FOR SHARE OF s;
    IF NOT FOUND OR v_reports=p_target_id OR v_supervisor.hotel_id IS DISTINCT FROM v_hotel
      OR NOT EXISTS(SELECT 1 FROM public.user_levels s JOIN public.user_levels t
        ON s.hierarchy_level<t.hierarchy_level WHERE s.code=v_supervisor.user_level_code AND t.code=v_target.user_level_code)
      OR v_supervisor.user_level_code NOT IN ('manager','department_manager') THEN
      RAISE EXCEPTION 'EMPLOYEE_EDIT_INVALID_SUPERVISOR' USING ERRCODE='22023';
    END IF;
  END IF;

  v_old:=jsonb_build_object('full_name',v_target.full_name,'hotel_id',v_target.hotel_id,
    'position_id',v_target.position_id,'reports_to',v_target.reports_to,'department',v_target.department);
  UPDATE public.users SET full_name=v_name,hotel_id=v_hotel,position_id=v_position_id,
    reports_to=v_reports,department=v_position.department,updated_at=clock_timestamp()
    WHERE id=p_target_id RETURNING * INTO v_after;
  -- A primary-hotel transfer replaces only that membership; unrelated explicit
  -- multi-hotel assignments and existing capability flags are not rewritten.
  IF v_target.hotel_id IS DISTINCT FROM v_hotel THEN
    SELECT * INTO v_membership FROM public.user_hotels
      WHERE user_id=p_target_id AND hotel_id=v_target.hotel_id FOR UPDATE;
    DELETE FROM public.user_hotels WHERE user_id=p_target_id AND hotel_id=v_target.hotel_id;
  END IF;
  INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by,can_create_managers,
    can_create_staff,can_view_reports,can_export_data,can_approve_requests)
    VALUES(p_target_id,v_hotel,v_actor_id,COALESCE(v_membership.can_create_managers,false),
      COALESCE(v_membership.can_create_staff,false),COALESCE(v_membership.can_view_reports,false),
      COALESCE(v_membership.can_export_data,false),COALESCE(v_membership.can_approve_requests,false))
    ON CONFLICT (user_id,hotel_id) DO NOTHING;
  v_result:=jsonb_build_object('id',v_after.id,'full_name',v_after.full_name,
    'hotel_id',v_after.hotel_id,'position_id',v_after.position_id,'reports_to',v_after.reports_to,
    'department',v_after.department,'user_level_code',v_after.user_level_code,'updated_at',v_after.updated_at);
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,
    entity_name,action,description,old_values,new_values)
    VALUES(v_actor.tenant_id,v_actor_id,v_actor.full_name,v_actor_role,'user',p_target_id,
      v_after.full_name,'update','Cập nhật hồ sơ nhân viên',v_old,v_result);
  INSERT INTO private.employee_profile_edit_receipts(actor_id,request_id,target_id,tenant_id,payload,result)
    VALUES(v_actor_id,p_request_id,p_target_id,v_actor.tenant_id,v_payload,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.edit_employee_profile(uuid,jsonb,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.edit_employee_profile(uuid,jsonb,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
