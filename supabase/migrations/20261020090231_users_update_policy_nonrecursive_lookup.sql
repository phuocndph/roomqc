-- WITH CHECK must compare protected fields with the stored target row without
-- recursively expanding users RLS. This private boolean-only authorization
-- lookup deliberately reads as definer; it returns no profile/secret data and
-- binds authority to auth.uid(), never an actor supplied by a browser.
CREATE FUNCTION private.user_update_row_allowed(
  p_id uuid,p_tenant_id uuid,p_level text,p_role text,p_super boolean,p_primary boolean
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_super_admin(auth.uid()) OR EXISTS(
      SELECT 1 FROM public.users stored WHERE stored.id=p_id
        AND p_super=false
        AND p_tenant_id=stored.tenant_id AND p_level=stored.user_level_code
        AND COALESCE(p_role,'')=COALESCE(stored.role::text,'')
        AND COALESCE(p_primary,false)=COALESCE(stored.is_primary_owner,false)
        AND (stored.id=auth.uid() OR (stored.tenant_id=public.get_current_user_tenant_id()
          AND public.can_manage_user(auth.uid(),stored.id)))
    )
  );
$fn$;
REVOKE ALL ON FUNCTION private.user_update_row_allowed(uuid,uuid,text,text,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.user_update_row_allowed(uuid,uuid,text,text,boolean,boolean) TO authenticated;

ALTER POLICY users_update_self_or_managed ON public.users
  WITH CHECK (private.user_update_row_allowed(id,tenant_id,user_level_code,role::text,is_super_admin,is_primary_owner));
-- Existing USING scope, protected-field trigger, column grants and other
-- policies remain unchanged. No table-wide RLS bypass is granted to clients.
