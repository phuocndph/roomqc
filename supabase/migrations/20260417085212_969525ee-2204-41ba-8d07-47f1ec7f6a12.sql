-- Đợt 3: Performance indexes (final, verified columns)

-- room_bookings
CREATE INDEX IF NOT EXISTS idx_room_bookings_tenant_hotel_status_checkin
  ON public.room_bookings (tenant_id, hotel_id, status, check_in_date DESC);
CREATE INDEX IF NOT EXISTS idx_room_bookings_room_status
  ON public.room_bookings (room_id, status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_tenant_created
  ON public.room_bookings (tenant_id, created_at DESC);

-- room_checks
CREATE INDEX IF NOT EXISTS idx_room_checks_room_checked_at
  ON public.room_checks (room_id, checked_at DESC);

-- room_check_sessions (no status col → index by room + started_at)
CREATE INDEX IF NOT EXISTS idx_room_check_sessions_room_started
  ON public.room_check_sessions (room_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_check_sessions_tenant_started
  ON public.room_check_sessions (tenant_id, started_at DESC);

-- housekeeping_tasks
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_assigned_status
  ON public.housekeeping_tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_tenant_hotel_status
  ON public.housekeeping_tasks (tenant_id, hotel_id, status);

-- maintenance_requests
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_tenant_hotel_status_reported
  ON public.maintenance_requests (tenant_id, hotel_id, status, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_room
  ON public.maintenance_requests (room_id, reported_at DESC)
  WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_item
  ON public.maintenance_requests (item_id, reported_at DESC)
  WHERE item_id IS NOT NULL;

-- booking_payments
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_status
  ON public.booking_payments (booking_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_booking_payments_tenant_paid_at
  ON public.booking_payments (tenant_id, paid_at DESC);

-- supplement_requests
CREATE INDEX IF NOT EXISTS idx_supplement_requests_tenant_hotel_status_created
  ON public.supplement_requests (tenant_id, hotel_id, status, created_at DESC);

-- stock_adjustments
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_tenant_hotel_created
  ON public.stock_adjustments (tenant_id, hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_status
  ON public.stock_adjustments (tenant_id, status);

-- laundry_batches
CREATE INDEX IF NOT EXISTS idx_laundry_batches_tenant_hotel_status
  ON public.laundry_batches (tenant_id, hotel_id, status, created_at DESC);

-- in_app_notifications
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_read_created
  ON public.in_app_notifications (user_id, is_read, created_at DESC);

-- shift_history
CREATE INDEX IF NOT EXISTS idx_shift_history_tenant_user_start
  ON public.shift_history (tenant_id, user_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_history_tenant_start
  ON public.shift_history (tenant_id, start_at DESC);

-- staff_status
CREATE INDEX IF NOT EXISTS idx_staff_status_tenant_last_seen
  ON public.staff_status (tenant_id, last_seen_at DESC);

-- booking_consumables
CREATE INDEX IF NOT EXISTS idx_booking_consumables_booking
  ON public.booking_consumables (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_consumables_tenant_room
  ON public.booking_consumables (tenant_id, room_id);

-- chargeable_consumptions
CREATE INDEX IF NOT EXISTS idx_chargeable_consumptions_booking_billed
  ON public.chargeable_consumptions (booking_id, is_billed);

-- activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created
  ON public.activity_logs (tenant_id, created_at DESC);

-- Update planner stats
ANALYZE public.room_bookings;
ANALYZE public.room_checks;
ANALYZE public.room_check_sessions;
ANALYZE public.housekeeping_tasks;
ANALYZE public.maintenance_requests;
ANALYZE public.booking_payments;
ANALYZE public.supplement_requests;
ANALYZE public.stock_adjustments;
ANALYZE public.laundry_batches;
ANALYZE public.in_app_notifications;
ANALYZE public.shift_history;
ANALYZE public.staff_status;