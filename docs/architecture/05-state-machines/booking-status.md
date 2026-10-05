# State Machine: Booking Status

## Trạng thái
- `pending` — tạo nhưng chưa confirm
- `confirmed` — đã confirm/đặt cọc
- `checked_in` — đã nhận phòng
- `checked_out` — đã trả phòng
- `cancelled` — hủy
- `no_show` — không đến

## Diagram

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> confirmed: Đặt cọc / xác nhận
    pending --> cancelled
    confirmed --> checked_in: perform_checkin RPC
    confirmed --> cancelled
    confirmed --> no_show: Quá giờ check-in
    checked_in --> checked_out: perform_checkout RPC
    checked_out --> [*]
    cancelled --> [*]
    no_show --> [*]
```

## RPC: `transition_booking_status`
- Validate transition + booking constraints
- Insert `booking_status_audit`
- Trigger side effects (release room, refund deposit…)

## Constraint
- Không thể transition trực tiếp `checked_in → cancelled` → phải qua checkout với refund flag
- `no_show` chỉ set qua cron, không manual
