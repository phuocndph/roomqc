-- Fix calculate_payment_status trigger: DATE - DATE returns INTEGER, not INTERVAL
-- So we don't need EXTRACT(DAY FROM ...), just use the integer directly

CREATE OR REPLACE FUNCTION public.calculate_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate subtotal if not set
  IF NEW.subtotal IS NULL OR NEW.subtotal = 0 THEN
    NEW.subtotal := COALESCE(NEW.room_price, 0) * 
      GREATEST(1, (NEW.check_out_date - NEW.check_in_date))
      + COALESCE(NEW.early_checkin_charge, 0)
      + COALESCE(NEW.late_checkout_charge, 0)
      + COALESCE(NEW.service_charges, 0)
      + COALESCE(NEW.extra_charges, 0);
  END IF;
  
  -- Calculate VAT
  NEW.vat_amount := NEW.subtotal * COALESCE(NEW.vat_rate, 8) / 100;
  
  -- Calculate service fee  
  NEW.service_fee_amount := NEW.subtotal * COALESCE(NEW.service_fee_rate, 5) / 100;
  
  -- Calculate total amount
  NEW.total_amount := NEW.subtotal + COALESCE(NEW.vat_amount, 0) + COALESCE(NEW.service_fee_amount, 0);
  
  -- Calculate payment status based on amount_paid vs total_amount
  -- Note: deposit_amount is already included in amount_paid when booking is created
  IF COALESCE(NEW.amount_paid, 0) >= NEW.total_amount THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  ELSIF COALESCE(NEW.amount_paid, 0) > 0 THEN
    NEW.payment_status := 'partial';
  ELSE
    NEW.payment_status := 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;