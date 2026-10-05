
DROP FUNCTION IF EXISTS public.get_current_room_booking(uuid);

CREATE OR REPLACE FUNCTION public.get_current_room_booking(p_room_id UUID)
RETURNS TABLE (
  id UUID,
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  guest_count INTEGER,
  check_in_date DATE,
  check_out_date DATE,
  actual_check_in TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  status TEXT,
  notes TEXT,
  room_price NUMERIC,
  extra_charges NUMERIC,
  deposit_amount NUMERIC,
  amount_paid NUMERIC,
  early_checkin_charge NUMERIC,
  late_checkout_charge NUMERIC,
  service_charges NUMERIC,
  subtotal NUMERIC,
  vat_rate NUMERIC,
  vat_amount NUMERIC,
  service_fee_rate NUMERIC,
  service_fee_amount NUMERIC,
  total_amount NUMERIC,
  damage_charges NUMERIC,
  payment_status TEXT,
  paid_at TIMESTAMPTZ,
  booking_type TEXT,
  hourly_rate NUMERIC,
  monthly_rate NUMERIC,
  booking_hours INTEGER,
  booking_months INTEGER,
  booking_source TEXT,
  expected_check_in_time TEXT,
  expected_check_out_time TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    rb.id,
    rb.guest_name,
    rb.guest_phone,
    rb.guest_email,
    rb.guest_count,
    rb.check_in_date,
    rb.check_out_date,
    rb.actual_check_in,
    rb.actual_check_out,
    rb.status,
    rb.notes,
    rb.room_price,
    rb.extra_charges,
    rb.deposit_amount,
    rb.amount_paid,
    rb.early_checkin_charge,
    rb.late_checkout_charge,
    rb.service_charges,
    rb.subtotal,
    rb.vat_rate,
    rb.vat_amount,
    rb.service_fee_rate,
    rb.service_fee_amount,
    rb.total_amount,
    rb.damage_charges,
    rb.payment_status,
    rb.paid_at,
    rb.booking_type,
    rb.hourly_rate,
    rb.monthly_rate,
    rb.booking_hours,
    rb.booking_months,
    rb.booking_source,
    rb.expected_check_in_time,
    rb.expected_check_out_time
  FROM room_bookings rb
  WHERE rb.room_id = p_room_id
    AND rb.status IN ('confirmed', 'checked_in')
    AND rb.check_out_date >= CURRENT_DATE
  ORDER BY rb.check_in_date ASC
  LIMIT 1;
$$;
