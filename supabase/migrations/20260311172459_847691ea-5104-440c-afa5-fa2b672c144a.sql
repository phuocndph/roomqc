
-- 1. Trigger to update guest stats when booking status changes to checked_out
CREATE OR REPLACE FUNCTION public.update_guest_stats_on_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes to checked_out and guest_id is set
  IF NEW.status = 'checked_out' AND OLD.status != 'checked_out' AND NEW.guest_id IS NOT NULL THEN
    UPDATE public.guests
    SET
      total_stays = total_stays + 1,
      total_spent = total_spent + COALESCE(NEW.total_amount, 0),
      last_stay_date = NEW.check_out_date,
      updated_at = now()
    WHERE id = NEW.guest_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_guest_stats_on_checkout
  AFTER UPDATE ON public.room_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_guest_stats_on_checkout();

-- 2. Function to auto-generate lost_found item_code
CREATE OR REPLACE FUNCTION public.generate_lost_found_item_code(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date text;
  v_seq int;
  v_code text;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.lost_found_items
  WHERE tenant_id = p_tenant_id
    AND item_code LIKE 'LF-' || v_date || '-%';
  v_code := 'LF-' || v_date || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_code;
END;
$$;
