# Flow: Group Checkout

## Tổng quan
Checkout group booking sau khi payment đã đủ. **Manual enforcement** — không auto-checkout khi paid.

## Sequence

```mermaid
sequenceDiagram
    actor R as Reception
    participant FE as Group Checkout UI
    participant RPC as perform_group_checkout
    participant DB
    participant INSP as Inspection prerequisite

    R->>FE: Mở group booking
    FE->>DB: load master + sub bookings + payments
    FE->>FE: compute distribution roomCostsByBooking
    FE->>R: hiển thị tổng + sub breakdown

    R->>FE: Inspection từng phòng
    FE->>DB: insert checkout_inspections (pass/issue)
    Note over INSP: Tất cả sub phải có inspection PASS

    R->>FE: Collect payment (QR/cash)
    FE->>RPC: prepare_group_checkout_amounts(checkout_items)
    RPC->>DB: khóa bookings + lưu quote authoritative (atomic)
    FE->>DB: create parent booking_payment (pending)
    FE->>DB: settle_booking_payment
    DB->>DB: distribute amount_paid cho cả nhóm (atomic)

    R->>FE: Tap "Hoàn tất checkout group"
    FE->>RPC: perform_group_checkout(checkout_items)
    RPC->>RPC: validate JSON/UUID/amount + tenant actor
    RPC->>DB: gọi perform_checkout theo thứ tự booking_id
    Note over RPC,DB: Một phòng lỗi → rollback toàn bộ nhóm
    RPC-->>FE: success
```

## Distribution payment

- `prepare_group_checkout_amounts` lưu tổng thực tế của từng phòng trước khi
  tạo payment; VAT/service fee không tính trên damage compensation.
- `create_booking_payment_pending` kiểm tra tổng dư nợ và scope
  tenant/hotel/group trước khi tạo parent row.
- `settle_booking_payment` khóa mọi booking theo thứ tự ổn định, áp tiền cho
  phòng đã checkout trước rồi theo số dư giảm dần. Retry là idempotent và phần
  vượt tolerance được giữ trong metadata để đối soát, không over-credit.

## Validation

- Payload tối đa 100 booking, không trùng `booking_id`; UUID, numeric amount,
  checkout date và damage JSON phải hợp lệ.
- Booking phải `checked_in`, đúng room/tenant/hotel và actor phải có quyền.
- UI chỉ cho chọn các phòng có inspection `completed` hoặc `not_requested`;
  luồng vẫn cho phép checkout còn nợ khi nhân viên xác nhận theo nghiệp vụ.
- `perform_checkout` là nguồn sự thật cho tenant/room/status validation và
  room/booking transition; wrapper group bổ sung transaction atomic.

## Memory
`unified-group-checkout-spec`, `group-checkout-manual-enforcement-v1`, `group-payment-realtime-v1`.
