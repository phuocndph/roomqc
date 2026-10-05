-- Validate the request scope before payload shape.  This keeps malformed or
-- empty payloads from becoming a side channel for cross-tenant/actor probing.
-- The existing implementation is moved to the private schema and remains
-- available only to trusted server-side callers through the wrapper below.

ALTER FUNCTION public.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) SET SCHEMA private;

CREATE OR REPLACE FUNCTION public.create_distribution_order(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_created_by uuid,
  p_assigned_to uuid,
  p_rooms jsonb,
  p_notes text DEFAULT NULL,
  p_auto_release boolean DEFAULT false,
  p_supplement_request_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
BEGIN
  -- Scope checks intentionally precede all user-controlled JSON parsing.
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  v_actor := public.assert_rpc_actor(
    p_tenant_id, p_hotel_id, p_created_by, false
  );

  RETURN private.create_distribution_order(
    p_tenant_id,
    p_hotel_id,
    v_actor,
    p_assigned_to,
    p_rooms,
    p_notes,
    p_auto_release,
    p_supplement_request_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION private.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) TO service_role;

REVOKE ALL ON FUNCTION public.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
