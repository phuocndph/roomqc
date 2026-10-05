---
name: RoomCheck Lean Rollout Router v1
description: /rooms/:id/check redirect tự động sang /check-lean qua RoomCheckRouter dùng feature flag hotels.settings.room_check.use_lean (default true), giữ wizard cũ cho replenish/delivery/distribution_order_id/inspection
type: feature
---

# Lean Rollout Router

## Strategy
Thay vì sửa hàng chục nơi gọi `navigate('/rooms/:id/check')`, route gốc `/rooms/:id/check` được render bởi `RoomCheckRouter` — wrapper quyết định wizard cũ vs Lean dựa trên:

1. **Wizard-only signals** (giữ nguyên wizard cũ):
   - `?type=replenish` hoặc `?type=delivery`
   - `?distribution_order_id=...`
   - `?room_order_id=...`
   - `?inspection=...` (checkout inspection legacy)

2. **Per-hotel flag**: `hotels.settings.room_check.use_lean`
   - default `true` (rollout ON)
   - set `false` để tạm rollback per hotel khi gặp issue production

3. Còn lại → `<Navigate to="/rooms/:id/check-lean?{qs}" replace />` giữ nguyên query.

## Files
- `src/pages/rooms/RoomCheckRouter.tsx` — wrapper Suspense + Navigate
- `src/App.tsx` — route `/rooms/:id/check` đổi sang `<RoomCheckRouter />`; `RoomCheckPage` cũ vẫn lazy import (dùng bên trong Router)
- `src/hooks/useRoomCheckLeanConfig.ts` — thêm field `use_lean` (default true)

## Rollback
- Per hotel: `UPDATE hotels SET settings = jsonb_set(settings, '{room_check,use_lean}', 'false') WHERE id = ...`
- Toàn bộ: revert App.tsx route về `RoomCheckPage` trực tiếp.

## Cố ý KHÔNG làm
- Không sửa các `navigate('/rooms/:id/check?...')` rải rác — Router xử lý ở 1 chỗ.
- Không chuyển `replenish` / `delivery` sang Lean (Lean v1 chưa cover các flow này).
