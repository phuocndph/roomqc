---
name: Sprint 4 - Cron, Storekeeper, Lean opt-in
description: pg_cron schedules, supplement source filter, Lean opt-in cho replenish/delivery
type: feature
---

## Cron jobs (qua supabase--insert)
- `process-room-check-outbox-5min` — chạy `process_room_check_issue_outbox(200)` mỗi 5 phút.
- `reconcile-room-check-side-effects-6h` — POST edge function reconcile mỗi 6h.

## RoomCheckRouter — Lean opt-in
- URL có `?lean=1` → bỏ qua exception replenish/delivery/distribution, redirect Lean. Mặc định vẫn wizard cũ.

## Storekeeper UI
- `/supplements`: thêm filter `source` (room_check / manual / all). Filter client-side trên `room_check_id != null`.

## QA + Rollback
- Tài liệu: `.lovable/docs/sprint-qa-rollback.md` chứa AC matrix DL/US/CM/SEC + rollback từng sprint + pilot checklist.
