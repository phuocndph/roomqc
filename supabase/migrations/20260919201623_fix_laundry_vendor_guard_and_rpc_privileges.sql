CREATE OR REPLACE FUNCTION public.create_laundry_batch_with_items(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_vendor_id uuid,
  p_delivery_date date,
  p_expected_return_date date,
  p_delivery_staff_id uuid,
  p_receiver_name text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_rpc_hotel(p_tenant_id, p_hotel_id);
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, auth.uid(), false);
  IF p_delivery_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_delivery_staff_id AND u.tenant_id = p_tenant_id
      AND (u.hotel_id = p_hotel_id OR EXISTS (
        SELECT 1 FROM public.user_hotels uh
        WHERE uh.user_id = u.id AND uh.hotel_id = p_hotel_id
      )) AND u.status IS DISTINCT FROM 'inactive'
  ) THEN
    RAISE EXCEPTION 'DELIVERY_STAFF_MISMATCH' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_rpc_items(p_tenant_id, p_hotel_id, p_items);
  IF NOT EXISTS (
    SELECT 1 FROM public.laundry_vendors v
    WHERE v.id = p_vendor_id AND v.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'VENDOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_laundry_batch_with_items_unchecked(
    p_tenant_id, p_hotel_id, p_vendor_id, p_delivery_date,
    p_expected_return_date, p_delivery_staff_id, p_receiver_name,
    p_notes, p_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_distribution_order(
  uuid, uuid, uuid, uuid, jsonb, text, boolean, uuid[]
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
