---
name: RoomCheck Lean Rollout Completion v1
description: Manager Reopen UI (ReopenCheckDialog gắn vào EnhancedCheckHistory cho admin/manager); realtime session sync ở Step 1 Overview (block người khác đang giữ phiên, manager Tiếp quản, dọn session sau quick submit); audit log mọi thay đổi settings.room_check qua activity_logs.
type: feature
---

# Room Check Lean — Rollout Completion

## Manager Reopen UI
- `src/components/rooms/ReopenCheckDialog.tsx` — dialog nhập lý do (>=5 ký tự), gọi `useReopenRoomCheck`.
- Gắn vào `EnhancedCheckHistory` cho user `isAdminUser || isManager`.
- Hiện trạng status mỗi check: `reopened` → "Đã mở lại — chờ kiểm lại"; `undone` → "Đã hoàn tác"; còn lại → nút "Mở lại".
- Backend: dùng RPC `reopen_room_check` đã có (audit qua `trg_audit_room_checks`).

## Realtime session sync (Step 1 Overview)
- `RoomCheckOverviewPage` dùng `useRoomCheckSession(roomId)` realtime.
- Map `LeanCheckType.periodic` → `daily` cho `room_check_sessions.check_type`.
- Banner amber khi `isOtherSession`; CTA Quick + Inspection bị disable nếu chưa phải manager.
- Manager: hiển thị nút "Tiếp quản phiên" gọi `takeOverSession`.
- `ensureSession()` tạo session khi user chính bắt đầu (Inspection / Resume draft).
- Quick path: thêm `deleteSession(id)` sau submit thành công (vì RPC quick không tự dọn như `submit_room_check_lean`).

## Audit log thay đổi config
- `useUpdateRoomCheckLeanConfig` đọc settings cũ, diff theo key, gọi `logActivity({ entityType: 'hotel_room_check_settings', action: 'updated', oldValues, newValues })` chỉ với key thay đổi.
- Không ghi log nếu không có thay đổi thực sự.
- Không throw nếu log fail (silent warn).

## Files mới / sửa
- new `src/components/rooms/ReopenCheckDialog.tsx`
- edit `src/components/rooms/EnhancedCheckHistory.tsx` (import, state, nút "Mở lại", dialog)
- edit `src/pages/rooms/RoomCheckOverviewPage.tsx` (session sync, banner, ensureSession, takeOver, deleteSession sau quick)
- edit `src/hooks/useUpdateRoomCheckLeanConfig.ts` (audit log diff)
