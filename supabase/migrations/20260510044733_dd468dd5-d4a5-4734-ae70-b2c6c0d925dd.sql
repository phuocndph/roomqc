-- ============================================================================
-- F-FSM-DEFENSE-01: Revoke column-level UPDATE on `status` for state-machine
-- tables. Force all client writes through transition_* RPCs (SECURITY DEFINER).
-- ============================================================================

-- ---- ROOMS ------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.rooms FROM authenticated, anon;
GRANT UPDATE (
  id, tenant_id, hotel_id, room_number, floor, room_type, area_sqm, bed_type,
  max_guests, has_window, has_balcony, view_type, smoking_allowed, base_price,
  amenities, notes, created_at, updated_at, hourly_price, monthly_price,
  min_hours, max_hours, dnd_until, dnd_reason, oos_until, oos_reason,
  last_deep_clean_at, last_status_changed_at, last_status_changed_by,
  legacy_status
) ON public.rooms TO authenticated;

-- ---- ROOM_BOOKINGS ----------------------------------------------------------
REVOKE UPDATE ON TABLE public.room_bookings FROM authenticated, anon;
GRANT UPDATE (
  id, tenant_id, hotel_id, room_id, guest_name, guest_phone, guest_email,
  guest_count, check_in_date, check_out_date, actual_check_in, actual_check_out,
  notes, booking_source, booking_reference, created_by, created_at, updated_at,
  room_price, extra_charges, total_amount, payment_status, paid_at,
  expected_check_in_time, expected_check_out_time, amount_paid, deposit_amount,
  early_checkin_charge, late_checkout_charge, service_charges, vat_rate,
  vat_amount, service_fee_rate, service_fee_amount, subtotal, booking_group_id,
  ota_payment_type, ota_paid_amount, ota_commission_rate, ota_commission_amount,
  net_revenue, damage_charges, damage_notes, damage_items, booking_type,
  hourly_rate, monthly_rate, booking_hours, booking_months, hourly_start_time,
  hourly_end_time, guest_id_type, guest_id_number, guest_nationality,
  guest_date_of_birth, guest_gender, guest_address, guest_id_image_url,
  guest_id, sleep_out_at, sleep_out_note, skipper_marked_at, skipper_marked_by,
  skipper_note, skipper_amount_loss, sleep_out_reason, skipper_at,
  skipper_reason, skipper_amount_owed
) ON public.room_bookings TO authenticated;

-- ---- HOUSEKEEPING_TASKS -----------------------------------------------------
REVOKE UPDATE ON TABLE public.housekeeping_tasks FROM authenticated, anon;
GRANT UPDATE (
  id, tenant_id, hotel_id, room_id, booking_id, task_type, title, description,
  priority, assigned_to, requested_by, started_at, completed_at, cancelled_at,
  due_at, room_check_id, notes, created_at, updated_at,
  distribution_order_room_id, checkout_inspection_id, qc_required, qc_status,
  rework_count, awaiting_review_at, qc_due_at, approved_at, approved_by,
  rejection_reason, rejected_at, rejected_by
) ON public.housekeeping_tasks TO authenticated;

-- ---- VERIFICATION -----------------------------------------------------------
-- Đảm bảo `authenticated` KHÔNG còn quyền UPDATE cột `status` ở 3 bảng.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE grantee = 'authenticated'
    AND privilege_type = 'UPDATE'
    AND table_schema = 'public'
    AND table_name IN ('rooms', 'room_bookings', 'housekeeping_tasks')
    AND column_name = 'status';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'F-FSM-DEFENSE-01 verification failed: authenticated vẫn còn UPDATE(status) ở % bảng.',
      v_count;
  END IF;
END $$;

COMMENT ON COLUMN public.rooms.status IS
  'State machine v2 — chỉ cập nhật qua RPC transition_room_status (SECURITY DEFINER). Direct UPDATE bị revoke (F-FSM-DEFENSE-01).';
COMMENT ON COLUMN public.room_bookings.status IS
  'State machine v2 — chỉ cập nhật qua RPC transition_booking_status (SECURITY DEFINER). Direct UPDATE bị revoke (F-FSM-DEFENSE-01).';
COMMENT ON COLUMN public.housekeeping_tasks.status IS
  'State machine v2 — chỉ cập nhật qua RPC transition_task_status (SECURITY DEFINER). Direct UPDATE bị revoke (F-FSM-DEFENSE-01).';