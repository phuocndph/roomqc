---
name: RoomCheck Lean — Validation, Permission & Audit Hardening v1
description: Server-side hardening cho Lean. validate_room_check_context bổ sung 'periodic'. submit_room_check_lean check qty>0, photo per-bucket (damaged_lost ON, missing/consumed OFF default), validate task tenant, audit log explicit. perform_quick_room_check + reopen_room_check log_state_transition. Client LeanReviewPage sanitize draft + pre-submit validation. Reopen chỉ super_admin/tenant_owner/manager.
type: feature
---

## Server RPCs (đã sửa)
- `validate_room_check_context` — thêm `periodic` vào danh sách check_type hợp lệ.
- `submit_room_check_lean`:
  - Validate `_task_id.tenant_id == room.tenant_id`.
  - `quantity > 0` cho mọi item trong missing/damaged/lost/consumed/replaced → `invalid_quantity`.
  - Photo enforcement granular từ `hotels.settings.room_check`:
    - `photo_required_damaged_lost` (default true) → áp cho damaged + lost
    - `photo_required_missing_replace` (default false) → áp cho missing + replaced
    - `photo_required_consumed_chargeable` (default false) → chỉ áp khi `charge_to_guest=true`
  - Lỗi: `photo_required:damaged_lost | missing_replace | consumed_chargeable`.
  - Conflict: `MAX(checked_at) > _started_at` → `conflict_room_updated`.
  - Audit: `log_state_transition('room_checks', check_id, 'lean_submit', …)`.
- `perform_quick_room_check` — audit `quick_submit` (giữ logic cũ + log).
- `reopen_room_check` — audit `reopen` từ `submitted` → `reopened`. Quyền: `super_admin | tenant_owner | manager` → `forbidden_role`.

## Permission matrix (Lean)
| Vai trò | Quick | Standard | Save draft | Reopen |
|---|---|---|---|---|
| Staff (assigned task) | ✓ (nếu config) | ✓ | ✓ (local) | ✗ |
| Manager / Owner | ✓ | ✓ | ✓ | ✓ |
| Khác tenant | ✗ `forbidden_tenant` | ✗ | — | ✗ |

## Client (LeanReviewPage)
- Sanitize draft khi restore: drop entries thiếu `item_id/kind` hoặc `quantity<=0`, photos lọc string, minibar ép Number>0.
- Pre-submit validation theo `useRoomCheckLeanConfig`: chặn submit nếu thiếu ảnh / qty<=0, hiển thị inline `LeanInlineError` với tên item cụ thể.
- Mapping lỗi tiếng Việt trong `useRoomCheckLean.mapLeanError` (conflict, photo per-bucket, qty, quick disabled/rate/not allowed, forbidden).

## Files
- migration mới: hardening RPC (validate/submit/quick/reopen)
- `src/hooks/useRoomCheckLean.ts` — mapping lỗi mở rộng
- `src/pages/rooms/LeanReviewPage.tsx` — draft sanitize + pre-validate
