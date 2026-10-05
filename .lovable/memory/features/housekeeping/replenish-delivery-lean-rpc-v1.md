---
name: Replenish & Delivery Lean RPC Foundation v1
description: 2 RPC atomic submit_replenish_lean + submit_delivery_lean — gộp room_check + issues + task + audit; tái dùng confirm_warehouse_delivery cho stock
type: feature
---

## Phase 1 (v1.1.62)

### RPC mới
- `submit_replenish_lean(_room_id, _items jsonb, _cleaning_requested, _notes, _photos, _task_id)`
  - Insert `room_checks` (check_type='replenish', check_mode='lean', status='completed')
  - Fan-out `room_check_issues` mỗi item (bucket default `missing_replace`, source `replenish_lean`)
  - `transition_task_status(task_id,'completed','replenish_lean')` nếu có task
  - Audit `log_state_transition(..., 'replenish_submit_lean', ...)`
- `submit_delivery_lean(_room_id, _distribution_order_room_id, _items_actual jsonb?, _notes, _photos, _task_id)`
  - Insert `room_checks` (check_type='delivery', check_mode='lean')
  - Forward `confirm_warehouse_delivery` (khi có items_actual) hoặc `confirm_delivery_from_room_check` (giao đủ)
  - Đóng task + audit `delivery_submit_lean`

### Quyền
- SECURITY DEFINER, `search_path = public`
- REVOKE PUBLIC + GRANT EXECUTE TO authenticated
- Validate caller tenant qua `users.tenant_id` = room.tenant_id (raise `TENANT_MISMATCH`)

### Hook
- `src/hooks/useSubmitReplenishLean.ts`
- `src/hooks/useSubmitDeliveryLean.ts`
- Invalidate: `rooms`, `room`, `room-checks`, `housekeeping-tasks` (+ `distribution-orders` cho delivery)
- Xoá draft localStorage key `room-replenish-${roomId}` / `room-delivery-${roomId}` sau success

### Còn lại
- Phase 2: `RoomReplenishPage` + route `/rooms/:id/check-replenish`
- Phase 3: `RoomDeliveryPage` + route `/rooms/:id/check-delivery`
- Phase 4: feature flag `settings.room_check.use_lean_replenish` / `use_lean_delivery`, redirect trong `RoomCheckRouter`, xoá branch legacy
