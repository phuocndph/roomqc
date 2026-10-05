-- Fix duplicate check trigger to allow same user to check again after 5 minutes
-- Remove the checked_by condition to only prevent duplicate checks by room and type

CREATE OR REPLACE FUNCTION public.check_duplicate_room_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if there's already a check for this room and type within 5 minutes
  IF EXISTS (
    SELECT 1 
    FROM public.room_checks
    WHERE room_id = NEW.room_id
      AND check_type = NEW.check_type
      AND checked_at > NOW() - INTERVAL '5 minutes'
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate check detected. Please wait 5 minutes before checking this room again with the same check type.'
      USING ERRCODE = 'unique_violation';
  END IF;
  
  RETURN NEW;
END;
$$;