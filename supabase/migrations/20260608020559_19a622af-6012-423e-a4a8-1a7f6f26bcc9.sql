
CREATE OR REPLACE FUNCTION public.create_booking_v2(
  p_bookings jsonb,
  p_guest jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_guest_id uuid;
  v_phone text;
  v_name text;
  v_existing_guest_id uuid;
  v_booking_ids uuid[] := ARRAY[]::uuid[];
  v_booking jsonb;
  v_inserted_id uuid;
  v_group_id uuid;
BEGIN
  IF p_bookings IS NULL OR jsonb_array_length(p_bookings) = 0 THEN
    RAISE EXCEPTION 'Danh sách đặt phòng trống' USING ERRCODE = 'P0001';
  END IF;

  -- Lấy tenant_id từ booking đầu tiên (tất cả booking phải cùng tenant)
  v_tenant_id := (p_bookings -> 0 ->> 'tenant_id')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu tenant_id' USING ERRCODE = 'P0001';
  END IF;

  -- Kiểm tra tất cả booking cùng tenant
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_bookings) b
    WHERE (b ->> 'tenant_id')::uuid IS DISTINCT FROM v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Các đặt phòng không cùng tenant' USING ERRCODE = 'P0001';
  END IF;

  -- === Bước 1: Upsert guest (nếu có) ===
  IF p_guest IS NOT NULL AND COALESCE(p_guest ->> 'full_name', '') <> '' THEN
    v_name := trim(p_guest ->> 'full_name');
    v_phone := NULLIF(trim(COALESCE(p_guest ->> 'phone', '')), '');

    IF v_phone IS NOT NULL THEN
      SELECT id INTO v_existing_guest_id
      FROM public.guests
      WHERE tenant_id = v_tenant_id AND phone = v_phone
      LIMIT 1;
    END IF;

    IF v_existing_guest_id IS NOT NULL THEN
      UPDATE public.guests
      SET
        full_name = v_name,
        email = NULLIF(p_guest ->> 'email', ''),
        id_type = NULLIF(p_guest ->> 'id_type', ''),
        id_number = NULLIF(p_guest ->> 'id_number', ''),
        nationality = NULLIF(p_guest ->> 'nationality', ''),
        gender = NULLIF(p_guest ->> 'gender', ''),
        date_of_birth = NULLIF(p_guest ->> 'date_of_birth', '')::date,
        address = NULLIF(p_guest ->> 'address', ''),
        id_image_url = NULLIF(p_guest ->> 'id_image_url', ''),
        updated_at = now()
      WHERE id = v_existing_guest_id;
      v_guest_id := v_existing_guest_id;
    ELSE
      INSERT INTO public.guests (
        tenant_id, full_name, phone, email, id_type, id_number,
        nationality, gender, date_of_birth, address, id_image_url, vip_level
      ) VALUES (
        v_tenant_id,
        v_name,
        v_phone,
        NULLIF(p_guest ->> 'email', ''),
        NULLIF(p_guest ->> 'id_type', ''),
        NULLIF(p_guest ->> 'id_number', ''),
        NULLIF(p_guest ->> 'nationality', ''),
        NULLIF(p_guest ->> 'gender', ''),
        NULLIF(p_guest ->> 'date_of_birth', '')::date,
        NULLIF(p_guest ->> 'address', ''),
        NULLIF(p_guest ->> 'id_image_url', ''),
        COALESCE(NULLIF(p_guest ->> 'vip_level', ''), 'normal')
      )
      RETURNING id INTO v_guest_id;
    END IF;
  END IF;

  -- === Bước 2: Insert bookings ===
  FOR v_booking IN SELECT * FROM jsonb_array_elements(p_bookings)
  LOOP
    INSERT INTO public.room_bookings (
      tenant_id, hotel_id, room_id, guest_id,
      guest_name, guest_phone, guest_email, guest_count,
      check_in_date, check_out_date,
      expected_check_in_time, expected_check_out_time,
      status, notes,
      room_price, deposit_amount, amount_paid, payment_status,
      booking_source, booking_reference,
      subtotal, vat_rate, vat_amount,
      service_fee_rate, service_fee_amount, total_amount,
      booking_group_id,
      ota_payment_type, ota_paid_amount, ota_commission_rate, ota_commission_amount, net_revenue,
      booking_type, hourly_rate, monthly_rate, booking_hours, booking_months,
      hourly_start_time, hourly_end_time,
      guest_id_type, guest_id_number, guest_nationality, guest_date_of_birth,
      guest_gender, guest_address, guest_id_image_url,
      price_breakdown
    ) VALUES (
      (v_booking ->> 'tenant_id')::uuid,
      (v_booking ->> 'hotel_id')::uuid,
      (v_booking ->> 'room_id')::uuid,
      v_guest_id,
      v_booking ->> 'guest_name',
      v_booking ->> 'guest_phone',
      v_booking ->> 'guest_email',
      COALESCE((v_booking ->> 'guest_count')::int, 1),
      (v_booking ->> 'check_in_date')::date,
      (v_booking ->> 'check_out_date')::date,
      v_booking ->> 'expected_check_in_time',
      v_booking ->> 'expected_check_out_time',
      COALESCE(v_booking ->> 'status', 'confirmed'),
      v_booking ->> 'notes',
      COALESCE((v_booking ->> 'room_price')::numeric, 0),
      COALESCE((v_booking ->> 'deposit_amount')::numeric, 0),
      COALESCE((v_booking ->> 'amount_paid')::numeric, 0),
      COALESCE(v_booking ->> 'payment_status', 'pending'),
      v_booking ->> 'booking_source',
      v_booking ->> 'booking_reference',
      COALESCE((v_booking ->> 'subtotal')::numeric, 0),
      COALESCE((v_booking ->> 'vat_rate')::numeric, 0),
      COALESCE((v_booking ->> 'vat_amount')::numeric, 0),
      COALESCE((v_booking ->> 'service_fee_rate')::numeric, 0),
      COALESCE((v_booking ->> 'service_fee_amount')::numeric, 0),
      COALESCE((v_booking ->> 'total_amount')::numeric, 0),
      NULLIF(v_booking ->> 'booking_group_id', '')::uuid,
      NULLIF(v_booking ->> 'ota_payment_type', ''),
      COALESCE((v_booking ->> 'ota_paid_amount')::numeric, 0),
      NULLIF(v_booking ->> 'ota_commission_rate', '')::numeric,
      COALESCE((v_booking ->> 'ota_commission_amount')::numeric, 0),
      COALESCE((v_booking ->> 'net_revenue')::numeric, 0),
      COALESCE(v_booking ->> 'booking_type', 'daily'),
      NULLIF(v_booking ->> 'hourly_rate', '')::numeric,
      NULLIF(v_booking ->> 'monthly_rate', '')::numeric,
      NULLIF(v_booking ->> 'booking_hours', '')::int,
      NULLIF(v_booking ->> 'booking_months', '')::int,
      NULLIF(v_booking ->> 'hourly_start_time', '')::timestamptz,
      NULLIF(v_booking ->> 'hourly_end_time', '')::timestamptz,
      NULLIF(v_booking ->> 'guest_id_type', ''),
      NULLIF(v_booking ->> 'guest_id_number', ''),
      NULLIF(v_booking ->> 'guest_nationality', ''),
      NULLIF(v_booking ->> 'guest_date_of_birth', '')::date,
      NULLIF(v_booking ->> 'guest_gender', ''),
      NULLIF(v_booking ->> 'guest_address', ''),
      NULLIF(v_booking ->> 'guest_id_image_url', ''),
      v_booking -> 'price_breakdown'
    )
    RETURNING id INTO v_inserted_id;

    v_booking_ids := array_append(v_booking_ids, v_inserted_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'guest_id', v_guest_id,
    'booking_ids', to_jsonb(v_booking_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_v2(jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_v2(jsonb, jsonb) FROM anon;
