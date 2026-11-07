-- A workspace receipt is an idempotency/recovery record, not disposable hotel
-- metadata. Keep the separate tenant FK/offboarding contract unchanged.
ALTER TABLE private.workspace_provisioning
  DROP CONSTRAINT workspace_provisioning_hotel_id_fkey,
  ADD CONSTRAINT workspace_provisioning_hotel_id_fkey
    FOREIGN KEY (hotel_id) REFERENCES public.hotels(id) ON DELETE NO ACTION;

-- This private RLS predicate needs access to live Auth rows unavailable to the
-- browser. Reuse the already reviewed actor lock boundary; never grant callers
-- direct Auth access or EXECUTE on the underlying privileged helper.
CREATE FUNCTION private.live_hotel_delete_owner(p_tenant_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  -- Auth -> profile -> owner role -> live session -> hotel mutation. The helper
  -- rechecks row values after lock waits and holds SHARE locks to transaction end.
  v_actor := private.lock_live_role_actor('owner');
  RETURN EXISTS(SELECT 1 FROM public.users u
    WHERE u.id=v_actor AND u.tenant_id=p_tenant_id);
END;
$fn$;
REVOKE ALL ON FUNCTION private.live_hotel_delete_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.live_hotel_delete_owner(uuid) TO authenticated;

-- Narrow the existing owner/tenant policy for DELETE only; do not broaden its
-- allowed rows or change SELECT/INSERT/UPDATE and trusted service-role paths.
CREATE POLICY hotels_delete_live_owner ON public.hotels AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.live_hotel_delete_owner(tenant_id));
