-- Fix trigger function that references removed assigned_to column
-- Update the trigger to use reported_by instead of assigned_to

CREATE OR REPLACE FUNCTION trigger_update_maintenance_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When a maintenance request is completed, increment stats for the reporter
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    IF NEW.reported_by IS NOT NULL THEN
      PERFORM increment_staff_stat(NEW.reported_by, NEW.hotel_id, 'maintenance', 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;