DROP FUNCTION IF EXISTS public.apply_room_standards(uuid);
DROP FUNCTION IF EXISTS public.setup_room_initial(uuid, boolean);
DROP FUNCTION IF EXISTS public.undo_room_delivery_confirmation(uuid);
DROP FUNCTION IF EXISTS public.handover_batch(uuid, uuid);
DROP FUNCTION IF EXISTS public.settle_batch_compensation(uuid);