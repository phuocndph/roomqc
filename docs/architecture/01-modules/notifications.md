# Module: Notifications

## Phạm vi
Hệ thống thông báo đa kênh: in-app, email, push (web push), Telegram. Tích hợp QC reject, task assign, payment success, subscription expiry.

## Bảng chính
| Bảng | Mục đích |
|---|---|
| `notifications` | Master notifications (legacy) |
| `in_app_notifications` | Bell icon, realtime |
| `email_notifications` | Queue gửi email |
| `push_subscriptions` | Web push endpoints per user |
| `notification_preferences` | User opt-in/out per channel × event |
| `telegram_connections` | User ↔ Telegram chat_id |
| `telegram_groups` | Hotel ↔ group chat |

## Edge functions
- `send-notification-email` — SMTP qua Resend
- `send-push-notification` — Web Push protocol
- `send-telegram-notification` — Telegram Bot API
- `send-welcome-email` — onboard
- `send-invoice-email` — gửi PDF invoice
- `telegram-webhook` — nhận command từ user

## Welcome system
DB trigger `trg_welcome_notification_on_user_insert` → tạo in-app notification chào mừng (memory `automated-welcome-system-v1`).

## Recipient resolver
`utils/notificationRecipients.ts`:
- Task assigned → `assigned_to`
- Task QC reject → `assigned_to` + `assigned_by`
- Payment success → tenant owner + manager
- Subscription expiring → tenant owner

## Realtime
Subscribe `in_app_notifications` filter `recipient_id=eq.{userId}` → bell counter + toast.

## Permissions
Mọi user đều xem notification của mình. Manager có thể xem queue email/push của hotel mình.

## Refactor cần thiết
- Hợp nhất `notifications` legacy vs `in_app_notifications`.
- Rate limit để tránh spam push khi nhiều issue cùng lúc.
