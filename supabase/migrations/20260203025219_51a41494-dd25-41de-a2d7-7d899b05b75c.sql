-- Fix: Update log_shift_history function to get hotel_id from users table
-- instead of using current_location which is TEXT type

CREATE OR REPLACE FUNCTION public.log_shift_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id UUID;
BEGIN
  -- Only log when shift_end_at is updated and represents a valid completed shift
  IF NEW.shift_end_at IS NOT NULL 
     AND OLD.shift_end_at IS DISTINCT FROM NEW.shift_end_at
     AND NEW.shift_start_at IS NOT NULL
     AND NEW.shift_end_at > NEW.shift_start_at
  THEN
    -- Get hotel_id from users table
    SELECT hotel_id INTO v_hotel_id 
    FROM public.users 
    WHERE id = NEW.user_id;

    INSERT INTO public.shift_history (
      tenant_id, user_id, hotel_id, start_at, end_at, notes
    ) VALUES (
      NEW.tenant_id,
      NEW.user_id,
      v_hotel_id,
      NEW.shift_start_at,
      NEW.shift_end_at,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;