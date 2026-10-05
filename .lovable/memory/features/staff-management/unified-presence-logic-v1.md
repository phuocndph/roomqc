---
name: Unified Staff Presence Logic v1
description: staffPresence.ts là single source of truth cho "đang trong ca" — dùng chung cho mọi dropdown giao việc và Quản lý nhân sự
type: feature
---

## Định nghĩa "đang trong ca" (isOnShift)

File: `src/lib/staffPresence.ts`

Nhân viên được coi là on-shift khi **tất cả**:
1. `shift_start_at` không null
2. `shift_end_at` null hoặc < `shift_start_at`
3. `shift_start_at` trong vòng `MAX_SHIFT_HOURS = 16` giờ (quá là `shift_stale`)
4. `status` ≠ `'offline'`

## 5 trạng thái presence

- `on_shift_available` — sẵn sàng (chấm xanh)
- `on_shift_busy` — busy/break (chấm vàng)
- `on_shift_offline` — heartbeat > `OFFLINE_THRESHOLD_MIN = 30` phút (chấm xám)
- `shift_stale` — ca treo > 16h, **không** tính là on-shift
- `not_on_shift` — chưa vào ca / đã tan ca / status offline

## Bắt buộc

- Mọi dropdown giao việc và panel nhân sự dùng `getPresenceState()` / `isOnShift()` từ `@/lib/staffPresence`, **không** tự viết logic shift_start/end nữa.
- `useShiftManagement.ts` re-export `isCurrentlyOnShift = isOnShift` để giữ compat.
- `useOnShiftStaffList` và `useOnShiftStaffListAll` đều trả về `presence_state` + `last_seen_at` để UI render badge.
- Sort theo `PRESENCE_SORT_ORDER` (available → busy → offline-heartbeat).

## Cron tự đóng ca treo

- Function: `public.auto_close_stale_shifts()` (SECURITY DEFINER, search_path=public)
- Cron: `auto-close-stale-shifts` mỗi giờ ở phút thứ 5
- Đóng mọi shift có `shift_start_at < now() - 16h` và shift_end_at null, set status=offline, ghi `audit_log` action `'auto_close_stale_shift'`.

## UI Convention

Dropdown chia nhóm bằng header `text-[11px] uppercase tracking-wide text-muted-foreground` + count, mỗi item có dot 2x2 trước Avatar 6x6. Group `on_shift_offline` hiển thị thêm `formatDistanceToNow(last_seen_at)`.
