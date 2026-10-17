-- Read scope for legacy subscription evidence. Kept in the non-exposed private
-- schema: policies need auth.sessions/auth.users, which browsers must not read.
CREATE OR REPLACE FUNCTION private.legacy_anomaly_actor()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT COALESCE((
    SELECT jsonb_build_object('tenant_id',u.tenant_id,
      'support',public.is_super_admin(u.id),
      'owner',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='owner'))
    FROM public.users u JOIN auth.users au ON au.id=u.id
    WHERE u.id=auth.uid() AND u.status='active' AND NOT COALESCE(u.account_locked,false)
      AND au.email_confirmed_at IS NOT NULL
      AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
        AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()))
  ),'{}'::jsonb);
$fn$;
REVOKE ALL ON FUNCTION private.legacy_anomaly_actor() FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.legacy_anomaly_actor() TO authenticated;
DROP POLICY IF EXISTS anomalies_select_owner ON public.payment_anomalies;
CREATE POLICY anomalies_select_owner ON public.payment_anomalies FOR SELECT TO authenticated
USING (
  ((SELECT private.legacy_anomaly_actor())->>'support')::boolean IS TRUE
  OR (
    ((SELECT private.legacy_anomaly_actor())->>'owner')::boolean IS TRUE
    AND tenant_id::text=(SELECT private.legacy_anomaly_actor())->>'tenant_id'
  )
);
