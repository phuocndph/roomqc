CREATE OR REPLACE FUNCTION public.perform_checkout(p_booking_id uuid, p_room_id uuid, p_late_checkout_charge numeric DEFAULT 0, p_service_charges numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_damage_charges numeric DEFAULT 0, p_damage_notes text DEFAULT NULL::text, p_damage_items jsonb DEFAULT '[]'::jsonb, p_new_amount_paid numeric DEFAULT NULL::numeric, p_check_out_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
  v_deposit_amount NUMERIC;
  v_amount_paid NUMERIC;
  v_payment_status TEXT;
  v_room_status TEXT;
  v_room_tenant UUID;
  v_room_hotel UUID;
  v_vat_rate NUMERIC;
  v_service_fee_rate NUMERIC;
  v_vat_amount NUMERIC;
  v_service_fee_amount NUMERIC;
  v_total_amount NUMERIC;
  v_subtotal NUMERIC;
  v_vat_base NUMERIC;
BEGIN
  SELECT deposit_amount, amount_paid,
         COALESCE(vat_rate, 8), COALESCE(service_fee_rate, 5)
    INTO v_deposit_amount, v_amount_paid, v_vat_rate, v_service_fee_rate
  FROM public.room_bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đặt phòng' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_amount_paid IS NOT NULL THEN
    v_amount_paid := p_new_amount_paid;
  END IF;

  v_subtotal := COALESCE(p_subtotal, 0);
  -- p_subtotal includes damage; exclude it for VAT base (damage không chịu thuế)
  v_vat_base := v_subtotal - COALESCE(p_damage_charges, 0);
  v_vat_amount := ROUND(v_vat_base * v_vat_rate / 100);
  v_service_fee_amount := ROUND(v_vat_base * v_service_fee_rate / 100);
  v_total_amount := v_subtotal + v_vat_amount + v_service_fee_amount;

  IF (COALESCE(v_deposit_amount,0) + COALESCE(v_amount_paid,0)) >= v_total_amount THEN
    v_payment_status := 'paid';
  ELSIF (COALESCE(v_deposit_amount,0) + COALESCE(v_amount_paid,0)) > 0 THEN
    v_payment_status := 'partial';
  ELSE
    v_payment_status := 'pending';
  END IF;

  UPDATE public.room_bookings
     SET status = 'checked_out',
         actual_check_out = v_now,
         check_out_date = COALESCE(p_check_out_date, check_out_date),
         late_checkout_charge = p_late_checkout_charge,
         service_charges = p_service_charges,
         subtotal = v_subtotal,
         vat_amount = v_vat_amount,
         service_fee_amount = v_service_fee_amount,
         total_amount = v_total_amount,
         payment_status = v_payment_status,
         damage_charges = COALESCE(p_damage_charges, 0),
         damage_notes = p_damage_notes,
         damage_items = COALESCE(p_damage_items, '[]'::jsonb),
         amount_paid = CASE WHEN p_new_amount_paid IS NOT NULL THEN p_new_amount_paid ELSE amount_paid END,
         paid_at = CASE WHEN p_new_amount_paid IS NOT NULL THEN v_now ELSE paid_at END,
         updated_at = v_now
   WHERE id = p_booking_id
     AND status = 'checked_in';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Đặt phòng không ở trạng thái đã nhận phòng' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, tenant_id, hotel_id
    INTO v_room_status, v_room_tenant, v_room_hotel
  FROM public.rooms WHERE id = p_room_id;

  UPDATE public.rooms
     SET status = 'vacant_dirty',
         updated_at = v_now
   WHERE id = p_room_id;

  INSERT INTO public.audit_log (
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, old_data, new_data, context
  ) VALUES (
    v_room_tenant, v_room_hotel, 'rooms', p_room_id, 'state_change',
    auth.uid(),
    jsonb_build_object('status', v_room_status),
    jsonb_build_object('status', 'vacant_dirty'),
    jsonb_build_object('reason', 'perform_checkout', 'booking_id', p_booking_id)
  );

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payment_status', v_payment_status,
    'subtotal', v_subtotal,
    'vat_base', v_vat_base,
    'vat_amount', v_vat_amount,
    'service_fee_amount', v_service_fee_amount,
    'total_amount', v_total_amount,
    'damage_charges', COALESCE(p_damage_charges, 0)
  );
  RETURN v_result;
END;
$function$;