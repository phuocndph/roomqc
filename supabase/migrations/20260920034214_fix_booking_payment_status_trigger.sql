-- Keep deposit_amount and amount_paid consistent across booking payment flows.
-- The previous trigger ignored deposits and recalculated a manually supplied
-- total_amount down to zero whenever only amount_paid changed.

CREATE OR REPLACE FUNCTION public.calculate_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_derived_subtotal numeric;
  v_total_paid numeric;
BEGIN
  IF NEW.subtotal IS NULL OR NEW.subtotal = 0 THEN
    v_derived_subtotal := COALESCE(NEW.room_price, 0) *
      GREATEST(1, (NEW.check_out_date - NEW.check_in_date))
      + COALESCE(NEW.early_checkin_charge, 0)
      + COALESCE(NEW.late_checkout_charge, 0)
      + COALESCE(NEW.service_charges, 0)
      + COALESCE(NEW.extra_charges, 0);

    -- Preserve an existing/manual total when there is no pricing information
    -- from which a safe replacement can be calculated.
    IF v_derived_subtotal > 0 OR COALESCE(NEW.total_amount, 0) = 0 THEN
      NEW.subtotal := v_derived_subtotal;
    END IF;
  END IF;

  IF COALESCE(NEW.subtotal, 0) > 0 THEN
    NEW.vat_amount := NEW.subtotal * COALESCE(NEW.vat_rate, 8) / 100;
    NEW.service_fee_amount := NEW.subtotal * COALESCE(NEW.service_fee_rate, 5) / 100;
    NEW.total_amount := NEW.subtotal
      + COALESCE(NEW.vat_amount, 0)
      + COALESCE(NEW.service_fee_amount, 0);
  ELSIF NEW.total_amount IS NULL THEN
    NEW.total_amount := 0;
  END IF;

  v_total_paid := COALESCE(NEW.amount_paid, 0) + COALESCE(NEW.deposit_amount, 0);
  IF COALESCE(NEW.total_amount, 0) > 0 AND v_total_paid >= NEW.total_amount THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  ELSIF v_total_paid > 0 THEN
    NEW.payment_status := 'partial';
  ELSE
    NEW.payment_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;
