-- perform_checkout — server-authoritative finance test suite
--
-- Mục đích: chứng minh server tự tính lại vat_amount / service_fee_amount /
-- total_amount từ vat_rate + service_fee_rate lưu trong room_bookings, KHÔNG
-- tin tham số tài chính do client gửi.
--
-- Có 2 lớp bảo vệ song song:
--   1. RPC perform_checkout: tính từ p_subtotal + vat_rate/sf_rate của booking.
--   2. Trigger BEFORE UPDATE `calculate_payment_status`: nếu NEW.subtotal=0
--      thì recompute từ room_price × nights + các phụ phí; sau đó luôn áp
--      vat/sf theo rate. Đây là "safety net" cho trường hợp p_subtotal=0.
--
-- Chạy trong SQL editor Lovable Cloud (psql). Mỗi block ROLLBACK độc lập.

-- ===========================================================
-- 1) Client gửi subtotal=0 → server KHÔNG ghi 0 vào DB.
--    Trigger recompute từ room_price × nights, rồi vat/sf theo rate.
--    Đây là phòng tuyến quan trọng nhất: client cố khai 0đ KHÔNG thành công.
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid; _hotel uuid; _room uuid; _booking uuid;
  _sub numeric; _vat numeric; _sf numeric; _total numeric;
BEGIN
  SELECT t.id, h.id INTO _tenant, _hotel
  FROM public.tenants t JOIN public.hotels h ON h.tenant_id = t.id LIMIT 1;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'Cần ít nhất 1 tenant+hotel'; END IF;

  INSERT INTO public.rooms (tenant_id, hotel_id, room_number, room_type, status, floor)
  VALUES (_tenant, _hotel, 'TEST-PC-1', 'standard', 'occupied_clean', 1)
  RETURNING id INTO _room;

  -- Booking 1 đêm × 500.000, vat=8%, sf=5%
  INSERT INTO public.room_bookings (
    tenant_id, hotel_id, room_id, guest_name,
    check_in_date, check_out_date, status,
    room_price, vat_rate, service_fee_rate,
    subtotal, vat_amount, service_fee_amount, total_amount,
    deposit_amount, amount_paid, payment_status, booking_type
  ) VALUES (
    _tenant, _hotel, _room, 'Test Guest 1',
    CURRENT_DATE - 1, CURRENT_DATE, 'checked_in',
    500000, 8, 5,
    500000, 40000, 25000, 565000,
    0, 0, 'pending', 'daily'
  ) RETURNING id INTO _booking;

  -- Client cố tình khai subtotal=0
  PERFORM public.perform_checkout(
    _booking, _room, 0, 0, 0, 0, NULL, '[]'::jsonb, NULL, NULL
  );

  SELECT subtotal, vat_amount, service_fee_amount, total_amount
    INTO _sub, _vat, _sf, _total
  FROM public.room_bookings WHERE id = _booking;

  -- Server PHẢI tự khôi phục giá trị thật, KHÔNG ghi 0
  IF _sub = 0 OR _total = 0 THEN
    RAISE EXCEPTION 'Lỗ hổng: subtotal=0 từ client được ghi vào DB (sub=%, total=%)',
      _sub, _total;
  END IF;

  -- Phải tính lại từ room_price × nights = 500.000, vat=40.000, sf=25.000, total=565.000
  IF _sub <> 500000 OR _vat <> 40000 OR _sf <> 25000 OR _total <> 565000 THEN
    RAISE EXCEPTION 'Server tính sai khi p_subtotal=0: (sub=%, vat=%, sf=%, total=%) — kỳ vọng (500000, 40000, 25000, 565000)',
      _sub, _vat, _sf, _total;
  END IF;

  RAISE NOTICE '✓ Test 1: client gửi subtotal=0 bị server từ chối, recompute đúng';
END $$;
ROLLBACK;

-- ===========================================================
-- 2) Client gửi p_subtotal=1.000.000, booking có vat=8%, sf=5%
--    → server áp đúng vat=80.000, sf=50.000, total=1.130.000
--    (RPC không còn nhận p_vat_amount/p_service_fee_amount/p_total_amount)
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid; _hotel uuid; _room uuid; _booking uuid;
  _sub numeric; _vat numeric; _sf numeric; _total numeric;
BEGIN
  SELECT t.id, h.id INTO _tenant, _hotel
  FROM public.tenants t JOIN public.hotels h ON h.tenant_id = t.id LIMIT 1;

  INSERT INTO public.rooms (tenant_id, hotel_id, room_number, room_type, status, floor)
  VALUES (_tenant, _hotel, 'TEST-PC-2', 'standard', 'occupied_clean', 1)
  RETURNING id INTO _room;

  INSERT INTO public.room_bookings (
    tenant_id, hotel_id, room_id, guest_name,
    check_in_date, check_out_date, status,
    room_price, vat_rate, service_fee_rate,
    subtotal, vat_amount, service_fee_amount, total_amount,
    deposit_amount, amount_paid, payment_status, booking_type
  ) VALUES (
    _tenant, _hotel, _room, 'Test Guest 2',
    CURRENT_DATE - 1, CURRENT_DATE, 'checked_in',
    1000000, 8, 5,
    -- giá trị "fake" client từng gửi: 0đ — sẽ bị bỏ qua
    1, 9999999, 9999999, 9999999,
    0, 0, 'pending', 'daily'
  ) RETURNING id INTO _booking;

  PERFORM public.perform_checkout(
    _booking, _room, 0, 0, 1000000, 0, NULL, '[]'::jsonb, NULL, NULL
  );

  SELECT subtotal, vat_amount, service_fee_amount, total_amount
    INTO _sub, _vat, _sf, _total
  FROM public.room_bookings WHERE id = _booking;

  IF _sub <> 1000000 THEN
    RAISE EXCEPTION 'Expected subtotal=1000000, got %', _sub;
  END IF;
  IF _vat <> 80000 THEN
    RAISE EXCEPTION 'Expected vat=80000 (8%% của 1M), got %', _vat;
  END IF;
  IF _sf <> 50000 THEN
    RAISE EXCEPTION 'Expected sf=50000 (5%% của 1M), got %', _sf;
  END IF;
  IF _total <> 1130000 THEN
    RAISE EXCEPTION 'Expected total=1130000, got %', _total;
  END IF;

  RAISE NOTICE '✓ Test 2: vat_rate/sf_rate từ booking được áp đúng (1M → 1.13M)';
END $$;
ROLLBACK;

-- ===========================================================
-- 3) vat_rate=0 và sf_rate=0 trong booking
--    → total = subtotal (không bị +VAT giả)
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid; _hotel uuid; _room uuid; _booking uuid;
  _vat numeric; _sf numeric; _total numeric;
BEGIN
  SELECT t.id, h.id INTO _tenant, _hotel
  FROM public.tenants t JOIN public.hotels h ON h.tenant_id = t.id LIMIT 1;

  INSERT INTO public.rooms (tenant_id, hotel_id, room_number, room_type, status, floor)
  VALUES (_tenant, _hotel, 'TEST-PC-3', 'standard', 'occupied_clean', 1)
  RETURNING id INTO _room;

  INSERT INTO public.room_bookings (
    tenant_id, hotel_id, room_id, guest_name,
    check_in_date, check_out_date, status,
    room_price, vat_rate, service_fee_rate,
    subtotal, vat_amount, service_fee_amount, total_amount,
    deposit_amount, amount_paid, payment_status, booking_type
  ) VALUES (
    _tenant, _hotel, _room, 'Test Guest 3',
    CURRENT_DATE - 1, CURRENT_DATE, 'checked_in',
    2000000, 0, 0,
    1, 0, 0, 0,
    0, 0, 'pending', 'daily'
  ) RETURNING id INTO _booking;

  PERFORM public.perform_checkout(
    _booking, _room, 0, 0, 2000000, 0, NULL, '[]'::jsonb, NULL, NULL
  );

  SELECT vat_amount, service_fee_amount, total_amount
    INTO _vat, _sf, _total FROM public.room_bookings WHERE id = _booking;

  IF _vat <> 0 OR _sf <> 0 OR _total <> 2000000 THEN
    RAISE EXCEPTION 'Expected (vat=0, sf=0, total=2000000), got (%, %, %)',
      _vat, _sf, _total;
  END IF;

  RAISE NOTICE '✓ Test 3: vat_rate=0 + sf_rate=0 → total = subtotal';
END $$;
ROLLBACK;

-- ===========================================================
-- 4) payment_status: amount_paid >= total → 'paid'
--    (Trigger calculate_payment_status có logic riêng nhưng cùng kết luận)
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid; _hotel uuid; _room uuid; _booking uuid;
  _status text; _total numeric;
BEGIN
  SELECT t.id, h.id INTO _tenant, _hotel
  FROM public.tenants t JOIN public.hotels h ON h.tenant_id = t.id LIMIT 1;

  INSERT INTO public.rooms (tenant_id, hotel_id, room_number, room_type, status, floor)
  VALUES (_tenant, _hotel, 'TEST-PC-4', 'standard', 'occupied_clean', 1)
  RETURNING id INTO _room;

  -- Đã thanh toán đủ 1.100.000 trước check-out
  INSERT INTO public.room_bookings (
    tenant_id, hotel_id, room_id, guest_name,
    check_in_date, check_out_date, status,
    room_price, vat_rate, service_fee_rate,
    subtotal, vat_amount, service_fee_amount, total_amount,
    deposit_amount, amount_paid, payment_status, booking_type
  ) VALUES (
    _tenant, _hotel, _room, 'Test Guest 4',
    CURRENT_DATE - 1, CURRENT_DATE, 'checked_in',
    1000000, 10, 0,
    1, 0, 0, 0,
    0, 1100000, 'paid', 'daily'
  ) RETURNING id INTO _booking;

  PERFORM public.perform_checkout(
    _booking, _room, 0, 0, 1000000, 0, NULL, '[]'::jsonb, NULL, NULL
  );

  SELECT payment_status, total_amount INTO _status, _total
  FROM public.room_bookings WHERE id = _booking;

  IF _total <> 1100000 THEN
    RAISE EXCEPTION 'Expected total=1.100.000, got %', _total;
  END IF;
  IF _status <> 'paid' THEN
    RAISE EXCEPTION 'Expected payment_status=paid (paid=1.1M >= total=1.1M), got %', _status;
  END IF;

  RAISE NOTICE '✓ Test 4: payment_status=paid khi amount_paid >= total tính lại';
END $$;
ROLLBACK;

-- ===========================================================
-- 5) RPC reject booking không ở trạng thái checked_in
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid; _hotel uuid; _room uuid; _booking uuid;
  _err_ok boolean := false;
BEGIN
  SELECT t.id, h.id INTO _tenant, _hotel
  FROM public.tenants t JOIN public.hotels h ON h.tenant_id = t.id LIMIT 1;

  INSERT INTO public.rooms (tenant_id, hotel_id, room_number, room_type, status, floor)
  VALUES (_tenant, _hotel, 'TEST-PC-5', 'standard', 'vacant_clean', 1)
  RETURNING id INTO _room;

  INSERT INTO public.room_bookings (
    tenant_id, hotel_id, room_id, guest_name,
    check_in_date, check_out_date, status,
    room_price, vat_rate, service_fee_rate,
    subtotal, vat_amount, service_fee_amount, total_amount,
    deposit_amount, amount_paid, payment_status, booking_type
  ) VALUES (
    _tenant, _hotel, _room, 'Test Guest 5',
    CURRENT_DATE - 1, CURRENT_DATE, 'confirmed',
    500000, 8, 5,
    1, 0, 0, 0,
    0, 0, 'pending', 'daily'
  ) RETURNING id INTO _booking;

  BEGIN
    PERFORM public.perform_checkout(
      _booking, _room, 0, 0, 500000, 0, NULL, '[]'::jsonb, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    _err_ok := true;
  END;

  IF NOT _err_ok THEN
    RAISE EXCEPTION 'RPC phải raise lỗi cho booking chưa ở trạng thái checked_in';
  END IF;

  RAISE NOTICE '✓ Test 5: RPC từ chối booking ngoài trạng thái checked_in';
END $$;
ROLLBACK;
