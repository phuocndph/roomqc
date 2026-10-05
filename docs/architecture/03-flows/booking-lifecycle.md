# Flow: Booking Lifecycle

## Tổng quan
Full lifecycle: tạo booking → check-in → ở → checkout → invoice → payment match.

## Sequence

```mermaid
sequenceDiagram
    actor R as Reception
    participant FE as Booking UI
    participant RPC as Atomic RPCs
    participant DB
    participant HK as Housekeeping
    participant PAY as Payment

    R->>FE: Tạo booking (guest, room, dates, rate)
    FE->>DB: insert room_bookings (pending)
    FE->>DB: insert booking_guests
    Note over DB: Trigger: link guests by phone

    R->>FE: Check-in
    FE->>RPC: perform_checkin(booking_id)
    RPC->>DB: validate room status (available)
    RPC->>DB: bookings.status=checked_in
    RPC->>DB: rooms.status=occupied via transition_room_status
    RPC->>DB: audit_log

    Note over R,HK: Khách lưu trú
    R->>FE: Thêm services / minibar
    FE->>DB: booking_service_charges, minibar_consumption

    R->>FE: Checkout
    FE->>RPC: perform_checkout(booking_id, inspection)
    RPC->>DB: validate inspection completed
    RPC->>DB: compute total = room + services + minibar - discount
    RPC->>DB: create invoice
    RPC->>DB: bookings.status=checked_out
    RPC->>DB: rooms.status=cleaning via transition_room_status

    R->>PAY: Show QR / cash collect
    PAY-->>RPC: payment matched (SePay webhook)
    RPC->>DB: bookings.amount_paid += amount
    RPC->>DB: invoices.status=paid khi đủ
```

## Tài chính
```
total_amount   = room_total + service_charges + minibar - discount + vat (nếu exclusive)
amount_paid    = sum(payment_transactions success)
deposit_amount = paid trước check-in
unpaid_debt    = total_amount - (amount_paid + deposit_amount)
```
Memory: `checkout-and-payment-logic`.

## Group booking
- Master booking + sub bookings (1 room/sub)
- Payment đổ vào master → distribute theo `roomCostsByBooking`
- Checkout từng phòng độc lập, NHƯNG checkout group là **manual** sau khi paid (memory `group-checkout-manual-enforcement-v1`)

## Edge cases
- Early check-in surcharge (memory `check-in-surcharge-logic`)
- Walk-in deposit convention (memory `walk-in-deposit-logic-convention`)
- OTA bookings: payment đã collect bên OTA → flag `payment_source=ota` (memory `ota-integration-spec`)

## Validation
- Không cho check-in nếu room `cleaning | maintenance | dnd | oos` (memory `occupancy-validation`)
- Không cho overlap dates trên cùng room (memory `availability-logic`)
