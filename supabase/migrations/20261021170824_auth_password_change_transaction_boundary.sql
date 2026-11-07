-- RoomQC's pinned Auth extension calls these private helpers inside the same
-- GoTrue transaction as password storage, session revocation and Auth audit.
-- No browser/service-role API can establish this trusted context.
CREATE TABLE private.password_change_receipts (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX password_change_receipts_actor_session
  ON private.password_change_receipts(actor_id,session_id,completed_at DESC);
ALTER TABLE private.password_change_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.password_change_receipts FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;

CREATE FUNCTION private.begin_password_change(
  p_actor uuid,p_session uuid,p_previous_hash text,p_change uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE; v_invite public.staff_invitations%ROWTYPE;
BEGIN
  IF session_user IS DISTINCT FROM 'supabase_auth_admin'
    OR current_setting('role',true) NOT IN ('none','supabase_auth_admin')
    OR p_actor IS NULL OR p_session IS NULL OR p_change IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'status',403,'code','password_change_forbidden');
  END IF;
  -- Stable ordering, shared by registration/profile sensitive mutations:
  -- Auth identity -> profile -> exact initiating session. Locks survive until
  -- the password, receipt, completion flag and Auth audit all commit/rollback.
  SELECT * INTO v_auth FROM auth.users WHERE id=p_actor FOR UPDATE;
  IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RETURN jsonb_build_object('allowed',false,'status',403,'code','password_change_forbidden');
  END IF;
  -- GoTrue checked current_password on its authenticated snapshot before
  -- hashing. A concurrent reset/change invalidates that snapshot, not authority.
  IF COALESCE(v_auth.encrypted_password,'') IS DISTINCT FROM COALESCE(p_previous_hash,'') THEN
    RETURN jsonb_build_object('allowed',false,'status',409,'code','password_change_conflict');
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=p_actor FOR UPDATE;
  IF FOUND THEN
    IF v_profile.deleted_at IS NOT NULL OR COALESCE(v_profile.account_locked,false)
      OR NOT COALESCE(v_profile.status='active'
        OR (v_profile.status='pending_setup' AND v_profile.tenant_id IS NULL
          AND v_profile.hotel_id IS NULL AND v_profile.role::text='owner'),false) THEN
      RETURN jsonb_build_object('allowed',false,'status',403,'code','password_change_forbidden');
    END IF;
  ELSE
    -- Preserve pre-profile verified signup and invitation password setup.
    -- No profile is not a route to accepting an expired/revoked invitation.
    SELECT * INTO v_invite FROM public.staff_invitations
      WHERE auth_user_id=p_actor ORDER BY created_at DESC LIMIT 1 FOR SHARE;
    IF FOUND AND (v_invite.status IS DISTINCT FROM 'pending' OR v_invite.expires_at<=clock_timestamp()
      OR v_invite.email IS DISTINCT FROM lower(v_auth.email)) THEN
      RETURN jsonb_build_object('allowed',false,'status',403,'code','password_change_forbidden');
    END IF;
    IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor) THEN
      RETURN jsonb_build_object('allowed',false,'status',403,'code','password_change_forbidden');
    END IF;
  END IF;
  PERFORM 1 FROM auth.sessions WHERE user_id=p_actor AND id=p_session
    AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed',false,'status',401,'code','password_change_session_required');
  END IF;
  IF EXISTS(SELECT 1 FROM private.password_change_receipts WHERE id=p_change) THEN
    RETURN jsonb_build_object('allowed',false,'status',409,'code','password_change_already_completed');
  END IF;
  PERFORM set_config('roomqc.password_actor',p_actor::text,true);
  PERFORM set_config('roomqc.password_session',p_session::text,true);
  PERFORM set_config('roomqc.password_change',p_change::text,true);
  RETURN jsonb_build_object('allowed',true);
END;
$fn$;

CREATE FUNCTION private.complete_password_change(
  p_actor uuid,p_session uuid,p_previous_hash text,p_change uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF session_user IS DISTINCT FROM 'supabase_auth_admin'
    OR current_setting('role',true) NOT IN ('none','supabase_auth_admin')
    OR p_actor IS NULL OR p_session IS NULL OR p_change IS NULL
    OR current_setting('roomqc.password_actor',true) IS DISTINCT FROM p_actor::text
    OR current_setting('roomqc.password_session',true) IS DISTINCT FROM p_session::text
    OR current_setting('roomqc.password_change',true) IS DISTINCT FROM p_change::text THEN
    RETURN jsonb_build_object('allowed',false,'status',403,'code','password_change_forbidden');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_actor
      AND (not_after IS NULL OR not_after>clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor
      AND COALESCE(encrypted_password,'')<>'' AND encrypted_password IS DISTINCT FROM p_previous_hash) THEN
    RETURN jsonb_build_object('allowed',false,'status',409,'code','password_change_conflict');
  END IF;
  UPDATE public.users SET must_change_password=false,updated_at=clock_timestamp() WHERE id=p_actor;
  INSERT INTO private.password_change_receipts(id,actor_id,session_id) VALUES(p_change,p_actor,p_session);
  PERFORM set_config('roomqc.password_actor','',true);
  PERFORM set_config('roomqc.password_session','',true);
  PERFORM set_config('roomqc.password_change','',true);
  RETURN jsonb_build_object('allowed',true);
END;
$fn$;

REVOKE ALL ON FUNCTION private.begin_password_change(uuid,uuid,text,uuid),
  private.complete_password_change(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private.begin_password_change(uuid,uuid,text,uuid),
  private.complete_password_change(uuid,uuid,text,uuid) TO supabase_auth_admin;

CREATE FUNCTION private.guard_password_requirement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF current_setting('role',true) IN ('anon','authenticated')
    AND NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    RAISE EXCEPTION 'PASSWORD_REQUIREMENT_SERVER_MANAGED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_password_requirement() FROM PUBLIC,anon,authenticated,service_role,supabase_auth_admin;
CREATE TRIGGER guard_password_requirement BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.guard_password_requirement();

-- Readback is scoped to the caller's live identity AND session, optionally
-- the caller-generated change UUID. Never returns a hash, password or token.
CREATE FUNCTION public.password_change_status(p_change_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
  v_receipt private.password_change_receipts%ROWTYPE; v_session text:=auth.jwt()->>'session_id';
BEGIN
  IF v_actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'PASSWORD_CHANGE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.email_confirmed_at IS NULL OR v_auth.deleted_at IS NOT NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'PASSWORD_CHANGE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=v_actor FOR SHARE;
  IF FOUND AND (COALESCE(v_profile.account_locked,false) OR v_profile.deleted_at IS NOT NULL
    OR NOT COALESCE(v_profile.status='active' OR (v_profile.status='pending_setup'
      AND v_profile.tenant_id IS NULL AND v_profile.hotel_id IS NULL AND v_profile.role::text='owner'),false)) THEN
    RAISE EXCEPTION 'PASSWORD_CHANGE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM auth.sessions WHERE user_id=v_actor AND id::text=v_session
    AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PASSWORD_CHANGE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_receipt FROM private.password_change_receipts
    WHERE actor_id=v_actor AND session_id::text=v_session AND (p_change_id IS NULL OR id=p_change_id)
    ORDER BY completed_at DESC,id DESC LIMIT 1;
  RETURN jsonb_build_object('actor_id',v_actor,'change_id',v_receipt.id,
    'completed_at',v_receipt.completed_at,'must_change_password',COALESCE(v_profile.must_change_password,false));
END;
$fn$;
REVOKE ALL ON FUNCTION public.password_change_status(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.password_change_status(uuid) TO authenticated;

COMMENT ON FUNCTION private.begin_password_change(uuid,uuid,text,uuid) IS
  'Pinned RoomQC GoTrue transaction entry only. Verified actor/session and old password snapshot are native Auth inputs, not browser authority.';
COMMENT ON FUNCTION private.complete_password_change(uuid,uuid,text,uuid) IS
  'Native user password storage, completion and receipt commit together; admin reset and metadata update do not enter this path.';
