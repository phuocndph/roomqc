-- Intersect existing action policies; do not grant a new action or rewrite the
-- shared legacy user_has_hotel_access helper. Platform-role access remains
-- governed by each table's existing permissive policies.
CREATE FUNCTION private.business_hotel_scope(p_tenant_id uuid, p_hotel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'super_admin'::public.app_role
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.tenant_id = p_tenant_id
      AND EXISTS (
        SELECT 1 FROM public.hotels h
        WHERE h.id = p_hotel_id AND h.tenant_id = p_tenant_id
          AND (
            EXISTS (SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = u.id AND ur.role = 'owner'::public.app_role)
            OR EXISTS (SELECT 1 FROM public.user_hotels uh
              WHERE uh.user_id = u.id AND uh.hotel_id = h.id)
          )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.business_hotel_scope(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.business_hotel_scope(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION private.business_hotel_scope(uuid,uuid) IS
  'Invoker-only scope intersection for hotel-bound rows; existing policies retain action authority. No session/revocation fencing guarantee.';

DO $migration$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['rooms','items','inventory_transactions','laundry_batches','maintenance_requests']
  LOOP
    -- This migration is deliberately NOT a policy for nullable tenant-shared
    -- catalogs. Stop rather than silently change a different schema contract.
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = pg_catalog.to_regclass('public.' || v_table)
        AND a.attname = 'hotel_id' AND a.attnotnull AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'Hotel-bound scope requires NOT NULL public.%.hotel_id', v_table;
    END IF;
    EXECUTE pg_catalog.format(
      'CREATE POLICY business_hotel_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.business_hotel_scope(tenant_id,hotel_id)) WITH CHECK (private.business_hotel_scope(tenant_id,hotel_id))',
      v_table);
  END LOOP;
END;
$migration$;

