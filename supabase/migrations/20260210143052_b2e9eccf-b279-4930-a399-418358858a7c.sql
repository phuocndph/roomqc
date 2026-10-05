ALTER TABLE public.checkout_inspection_requests 
ADD COLUMN IF NOT EXISTS phase1_damage_data JSONB DEFAULT NULL;

COMMENT ON COLUMN public.checkout_inspection_requests.phase1_damage_data 
IS 'Temporary storage for Phase 1 damage/lost data before room_checks record is created';