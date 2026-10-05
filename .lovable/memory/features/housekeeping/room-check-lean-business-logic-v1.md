---
name: RoomCheck Lean v1 — Business Logic
description: Lean flow business rules. RPCs perform_quick_room_check (rate-limited, daily/periodic only), submit_room_check_lean (atomic, conflict check), reopen_room_check (manager only). Hooks useRoomCheckLeanConfig, useSubmitRoomCheckLean, useReopenRoomCheck. Local draft only (room-check-{id} TTL 24h).
type: feature
---

# Room Check Lean — Business Logic

## State machine
- `submitted` (mặc định khi insert) → có thể `reopened` bởi manager.
- Không có `draft` server-side. Draft sống ở localStorage `room-check-{roomId}` TTL 24h, xoá sau submit.

## Quick Path (`perform_quick_room_check`)
- **Chỉ daily / periodic** — checkin/checkout/maintenance bị reject (`quick_path_not_allowed`).
- Tôn trọng `hotels.settings.room_check.quick_path_enabled`. Nếu false → `quick_path_disabled`.
- Rate-limit theo `quick_path_rate_limit_minutes` (default 30). Vi phạm → `quick_rate_limited:N`.
- Photo evidence: `photo_evidence_mode='always'` → `photo_required` nếu `photos[]` rỗng.
- Tự đếm `summary_ok_count = SUM(room_items.standard_quantity)`. `issue=0`, `minibar=0`.
- Lift room status `cleaning|dirty → available` qua `transition_room_status` (audit).

## Standard submit (`submit_room_check_lean`)
- 1 RPC atomic. Nhận `_started_at` từ client, kiểm conflict: nếu `MAX(checked_at) > _started_at` → `conflict_room_updated`.
- Compute server-side: `summary_issue_count = len(missing+damaged+lost)`, `minibar_count = len(consumed)`, `summary_ok_count = max(SUM(standard_quantity) - issue, 0)`.
- `check_mode='standard'`, `status='submitted'`, link `task_id` nếu có.
- Cleanup `room_check_sessions` theo `room_id`.

## Reopen (`reopen_room_check`)
- Chỉ `super_admin | tenant_owner | manager` → `forbidden_role` nếu không đủ quyền.
- Set `status='reopened'`, append reason vào `notes`.

## Photo enforcement (LEAN — granular)
Per-issue-type qua `hotels.settings.room_check`:
- `photo_required_damaged_lost` (default true)
- `photo_required_missing_replace` (default false)
- `photo_required_consumed_chargeable` (default false)

Vẫn giữ enum cũ `photo_evidence_mode` (none/on_issue/always) cho trigger `enforce_room_check_photos` ở tầng INSERT chung.

## Error mapping (Vietnamese)
- `conflict_room_updated` → "Phòng vừa được người khác cập nhật. Vui lòng tải lại..."
- `quick_path_disabled` → "Khách sạn đã tắt chế độ kiểm nhanh."
- `quick_rate_limited:N` → "Vui lòng đợi đủ N phút..."
- `quick_path_not_allowed` → "Loại kiểm này không hỗ trợ chế độ nhanh."
- `forbidden_tenant|forbidden_role` → "Bạn không có quyền..."

## Files
- DB RPCs: `perform_quick_room_check` (upgraded), `submit_room_check_lean` (new), `reopen_room_check` (new)
- Hooks:
  - `src/hooks/useRoomCheckLeanConfig.ts` — đọc per-hotel config
  - `src/hooks/useRoomCheckLean.ts` — `useSubmitRoomCheckLean`, `useReopenRoomCheck`
  - `src/hooks/useQuickRoomCheck.ts` — error mapping mở rộng

## Cố ý KHÔNG làm (Lean scope)
- Không có Phase1Confirm, không signature, không VIP checklist.
- Không cleaning request riêng (giữ luồng task hiện tại).
- Không multi-level approval ngoài reopen đơn giản.
- Không bảng draft server, không bảng issue/attachment riêng.

## Audit
- `room_checks` đã có trigger `trg_audit_room_checks` (INSERT/UPDATE/DELETE).
- Quick & standard submit → INSERT → tự log.
- Reopen → UPDATE → tự log.
- Lift room status → `transition_room_status` đã log riêng.
