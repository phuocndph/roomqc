-- Add server-owned delegation/catalog metadata for the shared web/mobile editor.
-- Preserve the existing command/receipt contract and all write boundaries.
CREATE OR REPLACE FUNCTION private.get_employee_authority_configuration(p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_target public.users%ROWTYPE; v_versions jsonb;
  v_actions jsonb; v_hotels jsonb;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  v_target:=private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  PERFORM 1 FROM private.employee_authority_versions WHERE target_id=p_target_id ORDER BY kind FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_object_agg(kind,version::text) INTO v_versions
    FROM private.employee_authority_versions WHERE target_id=p_target_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('module',catalog.module,'action',catalog.action,
    'custom',EXISTS(SELECT 1 FROM public.user_permissions up WHERE up.user_id=p_target_id
      AND up.module=catalog.module AND up.enabled AND (up.action=catalog.action
        OR (catalog.action='update' AND up.action='edit'))),
    'inherited',EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.code=ur.role::text
      AND (r.tenant_id=v_target.tenant_id OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
      WHERE ur.user_id=p_target_id AND p.module=catalog.module
        AND (p.action=catalog.action OR (catalog.action='update' AND p.action='edit'))),
    'effective',public.has_user_permission(p_target_id,catalog.module,catalog.action),
    'delegatable',public.has_user_permission(v_actor.id,catalog.module,catalog.action))
    ORDER BY catalog.module,catalog.action),'[]'::jsonb) INTO v_actions FROM
    (SELECT DISTINCT module,CASE action WHEN 'edit' THEN 'update' ELSE action END AS action FROM public.permissions) catalog;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'code',h.code,'status',h.status,
    'assignable',h.status='active' AND (v_actor.user_level_code='tenant_owner' OR own.hotel_id IS NOT NULL),
    'allowed',jsonb_build_object(
      'can_create_managers',v_actor.user_level_code='tenant_owner' OR COALESCE(own.can_create_managers,false),
      'can_create_staff',v_actor.user_level_code='tenant_owner' OR COALESCE(own.can_create_staff,false),
      'can_view_reports',v_actor.user_level_code='tenant_owner' OR COALESCE(own.can_view_reports,false),
      'can_export_data',v_actor.user_level_code='tenant_owner' OR COALESCE(own.can_export_data,false),
      'can_approve_requests',v_actor.user_level_code='tenant_owner' OR COALESCE(own.can_approve_requests,false)))
    ORDER BY h.name,h.id),'[]'::jsonb) INTO v_hotels FROM public.hotels h
    LEFT JOIN public.user_hotels own ON own.hotel_id=h.id AND own.user_id=v_actor.id
    WHERE h.tenant_id=v_actor.tenant_id AND (v_actor.user_level_code='tenant_owner' OR own.hotel_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.user_hotels existing WHERE existing.user_id=p_target_id AND existing.hotel_id=h.id));
  RETURN jsonb_build_object('target_id',p_target_id,'versions',v_versions,'actions',v_actions,
    'grants',private.employee_authority_entries(p_target_id,'grants'),
    'hotels',private.employee_authority_entries(p_target_id,'hotels'),'primary_hotel_id',v_target.hotel_id,
    'hotel_catalog',v_hotels,'semantics','additive');
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_employee_authority_configuration(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_employee_authority_configuration(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
