---
name: Version Update Auto-Draft
description: Mỗi APP_VERSION mới tự sinh announcement version_update is_active=false để admin chỉnh & bật
type: feature
---

# Auto-draft thông báo cập nhật phiên bản

## Cơ chế
- Hook `useEnsureVersionDraft()` chạy khi mount `/super-admin/announcements`.
- Query `announcements` theo `kind='version_update' AND version=APP_VERSION`.
- Nếu thiếu → insert draft (`is_active=false`, `placement=popup_center`, `audience=all`, `priority=100`, `starts_at=APP_VERSION_DATE`, body lấy từ `public/changelog.json` nếu version khớp).
- Nếu lỗi RLS (không phải super_admin) → im lặng, không chặn UI.

## UI
- Banner trên cùng module Announcements: "Phiên bản hệ thống hiện tại v{APP_VERSION}" + badge `Đang chờ bật` (amber) / `Đang phát thông báo` (green).
- Nút **"Chỉnh sửa & bật"** mở `AnnouncementFormDialog` với draft.
- Trong form, trường `version` **read-only** khi edit `version_update` (gắn với build).

## Hiển thị runtime
- `AnnouncementHost` (popup slot) đã lọc `version >= APP_VERSION` + key localStorage `announcement_version_seen_v1` lưu version đã xem → mỗi user chỉ thấy 1 lần.

## Files
- `src/hooks/announcements/useEnsureVersionDraft.ts` (mới)
- `src/components/super-admin/announcements/AnnouncementsManagement.tsx` (banner + nút)
- `src/components/super-admin/announcements/AnnouncementFormDialog.tsx` (lock version)
