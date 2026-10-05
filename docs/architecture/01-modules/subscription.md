# Module: Subscription

**Phụ thuộc**: Tenants · Payment · Notifications · Super Admin.

## Mô hình giá (Room-based)

- Giá cơ bản: **1.000đ/phòng/ngày**.
- Tối thiểu: 30 ngày.
- Discount theo thời hạn: 3 tháng (5%) · 6 tháng (10%) · 1 năm (15%).

## Bảng

```text
tenants                     # registered_rooms, subscription_end_date, subscription_status, is_read_only
subscription_plans          # config gói
plan_price_history          # lịch sử thay đổi giá
tenant_usage                # đo room actual vs registered
renewal_reminders           # nhắc gia hạn
reminder_automation_rules   # config rule
reminder_email_templates
promotional_codes           # code khuyến mãi
promo_code_usage            # dùng 1 lần / multi
```

## Trạng thái subscription

```text
trial → active → expiring_soon → grace_period → suspended → cancelled
```

Suspended (`is_read_only=true`) → block mọi mutation, chỉ read.

Cron `check-subscription-status` đánh dấu hằng ngày.

## Renewal Warning System (3 mức)

| Mức | Khi nào | UI |
|---|---|---|
| Expiring Soon | 14 ngày trước hết hạn | Banner vàng |
| Grace Period | hết hạn nhưng còn ân hạn (7 ngày) | Banner cam |
| Suspended | quá grace | Overlay đỏ chặn app |

(Memory: `renewal-warning-system-v1` + `suspended-access-restriction-v1`.)

## RPC

```text
apply_promo_code            # validate + record usage
approve_tenant              # super admin approve trial → active
calculate_tenant_storage    # quota (bytes)
```

## Mua thêm phòng vs Gia hạn

| Hành động | Tác động |
|---|---|
| Mua thêm phòng | `registered_rooms +=`, **giữ** `subscription_end_date` |
| Gia hạn | `subscription_end_date += duration`, giữ `registered_rooms` |
| Cả 2 | Cộng cả hai |

## Reminder automation

- Edge fn `send-notification-email` đẩy theo `reminder_automation_rules`.
- Memory: `super-admin/reminder-automation-architecture-v1`.

## Free trial

- Tenant mới: 30 ngày trial, có popup `FreeTrialPopup`.
- Memory: `room-limits-and-payment-enforcement` — chặn vượt quota theo plan.
