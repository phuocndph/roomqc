-- Browser users-table UPDATEs first fence the live Auth identity/session. Do
-- not take a profile SHARE lock here: a self UPDATE must acquire its own row
-- lock only once, without concurrent SHARE -> UPDATE upgrades/deadlocks.
-- Existing managed-edit RPC/RLS/privilege checks are not replaced or widened.
CREATE FUNCTION private.fence_profile_update_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE;
BEGIN
  IF current_setting('role',true) NOT IN ('authenticated','anon') THEN RETURN NULL; END IF;
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR v_actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'PROFILE_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now()) THEN
    RAISE EXCEPTION 'PROFILE_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM auth.sessions WHERE user_id=v_actor AND id::text=auth.jwt()->>'session_id'
    AND (not_after IS NULL OR not_after>now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION private.fence_profile_update_session() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER fence_profile_update_session BEFORE UPDATE ON public.users
  FOR EACH STATEMENT EXECUTE FUNCTION private.fence_profile_update_session();

CREATE FUNCTION private.guard_self_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR OLD.id IS DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;

  -- Preserve only the already-guarded first-owner provisioning context used by
  -- complete_registration. Browser PATCH cannot establish this local context.
  IF current_setting('roomqc.registration_provisioning',true)='true'
    AND current_setting('roomqc.registration_user_id',true)=OLD.id::text
    AND OLD.tenant_id IS NULL AND COALESCE(OLD.status,'') IN ('','pending_setup')
    AND NEW.tenant_id IS NOT NULL AND NEW.user_level_code='tenant_owner'
    AND COALESCE(NEW.is_primary_owner,false) THEN RETURN NEW; END IF;

  -- OLD is the actual UPDATE-locked target row, including a revocation that
  -- committed while the UPDATE waited; do not trust a pre-lock JWT/snapshot.
  IF OLD.status IS DISTINCT FROM 'active' OR OLD.deleted_at IS NOT NULL
    OR COALESCE(OLD.account_locked,false) THEN
    RAISE EXCEPTION 'PROFILE_ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['full_name','phone','avatar_url','updated_at','must_change_password'])
    IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['full_name','phone','avatar_url','updated_at','must_change_password']) THEN
    RAISE EXCEPTION 'PROFILE_PROTECTED_FIELDS' USING ERRCODE='42501';
  END IF;
  -- Compatibility for the existing post-password-change page, not proof that
  -- its Auth/password contract is complete. EC05 must review/replace this
  -- client acknowledgement separately; it cannot turn false back to true.
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
    AND NOT (OLD.must_change_password IS TRUE AND NEW.must_change_password IS FALSE) THEN
    RAISE EXCEPTION 'PROFILE_PROTECTED_FIELDS' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_self_profile_update() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_self_profile_update BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.guard_self_profile_update();

COMMENT ON FUNCTION private.fence_profile_update_session() IS
  'Auth/session locks before browser profile writes, no profile lock upgrade or action grants; trusted server paths unchanged.';
COMMENT ON FUNCTION private.guard_self_profile_update() IS
  'Self metadata boundary on the locked row; legacy password acknowledgement remains a separate unresolved caller contract.';
