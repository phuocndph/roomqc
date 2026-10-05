# Module: Super Admin

## Phạm vi
Quản trị platform: tenants, approval, pricing, promo, marketing, renewal reminders, analytics, settings.

## Routes (RoleGuard `super_admin`)
| Path | Page |
|---|---|
| `/super-admin` | `SuperAdminDashboard` |
| `/super-admin/tenants` | `TenantsPage` (Advanced management) |
| `/super-admin/approval` | `TenantApprovalPage` |
| `/super-admin/promo-codes` | `PromoCodesPage` |
| `/super-admin/campaigns` | `MarketingCampaignsPage` |
| `/super-admin/reminders` | `RenewalRemindersPage` |
| `/super-admin/pricing` | `PricingPlansPage` |
| `/super-admin/analytics` | `AnalyticsPage` |
| `/super-admin/settings` | `SuperAdminSettingsPage` |

Legacy alias `/admin/*` đang tồn tại song song → cần hợp nhất (F-DUP-02).

## Bảng chính
- `super_admin_activity_log` — audit mọi action super admin
- `platform_settings` — JSONB config (memory `settings-system-architecture`)
- `marketing_campaigns`, `campaign_engagement`
- `renewal_reminders` — scheduled reminders
- `promo_codes` — discount codes

## Auth
Memory `super-admin/dieu-huong-va-xac-thuc-auth-routing`:
- Route guard kiểm `user_roles.role = 'super_admin'`
- Redirect non-super-admin về `/dashboard`
- Login flow riêng nếu cần (TBD)

## Reminder automation
Memory `reminder-automation-architecture-v1`:
- Cron daily quét `tenants` sắp hết hạn
- Tạo `renewal_reminders` + gửi email
- Track engagement qua `campaign_engagement`

## Settings system
`platform_settings` JSONB structure:
```json
{
  "pricing": { "base_price_per_room_per_day": 1000, "discounts": {...} },
  "trial": { "days": 14, "max_rooms": 10 },
  "features": { "feature_flags": {...} },
  "branding": { "logo_url": "...", "support_email": "..." }
}
```

## Permissions
`super_admin` only. Không hotel/tenant filter — cross-tenant view.

## Refactor cần thiết
- F-DUP-02: hợp nhất `/admin/*` và `/super-admin/*`.
