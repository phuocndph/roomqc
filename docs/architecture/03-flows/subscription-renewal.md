# Flow: Subscription Renewal

## Tổng quan
Room-based pricing 1.000đ/phòng/ngày, tối thiểu 30 ngày. Discount theo thời hạn. Grace period + suspended state.

## Pricing
```
base_price       = 1000 VND/room/day
min_days         = 30
discount         = { 90d: 5%, 180d: 10%, 365d: 15% }
total            = registered_rooms × days × base_price × (1 - discount)
```

## State

```mermaid
stateDiagram-v2
    [*] --> trial: Đăng ký (14 ngày, max 10 phòng)
    trial --> active: Mua gói
    trial --> expired: Hết hạn trial
    active --> expiring_soon: ≤7 ngày
    expiring_soon --> active: Gia hạn
    expiring_soon --> grace: Đến hạn chưa thanh toán
    grace --> active: Gia hạn (≤7 ngày grace)
    grace --> suspended: Quá grace
    suspended --> active: Gia hạn + activate
    suspended --> [*]: 30 ngày → archive
```

Memory: `room-limits-and-payment-enforcement`, `renewal-warning-system-v1`, `suspended-access-restriction-v1`.

## Sequence: Mua thêm phòng

```mermaid
sequenceDiagram
    actor O as Owner
    participant FE
    participant DB
    participant SP as SePay
    participant WH as sepay-webhook

    O->>FE: Subscription page → +N phòng
    FE->>FE: compute price = N × remaining_days × base
    FE->>DB: insert invoice + payment_transaction (type=add_rooms, additional_rooms=N)
    FE->>O: Show QR
    O->>SP: Chuyển khoản
    SP->>WH: webhook
    WH->>DB: match + success
    WH->>DB: tenants.registered_rooms += N
    WH->>DB: subscription_end_date giữ nguyên
```

## Sequence: Gia hạn

```mermaid
sequenceDiagram
    actor O
    participant FE
    participant DB
    participant WH

    O->>FE: Chọn 90/180/365 ngày
    FE->>FE: total = rooms × days × 1000 × (1-discount)
    FE->>DB: invoice + tx (type=extend)
    O->>WH: chuyển khoản → webhook
    WH->>DB: match
    WH->>DB: subscription_end_date += days
    WH->>DB: status=active (nếu đang grace/suspended)
```

## Cron checks
- `check-subscription-status` daily → cập nhật `subscription_status`, gửi reminder
- Suspended sau 7 ngày grace → block access (route guard + RLS)

## Renewal reminders (Super Admin)
- Cron daily quét `subscription_end_date` ≤ 14 ngày
- Tạo `renewal_reminders` + email
- Track engagement

Memory: `reminder-automation-architecture-v1`.
