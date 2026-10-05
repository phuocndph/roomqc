---
name: Announcements Management
description: Super Admin module để quản lý popup chương trình, version update, banner quảng cáo, system notice qua bảng announcements + audience targeting + dismissal tracking
type: feature
---

# Module Thông báo & Banner

## DB
- Bảng `public.announcements` — cột chính: kind (promo_popup|version_update|ad_banner|system_notice), placement (popup_center|top_banner|bottom_strip|inline_card), variant, audience (all|tenant_owner|manager|staff|trial_only|expired_only), title/body/cta/image/icon, is_active, is_dismissible, starts_at/ends_at, version, priority.
- Bảng `public.announcement_dismissals(announcement_id, user_id)` — server-side tracking "Không hiển thị lại".
- Bucket storage `announcement-assets` (public read, super_admin write) cho ảnh banner.

## RLS
- SELECT: authenticated user đọc khi `is_active AND now BETWEEN starts_at AND ends_at`. Super admin SELECT tất cả.
- INSERT/UPDATE/DELETE: chỉ `has_role(uid,'super_admin')`.
- Dismissals: user chỉ thao tác bản ghi `auth.uid() = user_id`.

## Frontend
- Route `/super-admin/announcements` → `AnnouncementsManagement` (list + filter tab theo kind, form Dialog single-page Zod).
- Hook `useActiveAnnouncements(placement?)` — lọc theo audience+role+subscription_status, loại bỏ dismissed, có realtime subscribe.
- `<AnnouncementHost slot="top|bottom|popup" />` đặt trong `MainLayout` mobile + desktop.
- Version popup: dùng key `announcement_version_seen_v1` localStorage + so với `APP_VERSION` để chỉ hiện 1 lần.
- `FreeTrialPopup` cũ giữ làm fallback chỉ render khi không có promo_popup nào active từ DB.

## Seed
1 record `promo_popup` "Chương trình hỗ trợ chuyển đổi số" audience=trial_only — giữ continuity với memory `digital-transformation-support-v1`.
