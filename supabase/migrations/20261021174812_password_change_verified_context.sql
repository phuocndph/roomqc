-- Additive readback context for captured-session password callers.
-- Does not change native Auth authority, receipt semantics or existing migration539.
CREATE OR REPLACE FUNCTION public.password_change_status(p_change_id uuid DEFAULT NULL)
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
    'completed_at',v_receipt.completed_at,'must_change_password',COALESCE(v_profile.must_change_password,false),
    'session_id',v_session,
    -- Match pinned GoTrue Session.IsRecovery(): OTP, magiclink and recovery.
    -- This is server AMR attached to the exact live session, not JWT metadata.
    'is_recovery',EXISTS(SELECT 1 FROM auth.mfa_amr_claims amr
      WHERE amr.session_id::text=v_session
        AND amr.authentication_method IN ('otp','magiclink','recovery')));
END;
$fn$;
REVOKE ALL ON FUNCTION public.password_change_status(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.password_change_status(uuid) TO authenticated;

COMMENT ON FUNCTION public.password_change_status(uuid) IS
  'Live exact-session password receipt and native recovery prompt context. No secrets or cross-actor receipt access; native Auth rechecks authorization.';
