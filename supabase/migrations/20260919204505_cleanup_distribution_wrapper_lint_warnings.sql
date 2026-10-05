-- Keep the authorization call explicit without introducing unused PL/pgSQL
-- variables that obscure lint output.
CREATE OR REPLACE FUNCTION public.confirm_room_delivery(
  p_room_order_id uuid,
  p_confirmed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_distribution_actor(p_room_order_id, p_confirmed_by);
  RETURN private.confirm_room_delivery_unchecked(
    p_room_order_id, p_confirmed_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_cannot_access(
  p_room_order_id uuid,
  p_exception_type text,
  p_exception_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  PERFORM public.assert_distribution_actor(p_room_order_id, v_actor);
  RETURN private.mark_cannot_access_unchecked(
    p_room_order_id, p_exception_type, p_exception_reason, v_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(
  p_distribution_order_room_id uuid,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_distribution_actor(
    p_distribution_order_room_id, p_performed_by
  );
  RETURN private.undo_room_delivery_confirmation_unchecked(
    p_distribution_order_room_id, p_performed_by
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
