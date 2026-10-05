---
name: RoomCheck Lean Undo + Edit Resume v1
description: undo_quick_room_check RPC (10p window, soft delete, audit) + useUndoQuickRoomCheck hook + LeanInspectionPage auto-mở sheet khi có ?edit={itemId}, Quick Path redirect Success ?quick=1
type: feature
---

# Lean Undo + Edit Resume

## Backend
- RPC `public.undo_quick_room_check(_check_id, _reason)`:
  - Chỉ undo `check_mode = 'quick'`.
  - Cửa sổ **10 phút** kể từ `checked_at`.
  - Quyền: chính `checked_by` hoặc role `tenant_owner|manager|super_admin`.
  - Bị chặn nếu có `room_checks` mới hơn cùng `room_id` → `newer_check_exists` (tránh ghi đè im lặng).
  - Soft delete: `status = 'undone'` + append `[Hoàn tác] {reason}` vào `notes`.
  - Best-effort audit qua `log_state_transition` (không lỗi nếu helper chưa có).

## Frontend
- `src/hooks/useUndoQuickRoomCheck.ts` — VN error mapping (`undo_window_expired`, `not_quick_check`, `newer_check_exists`, `forbidden_*`).
- `LeanSuccessPage` → `UndoButton` gọi RPC thật, success → quay về Step 1.
- `RoomCheckOverviewPage` quick path success → `/check-lean/success?quick=1&checkId=...&issues=0` (replace) thay vì `/my-tasks`.
- `LeanInspectionPage` đọc `?edit={itemId}`: auto mở `LeanReportIssueSheet` cho item đó (chạy 1 lần qua `editOpenedRef`).

## Flow "Sửa lại" từ Step 3
Review "Sửa lại" → `/inspection?type=...&resume=true&edit={itemId}` → hydrate draft + auto-open sheet với `initial` từ issues map.

## Cố ý KHÔNG làm
- Không hard delete row room_checks (giữ audit).
- Không undo standard check (chỉ quick).
- Không cho user khác undo cùng phòng.
