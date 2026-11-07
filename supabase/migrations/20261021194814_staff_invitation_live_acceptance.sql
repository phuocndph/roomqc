-- Auth verifies the bearer at the Edge boundary. Only the service role can
-- convey that verified identity to this private transaction. Browser claims,
-- metadata, UUIDs and a second unrelated live session never grant authority.
CREATE FUNCTION private.staff_invitation_action(
  p_actor uuid,p_session uuid,p_action text,p_invitation uuid,p_tenant uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_hint public.staff_invitations%ROWTYPE; v_row public.staff_invitations%ROWTYPE;
  v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
  v_department text; v_role text; v_ids uuid[]; v_envelope jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role'
    OR p_actor IS NULL OR p_session IS NULL OR p_action NOT IN ('mine','accept','status')
    OR p_action IS NULL THEN
    RAISE EXCEPTION 'INVITATION_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  -- This lookup grants nothing. Re-read under lock after identities/profiles,
  -- matching native password's Auth-before-invitation ordering. It is never
  -- invitation-before-Auth as in the retired two-argument acceptance RPC.
  SELECT * INTO v_hint FROM public.staff_invitations
    WHERE auth_user_id=p_actor AND (p_invitation IS NULL OR id=p_invitation)
    ORDER BY created_at DESC,id DESC LIMIT 1;
  v_ids:=CASE WHEN p_action='accept' AND v_hint.status='pending'
    THEN ARRAY[p_actor,v_hint.invited_by,v_hint.reports_to] ELSE ARRAY[p_actor] END;
  PERFORM 1 FROM auth.users WHERE id=ANY(v_ids) ORDER BY id FOR UPDATE;
  SELECT * INTO v_auth FROM auth.users WHERE id=p_actor;
  IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'INVITATION_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.users WHERE id=ANY(v_ids) ORDER BY id FOR SHARE;
  SELECT * INTO v_profile FROM public.users WHERE id=p_actor;
  IF FOUND AND (v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR COALESCE(v_profile.account_locked,false)) THEN
    RAISE EXCEPTION 'INVITATION_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_row FROM public.staff_invitations WHERE id=v_hint.id AND auth_user_id=p_actor FOR UPDATE;
  PERFORM 1 FROM auth.sessions WHERE user_id=p_actor AND id=p_session
    AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  v_envelope:=jsonb_build_object('version',1,'actor_id',p_actor,'session_id',p_session);
  IF v_row.id IS NULL THEN
    IF p_action='mine' AND p_invitation IS NULL THEN RETURN v_envelope||jsonb_build_object('invitation',NULL); END IF;
    RAISE EXCEPTION 'INVITATION_UNAVAILABLE';
  END IF;
  IF v_row.email IS DISTINCT FROM lower(v_auth.email)
    OR (p_tenant IS NOT NULL AND p_tenant IS DISTINCT FROM v_row.tenant_id) THEN
    RAISE EXCEPTION 'INVITATION_TARGET_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_row.invited_by IS DISTINCT FROM v_hint.invited_by OR v_row.reports_to IS DISTINCT FROM v_hint.reports_to
    OR v_row.tenant_id IS DISTINCT FROM v_hint.tenant_id OR v_row.hotel_id IS DISTINCT FROM v_hint.hotel_id
    OR v_row.position_id IS DISTINCT FROM v_hint.position_id OR v_row.user_level_code IS DISTINCT FROM v_hint.user_level_code THEN
    RAISE EXCEPTION 'INVITATION_CONTEXT_CHANGED';
  END IF;
  v_envelope:=v_envelope||jsonb_build_object('invitation_id',v_row.id,'tenant_id',v_row.tenant_id,'hotel_id',v_row.hotel_id);
  IF p_action='mine' THEN
    RETURN v_envelope||jsonb_build_object('invitation',CASE WHEN v_row.status='accepted' THEN NULL ELSE
      jsonb_build_object('id',v_row.id,'name',v_row.full_name,'tenantId',v_row.tenant_id,'hotelId',v_row.hotel_id,
        'revoked',v_row.status='revoked','passwordReady',v_row.password_set_at IS NOT NULL,
        'expired',v_row.expires_at<=clock_timestamp()) END);
  END IF;
  -- Freeze current roles/assignment before validating an accepted replay.
  -- Replay is a read of a prior acceptance, never a repair/re-grant operation.
  PERFORM 1 FROM public.user_roles WHERE user_id=ANY(v_ids) ORDER BY user_id,role FOR SHARE;
  PERFORM 1 FROM public.user_hotels WHERE user_id=ANY(v_ids) ORDER BY user_id,hotel_id FOR SHARE;
  IF v_row.status='accepted' THEN
    IF v_row.accepted_at IS NULL OR v_profile.id IS NULL OR v_profile.tenant_id IS DISTINCT FROM v_row.tenant_id
      OR v_profile.hotel_id IS DISTINCT FROM v_row.hotel_id
      OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text=v_profile.role::text)
      OR NOT EXISTS(SELECT 1 FROM public.user_hotels WHERE user_id=p_actor AND hotel_id=v_row.hotel_id)
      OR NOT EXISTS(SELECT 1 FROM public.hotels WHERE id=v_row.hotel_id AND tenant_id=v_row.tenant_id AND status='active') THEN
      RAISE EXCEPTION 'INVITATION_MEMBERSHIP_REQUIRED' USING ERRCODE='42501';
    END IF;
    RETURN v_envelope||jsonb_build_object('success',true,'status','accepted','idempotent',true,'accepted_at',v_row.accepted_at);
  END IF;
  IF p_action='status' THEN
    RETURN v_envelope||jsonb_build_object('success',false,'status',v_row.status,'accepted_at',NULL,
      'expired',v_row.expires_at<=clock_timestamp());
  END IF;
  IF v_row.status<>'pending' OR v_row.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
  -- An admin password reset is not employee verification. A completed native
  -- user password operation must postdate THIS invitation. Another legitimate
  -- login may resume it without setting the password a second time.
  IF COALESCE(v_auth.encrypted_password,'')='' OR v_row.password_set_at IS NULL
    OR NOT EXISTS(SELECT 1 FROM private.password_change_receipts WHERE actor_id=p_actor
      AND completed_at>=v_row.created_at AND completed_at>=v_row.password_set_at) THEN
    RAISE EXCEPTION 'INVITATION_PASSWORD_SETUP_REQUIRED';
  END IF;
  IF v_profile.id IS NOT NULL OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=v_row.email)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor)
    OR EXISTS(SELECT 1 FROM public.user_hotels WHERE user_id=p_actor) THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_PROVISIONED';
  END IF;
  -- Inviter/report Auth and profile rows are held above. Revoked role or
  -- hotel assignment cannot be hidden by a previously generated invitation.
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_row.invited_by AND email_confirmed_at IS NOT NULL
      AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM public.users u JOIN public.user_roles r ON r.user_id=u.id AND r.role::text=u.role::text
      WHERE u.id=v_row.invited_by AND u.tenant_id=v_row.tenant_id AND u.status='active'
        AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
        AND (u.user_level_code='tenant_owner' OR EXISTS(SELECT 1 FROM public.user_hotels h
          WHERE h.user_id=u.id AND h.hotel_id=v_row.hotel_id
            AND CASE WHEN v_row.user_level_code='staff' THEN h.can_create_staff ELSE h.can_create_managers END))) THEN
    RAISE EXCEPTION 'INVITATION_INVITER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_row.reports_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
    WHERE u.id=v_row.reports_to AND u.deleted_at IS NULL AND a.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL
      AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())) THEN
    RAISE EXCEPTION 'INVITATION_REPORT_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id=v_row.tenant_id FOR UPDATE;
  PERFORM 1 FROM public.hotels WHERE id=v_row.hotel_id AND tenant_id=v_row.tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_HOTEL_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.positions WHERE id=v_row.position_id AND tenant_id=v_row.tenant_id FOR SHARE;
  PERFORM public.update_tenant_usage(v_row.tenant_id);
  v_department:=public.validate_staff_inviter(v_row.invited_by,v_row.tenant_id,v_row.hotel_id,
    v_row.user_level_code,v_row.position_id,v_row.reports_to);
  v_role:=CASE v_row.user_level_code WHEN 'manager' THEN 'hotel_manager' WHEN 'department_manager' THEN 'department_manager' ELSE 'staff' END;
  INSERT INTO public.users(id,tenant_id,hotel_id,full_name,email,role,user_level_code,department,status,
    created_by,reports_to,position_id,must_change_password,is_super_admin,is_primary_owner,account_locked)
    VALUES(p_actor,v_row.tenant_id,v_row.hotel_id,v_row.full_name,v_row.email,v_role,v_row.user_level_code,v_department,'active',
      v_row.invited_by,v_row.reports_to,v_row.position_id,false,false,false,false);
  INSERT INTO public.user_roles(user_id,role,created_by) VALUES(p_actor,v_role::public.app_role,v_row.invited_by);
  INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by,can_create_managers,can_create_staff,can_view_reports,can_export_data,can_approve_requests)
    VALUES(p_actor,v_row.hotel_id,v_row.invited_by,v_row.user_level_code='manager',v_row.user_level_code IN ('manager','department_manager'),
      v_row.user_level_code IN ('manager','department_manager'),v_row.user_level_code IN ('manager','department_manager'),v_row.user_level_code IN ('manager','department_manager'));
  UPDATE public.staff_invitations SET status='accepted',accepted_at=clock_timestamp() WHERE id=v_row.id RETURNING * INTO v_row;
  PERFORM public.update_tenant_usage(v_row.tenant_id);
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description)
    VALUES(v_row.tenant_id,p_actor,v_row.full_name,'user',p_actor,v_row.full_name,'create','Chấp nhận lời mời nhân viên');
  RETURN v_envelope||jsonb_build_object('success',true,'status','accepted','idempotent',false,'accepted_at',v_row.accepted_at);
END;
$fn$;
REVOKE ALL ON FUNCTION private.staff_invitation_action(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.staff_invitation_action(uuid,uuid,text,uuid,uuid) TO service_role;

-- Thin PostgREST adapter; privileged implementation remains in the private schema.
CREATE FUNCTION public.staff_invitation_action(
  p_actor uuid,p_session uuid,p_action text,p_invitation uuid DEFAULT NULL,p_tenant uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.staff_invitation_action(p_actor,p_session,p_action,p_invitation,p_tenant);
$fn$;
REVOKE ALL ON FUNCTION public.staff_invitation_action(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_invitation_action(uuid,uuid,text,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation(uuid,uuid) FROM service_role;

COMMENT ON FUNCTION public.staff_invitation_action(uuid,uuid,text,uuid,uuid) IS
  'Verified Edge actor + exact native session; versioned invitation target/acceptance readback. No replay re-grant and no browser execution.';
