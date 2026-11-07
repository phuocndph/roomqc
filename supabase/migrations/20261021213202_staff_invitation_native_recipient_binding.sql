-- Forward fix: resolve a unique native recipient before ordered Auth/profile
-- locks. Preserve authority, audit, CAS/cooldown and no-membership semantics.
CREATE OR REPLACE FUNCTION private.staff_invitation_manage(
  p_actor uuid,p_session uuid,p_action text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_profile public.users%ROWTYPE; v_auth auth.users%ROWTYPE;
  v_hint public.staff_invitations%ROWTYPE; v_row public.staff_invitations%ROWTYPE;
  v_id uuid; v_tenant uuid; v_hotel uuid; v_position uuid; v_reports uuid;
  v_ids uuid[]; v_recipients uuid[]; v_level text; v_department text; v_previous timestamptz;
  v_reserved timestamptz; v_target uuid; v_created boolean:=false; v_result jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR p_actor IS NULL OR p_session IS NULL THEN
    RAISE EXCEPTION 'INVITATION_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('list','create','reserve','revoke','finish','release')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>16384 THEN
    RAISE EXCEPTION 'INVITATION_INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  v_id:=(p_payload->>'id')::uuid;
  IF p_action NOT IN ('list','create') THEN
    SELECT * INTO v_hint FROM public.staff_invitations WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
    v_tenant:=v_hint.tenant_id; v_hotel:=v_hint.hotel_id;
    v_position:=v_hint.position_id; v_reports:=v_hint.reports_to; v_level:=v_hint.user_level_code;
  ELSIF p_action='create' THEN
    v_tenant:=(p_payload->>'tenantId')::uuid; v_hotel:=(p_payload->>'hotelId')::uuid;
    v_position:=(p_payload->>'positionId')::uuid; v_reports:=NULLIF(p_payload->>'reportsTo','')::uuid;
    v_level:=p_payload->>'userLevelCode';
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(trim(p_payload->>'email')),16072409));
    SELECT * INTO v_hint FROM public.staff_invitations WHERE lower(email)=lower(trim(p_payload->>'email')) AND status='pending';
  END IF;
  -- Same Auth-before-profile-before-invitation order as acceptance/native Auth.
  -- Observed cross-operation lock tests remain required before full closure.
  IF p_action='reserve' THEN
    -- Resolve only the invitation's canonical email, never a caller UUID. An
    -- existing confirmed pre-profile user needs recovery, not duplicate signup.
    SELECT array_agg(id ORDER BY id) INTO v_recipients FROM auth.users WHERE lower(email)=v_hint.email;
    IF COALESCE(cardinality(v_recipients),0)>1 THEN
      RAISE EXCEPTION 'INVITATION_RECIPIENT_REQUIRED' USING ERRCODE='42501';
    END IF;
    v_target:=v_recipients[1];
  END IF;
  v_ids:=ARRAY[p_actor,v_reports,v_hint.auth_user_id,v_hint.invited_by,v_hint.reports_to,v_target];
  PERFORM 1 FROM auth.users WHERE id=ANY(v_ids) ORDER BY id FOR UPDATE;
  SELECT * INTO v_auth FROM auth.users WHERE id=p_actor;
  IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'INVITATION_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.users WHERE id=ANY(v_ids) ORDER BY id FOR SHARE;
  SELECT * INTO v_profile FROM public.users WHERE id=p_actor;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR COALESCE(v_profile.account_locked,false)
    OR v_profile.user_level_code IS NULL OR v_profile.user_level_code NOT IN ('tenant_owner','manager','department_manager') THEN
    RAISE EXCEPTION 'INVITATION_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('list','create') THEN
    SELECT * INTO v_row FROM public.staff_invitations WHERE id=v_id FOR UPDATE;
    IF NOT FOUND OR (v_row.tenant_id,v_row.hotel_id,v_row.position_id,v_row.reports_to,v_row.user_level_code)
      IS DISTINCT FROM (v_tenant,v_hotel,v_position,v_reports,v_level) THEN
      RAISE EXCEPTION 'INVITATION_CONTEXT_CHANGED';
    END IF;
  ELSIF p_action='create' AND v_hint.id IS NOT NULL THEN
    PERFORM 1 FROM public.staff_invitations WHERE id=v_hint.id AND status='pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_CONTEXT_CHANGED'; END IF;
  END IF;
  PERFORM 1 FROM auth.sessions WHERE user_id=p_actor AND id=p_session
    AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor ORDER BY role FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text=v_profile.role::text) THEN
    RAISE EXCEPTION 'INVITATION_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_hotels WHERE user_id=p_actor ORDER BY hotel_id FOR SHARE;
  v_tenant:=COALESCE(v_tenant,v_profile.tenant_id);
  PERFORM 1 FROM public.tenants WHERE id=v_tenant AND id=v_profile.tenant_id AND approval_status='approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_TENANT_REQUIRED' USING ERRCODE='42501'; END IF;
  v_result:=jsonb_build_object('version',1,'actor_id',p_actor,'session_id',p_session);
  IF p_action='list' THEN
    RETURN v_result||jsonb_build_object('invitations',COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC) FROM (
        SELECT i.id,i.email,i.full_name,i.user_level_code,i.hotel_id,i.expires_at,i.sent_at,i.created_at
        FROM public.staff_invitations i JOIN public.positions pos ON pos.id=i.position_id AND pos.tenant_id=i.tenant_id
        JOIN public.hotels h ON h.id=i.hotel_id AND h.tenant_id=i.tenant_id AND h.status='active'
        WHERE i.tenant_id=v_tenant AND i.status='pending'
          AND (v_profile.user_level_code='tenant_owner' OR (
            i.hotel_id=v_profile.hotel_id AND i.user_level_code<>'manager'
            AND (v_profile.user_level_code='manager' OR (i.user_level_code='staff' AND pos.department=v_profile.department))
            AND EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=p_actor AND uh.hotel_id=i.hotel_id
              AND CASE WHEN i.user_level_code='staff' THEN uh.can_create_staff ELSE uh.can_create_managers END)))
        ORDER BY i.created_at DESC,i.id DESC LIMIT 100
      ) q),'[]'::jsonb));
  END IF;
  PERFORM 1 FROM public.hotels WHERE id=v_hotel AND tenant_id=v_tenant AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_HOTEL_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.positions WHERE id=v_position AND tenant_id=v_tenant AND (p_action='revoke' OR status='active') FOR SHARE;
  IF NOT FOUND OR (v_profile.user_level_code<>'tenant_owner' AND NOT EXISTS(
      SELECT 1 FROM public.user_hotels WHERE user_id=p_actor AND hotel_id=v_hotel
        AND CASE WHEN v_level='staff' THEN can_create_staff ELSE can_create_managers END)) THEN
    RAISE EXCEPTION 'INVITATION_PERMISSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_create_user(p_actor,v_level,v_tenant)
    OR (v_profile.user_level_code<>'tenant_owner' AND v_profile.hotel_id IS DISTINCT FROM v_hotel)
    OR (v_profile.user_level_code='department_manager' AND NOT EXISTS(
      SELECT 1 FROM public.positions WHERE id=v_position AND department=v_profile.department)) THEN
    RAISE EXCEPTION 'INVITATION_PERMISSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_action<>'revoke' AND v_reports IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
    WHERE u.id=v_reports AND u.deleted_at IS NULL AND a.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL
      AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())) THEN
    RAISE EXCEPTION 'INVITATION_REPORT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_action<>'revoke' THEN
    v_department:=public.validate_staff_inviter(p_actor,v_tenant,v_hotel,v_level,v_position,v_reports);
  END IF;
  IF p_action='create' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(trim(p_payload->>'email')),16072409));
    v_created:=NOT EXISTS(SELECT 1 FROM public.staff_invitations WHERE lower(email)=lower(trim(p_payload->>'email')) AND status='pending');
    SELECT * INTO v_row FROM public.prepare_staff_invitation(p_actor,v_tenant,v_hotel,p_payload->>'email',
      p_payload->>'fullName',v_level,v_position,v_reports);
    IF v_created THEN
      INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description)
        VALUES(v_tenant,p_actor,v_profile.full_name,'staff_invitation',v_row.id,v_row.full_name,'create','Tạo lời mời nhân viên');
    END IF;
  ELSIF p_action='revoke' THEN
    IF v_row.status='accepted' THEN RAISE EXCEPTION 'INVITATION_ALREADY_ACCEPTED'; END IF;
    IF v_row.status='pending' THEN
      UPDATE public.staff_invitations SET status='revoked' WHERE id=v_row.id RETURNING * INTO v_row;
      INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description)
        VALUES(v_tenant,p_actor,v_profile.full_name,'staff_invitation',v_row.id,v_row.full_name,'update','Thu hồi lời mời nhân viên');
      v_created:=true;
    END IF;
  ELSE
    IF v_row.status<>'pending' THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
    IF p_action='reserve' THEN
      IF v_row.email IS DISTINCT FROM v_hint.email
        OR (v_row.auth_user_id IS NOT NULL AND v_row.auth_user_id IS DISTINCT FROM v_target)
        OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=v_row.email)
        OR (v_target IS NOT NULL AND NOT EXISTS(
          SELECT 1 FROM auth.users WHERE id=v_target AND lower(email)=v_row.email
            AND aud='authenticated' AND NOT COALESCE(is_sso_user,false)
            AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))) THEN
        RAISE EXCEPTION 'INVITATION_RECIPIENT_REQUIRED' USING ERRCODE='42501';
      END IF;
      IF v_row.sent_at IS NOT NULL AND v_row.sent_at>clock_timestamp()-interval '1 minute' THEN
        RAISE EXCEPTION 'INVITATION_SEND_COOLDOWN';
      END IF;
      v_previous:=v_row.sent_at; v_reserved:=clock_timestamp();
      UPDATE public.staff_invitations SET sent_at=v_reserved,auth_user_id=COALESCE(auth_user_id,v_target)
        WHERE id=v_row.id RETURNING * INTO v_row;
    ELSE
      v_reserved:=(p_payload->>'reservedAt')::timestamptz;
      IF v_reserved IS NULL OR v_row.sent_at IS DISTINCT FROM v_reserved
        OR v_reserved<clock_timestamp()-interval '1 minute' THEN RAISE EXCEPTION 'INVITATION_SEND_CHANGED'; END IF;
      IF p_action='finish' THEN
        v_target:=(p_payload->>'authUserId')::uuid;
        IF v_target IS NULL OR (v_row.auth_user_id IS NOT NULL AND v_row.auth_user_id<>v_target)
          OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_target AND lower(email)=v_row.email AND deleted_at IS NULL
            AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
          OR EXISTS(SELECT 1 FROM public.users WHERE id=v_target OR lower(email)=v_row.email) THEN
          RAISE EXCEPTION 'INVITATION_RECIPIENT_REQUIRED' USING ERRCODE='42501';
        END IF;
        UPDATE public.staff_invitations SET auth_user_id=v_target,expires_at=clock_timestamp()+interval '24 hours'
          WHERE id=v_row.id RETURNING * INTO v_row;
      ELSIF p_action='release' THEN
        UPDATE public.staff_invitations SET sent_at=(p_payload->>'previousSentAt')::timestamptz
          WHERE id=v_row.id RETURNING * INTO v_row;
      END IF;
    END IF;
  END IF;
  RETURN v_result||jsonb_build_object('success',true,'invitation',to_jsonb(v_row),
    'previous_sent_at',v_previous,'idempotent',NOT v_created);
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_invitation_manage(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.staff_invitation_manage(uuid,uuid,text,jsonb) TO service_role;
