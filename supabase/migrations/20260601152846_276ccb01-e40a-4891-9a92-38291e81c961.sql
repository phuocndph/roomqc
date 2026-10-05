REVOKE EXECUTE ON FUNCTION public.update_hotel_floor_map_cell_size(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_hotel_floor_map_cell_size(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_hotel_floor_map_cell_size(uuid, jsonb) TO authenticated;