---
name: No-Show check-in handling v1
description: Quy trình + RPC xử lý khách đặt phòng quá giờ check-in chưa đến (overdue check-in / no-show)
type: feature
---

# No-Show Check-in Handling (v1.0.25)

## Định nghĩa "Quá giờ check-in"
- `status = 'confirmed'` AND `actual_check_in IS NULL`
- AND một trong:
  - `check_in_date < today (Asia/Ho_Chi_Minh)`
  - HOẶC `check_in_date = today` AND `now() > check_in_date + expected_check_in_time`

## View
- `public.v_overdue_checkins` (security_invoker) — trả mọi cột `room_bookings` + `hours_overdue` (numeric).
- Dùng `v_overdue_checkins` thay vì tính client-side mọi nơi để đồng nhất.

## RPC
- `mark_booking_no_show(_booking_id, _reason, _refund_deposit boolean)` — chỉ áp dụng `confirmed` đã overdue, validate qua view. Nếu `_refund_deposit=false` & có cọc → insert `booking_payments` với `metadata.type='no_show_fee'`. Cuối cùng gọi `transition_booking_status` → `no_show`.
- `reschedule_booking_checkin(_booking_id, _new_check_in_date, _new_check_out_date, _reason)` — chỉ áp dụng `confirmed`, validate conflict cùng phòng/daily, ghi note + log_state_transition action `reschedule_checkin`.

## Permission
- Cả 2 RPC yêu cầu `super_admin | tenant_owner | has_permission(manage_bookings)`.
- Cross-tenant chặn bằng `users.tenant_id` check.

## Error codes (đã map ở mapDbError)
- `NOT_OVERDUE`, `INVALID_BOOKING_STATUS_FOR_NO_SHOW`, `INVALID_BOOKING_STATUS_FOR_RESCHEDULE`, `BOOKING_CONFLICT`, `INVALID_DATE_RANGE`, `NO_PERMISSION_BOOKING_FLAG`

## UI
- `BookingsPage`: filter option `overdue_checkin` kèm số đếm; chip "Quá X.Yh" trên cột trạng thái (amber <24h, red ≥24h); DropdownMenu thao tác (Gọi khách / Dời ngày / No-Show) chỉ hiện khi booking đó nằm trong `overdueCheckinMap`.
- Dialogs: `MarkNoShowDialog`, `RescheduleCheckinDialog`.
- Hooks: `useOverdueCheckins` (realtime subscribe `room_bookings`), `useMarkBookingNoShow`, `useRescheduleBookingCheckin`.

## Còn lại / Phase 2 (chưa làm)
- Cron `auto-mark-no-show` (opt-in per-hotel via `hotels.settings.bookings.no_show.auto_mark_enabled`).
- Settings UI để bật/tắt auto-mark + grace minutes.
- Dashboard KPI widget "Khách quá giờ check-in".
- Mobile bookings filter (MobileBookingsPage chưa thêm option).
- Test suite `supabase/tests/overdue_checkin.sql`.
