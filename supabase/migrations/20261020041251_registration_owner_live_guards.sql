-- Forward-only registration actor boundary. Runtime jobs do not need a user's
-- interactive session; gateway-originated writes bind the initiating session too.
CREATE OR REPLACE FUNCTION private.registration_owner(
  p_owner_id uuid, p_session_id text DEFAULT NULL, p_require_session boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
BEGIN
  -- Consistent order: Auth owner -> profile -> session -> workspace receipt.
  -- Locks live until transaction end, serializing account/session revocation.
  SELECT * INTO v_auth FROM auth.users WHERE id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR v_auth.email IS NULL OR v_auth.email_confirmed_at IS NULL
    OR v_auth.deleted_at IS NOT NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now()) THEN
    RAISE EXCEPTION 'ACTIVE_REGISTRATION_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=p_owner_id FOR UPDATE;
  IF FOUND THEN
    IF v_profile.deleted_at IS NOT NULL OR COALESCE(v_profile.account_locked,false)
      OR COALESCE(v_profile.is_super_admin,false)
      OR COALESCE(v_profile.role::text,'')<>'owner'
      OR NOT COALESCE((
        (v_profile.status='pending_setup' AND COALESCE(v_profile.user_level_code,'') IN ('','tenant_owner'))
        OR (v_profile.status='active' AND v_profile.user_level_code='tenant_owner'
          AND COALESCE(v_profile.is_primary_owner,false)
          AND v_profile.tenant_id IS NOT NULL AND v_profile.hotel_id IS NOT NULL)
      ),false) THEN
      RAISE EXCEPTION 'ACTIVE_REGISTRATION_OWNER_REQUIRED' USING ERRCODE='42501';
    END IF;
  END IF;
  IF v_profile.status='active' THEN
    PERFORM 1 FROM public.user_roles WHERE user_id=p_owner_id AND role::text='owner' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_REGISTRATION_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_owner_id AND role::text<>'owner')
    OR EXISTS(SELECT 1 FROM public.staff_invitations WHERE auth_user_id=p_owner_id AND status<>'accepted') THEN
    RAISE EXCEPTION 'ACTIVE_REGISTRATION_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_require_session THEN
    PERFORM 1 FROM auth.sessions WHERE user_id=p_owner_id AND id::text=p_session_id
      AND (not_after IS NULL OR not_after>now()) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_REGISTRATION_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN lower(trim(v_auth.email));
END;
$fn$;
REVOKE ALL ON FUNCTION private.registration_owner(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- Browser preflight uses verified JWT claims plus live DB state, not /user alone.
CREATE OR REPLACE FUNCTION public.registration_actor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid:=auth.uid(); v_email text; v_confirmed timestamptz;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'REGISTRATION_LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
  v_email:=private.registration_owner(v_owner,auth.jwt()->>'session_id',true);
  SELECT email_confirmed_at INTO v_confirmed FROM auth.users WHERE id=v_owner;
  RETURN jsonb_build_object('id',v_owner,'email',v_email,
    'email_confirmed_at',v_confirmed,'session_id',auth.jwt()->>'session_id');
END;
$fn$;
REVOKE ALL ON FUNCTION public.registration_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.registration_actor() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,p_full_name text,p_phone text,p_tenant_name text,p_email text,p_hotel_name text,
  p_hotel_address text,p_hotel_phone text,p_hotel_email text,p_total_rooms integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_service boolean:=COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.jwt()->>'role','')='service_role';
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS DISTINCT FROM p_user_id AND NOT v_service) THEN
    RAISE EXCEPTION 'REGISTRATION_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT v_service AND EXISTS(SELECT 1 FROM private.roomqc_cluster_config WHERE directory_required) THEN
    RETURN jsonb_build_object('success',false,'error','Registration requires the RoomQC directory');
  END IF;
  PERFORM private.registration_owner(p_user_id,auth.jwt()->>'session_id',NOT v_service);
  PERFORM set_config('roomqc.registration_provisioning','true',true);
  PERFORM set_config('roomqc.registration_user_id',p_user_id::text,true);
  RETURN public.complete_registration_impl(p_user_id,p_full_name,p_phone,p_tenant_name,p_email,
    p_hotel_name,p_hotel_address,p_hotel_phone,p_hotel_email,p_total_rooms);
END;
$fn$;
REVOKE ALL ON FUNCTION public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer) TO authenticated,service_role;
-- Internal implementations are not alternate Data API entry points.
REVOKE ALL ON FUNCTION public.complete_registration_impl(uuid,text,text,text,text,text,text,text,text,integer)
  FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) RENAME TO provision_workspace_registration_impl;
REVOKE ALL ON FUNCTION public.provision_workspace_registration_impl(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.provision_workspace_registration(
  p_workspace_id uuid,p_owner_id uuid,p_fields jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  -- Service calls may be session-free. When a gateway supplies a caller session,
  -- bind/recheck it here at the actual remote write, not only at HTTP preflight.
  PERFORM private.registration_owner(p_owner_id,p_fields->>'registrationSessionId',
    COALESCE(p_fields ? 'registrationSessionId',false));
  RETURN public.provision_workspace_registration_impl(p_workspace_id,p_owner_id,p_fields);
END;
$fn$;
REVOKE ALL ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_registration(uuid,uuid,jsonb) TO service_role;
