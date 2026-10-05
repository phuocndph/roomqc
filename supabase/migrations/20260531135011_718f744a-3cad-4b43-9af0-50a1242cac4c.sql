REVOKE ALL ON FUNCTION public.sync_room_types_from_rooms(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_rate_plan(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.room_type_pricing_code(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_room_types_from_rooms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_rate_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_pricing_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_pricing_code(text) TO service_role;