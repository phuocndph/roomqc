-- A valid JWT is not evidence that its account/session is still active.
-- Genuine privileged lookup: caller-bound, private, boolean only, narrow ACL.
CREATE FUNCTION private.business_actor_is_live()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.jwt()->>'role') = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM auth.users a
      JOIN public.users u ON u.id=a.id
      JOIN auth.sessions s ON s.user_id=a.id
      WHERE a.id=(SELECT auth.uid())
        AND a.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL
        AND (a.banned_until IS NULL OR a.banned_until<=now())
        AND u.status='active' AND u.deleted_at IS NULL
        AND NOT COALESCE(u.account_locked,false)
        AND s.id::text=(SELECT auth.jwt()->>'session_id')
        AND (s.not_after IS NULL OR s.not_after>now())
    );
$fn$;
REVOKE ALL ON FUNCTION private.business_actor_is_live() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.business_actor_is_live() TO authenticated;

-- Statement trigger runs before business row locks, avoiding the reversed
-- business->actor lock order a row trigger would introduce. No action grants.
CREATE FUNCTION private.enforce_live_business_actor()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
BEGIN
  -- Use the actual database role set by PostgREST, not caller-editable metadata
  -- or current_user (which is the definer here). Preserve existing non-browser
  -- server/migrator paths; their grants/RLS remain unchanged.
  IF current_setting('role',true) NOT IN ('authenticated','anon') THEN RETURN NULL; END IF;
  IF current_setting('role',true)='anon' OR v_actor IS NULL
    OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'ACTIVE_BUSINESS_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>now()) THEN
    RAISE EXCEPTION 'ACTIVE_BUSINESS_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR COALESCE(v_profile.account_locked,false) THEN
    RAISE EXCEPTION 'ACTIVE_BUSINESS_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  -- Lock existing authority rows without inventing a new role/action contract.
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor ORDER BY role FOR SHARE;
  PERFORM 1 FROM auth.sessions WHERE user_id=v_actor AND id::text=auth.jwt()->>'session_id'
    AND (not_after IS NULL OR not_after>now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_BUSINESS_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION private.enforce_live_business_actor() FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['rooms','items','inventory_transactions','laundry_batches','maintenance_requests'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY business_actor_live ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.business_actor_is_live())) WITH CHECK ((SELECT private.business_actor_is_live()))',v_table);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER enforce_live_business_actor BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.enforce_live_business_actor()',v_table);
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION private.business_actor_is_live() IS 'Caller-bound live Auth/profile/session lookup only; does not grant tenant/hotel/action authority.';
COMMENT ON FUNCTION private.enforce_live_business_actor() IS 'Browser mutation statement fencing, Auth/profile/roles/session before business locks; trusted non-browser grants unchanged.';
