# Module: Housekeeping (Room Check Lean + QC + Tasks)

**Module phức tạp nhất.** Tổng hợp 3 sub-system: Room Check, Tasks, QC.

**Phụ thuộc**: Rooms · Inventory · Laundry · Lost & Found · Notifications · Maintenance.

---

## 1. Room Check — 3 chế độ

| Chế độ | Khi nào | RPC | UX |
|---|---|---|---|
| **Quick** (1 tap "Phòng OK toàn bộ") | daily / periodic only | `perform_quick_room_check` | Default-OK, nhanh nhất |
| **Lean** (default-OK + report issue) | mọi loại check | `submit_room_check_lean` | Tap để mở bottom sheet báo issue |
| **Full** (legacy, replenish/delivery) | distribution_order, room_order | (CRUD trực tiếp + side effects) | Form đầy đủ |

### Lean flow (sub-routes)

```text
/rooms/:id/check-lean              RoomCheckOverviewPage      # context, resume draft, quick path button
/rooms/:id/check-lean/inspection   LeanInspectionPage         # default-OK list + ReportIssueSheet (2 tầng)
/rooms/:id/check-lean/review       LeanReviewPage             # summary + "Sửa lại" per issue
/rooms/:id/check-lean/success      LeanSuccessPage            # CTA tiếp theo
```

### Bottom sheet 2 tầng

- Tầng 1 chọn loại issue:
  - `damaged_lost` (hỏng / mất) — **bắt buộc photo**
  - `missing_replace` (thiếu / cần bổ sung) — photo OFF default (toggle ON được)
  - `consumed_chargeable` (tiêu hao tính phí cho khách) — photo OFF default
- Tầng 2 chọn item + qty (`>0`) + ghi chú.

### Atomic submit

`submit_room_check_lean(p_session_id, p_issues jsonb)`:

1. Validate tenant + task ownership.
2. Validate qty > 0, photo per-bucket theo policy.
3. Insert vào `room_check_issues` (2 pass: primary + derived qua `client_issue_id`).
4. Insert outbox events → cron `process-room-check-outbox` fan-out:
   - `damaged_lost` → giảm stock + (nếu charge) → `chargeable_consumptions`
   - `missing_replace` → tạo `distribution_order` cần manager approve
   - `consumed_chargeable` → `booking_consumables` (link booking active của room)
5. Audit log `lean_submit / quick_submit / reopen`.

### Manager Reopen

- `reopen_room_check(p_session_id, p_reason)` — Manager+. Mở lại session đã submit để sửa.
- Outbox trước đó: reverse hoặc đánh dấu superseded.

### Draft & resume

- `useLeanDraft` autosave 24h vào localStorage (`tenantId:roomId:sessionId`).
- ResumeDraftSheet hiện ở Overview nếu có draft chưa submit.

---

## 2. Housekeeping Tasks

Bảng `housekeeping_tasks` là **hub duy nhất** cho mọi task buồng phòng & maintenance đơn giản.

### Lifecycle (state machine)

```text
pending → assigned → in_progress → done → reviewed
                                   ↓
                                rejected (về assigned)
```

Transition qua **`transition_task_status`**. Reject → multi-channel notification (in-app + push + telegram).

### Round-robin assignment

- Memory: `unified-operations-and-task-system`.
- Khi tạo task mới → chọn nhân viên on-shift trong department, round-robin theo `last_assigned_at`.
- Dialog giao việc dùng `useOnShiftStaffList(All)` realtime (subscribe `staff_status`).

### `/my-tasks` Unified View

- Aggregate `housekeeping_tasks` + `maintenance_requests` cho user hiện tại.
- Mobile-portrait first.

---

## 3. QC Dashboard

`/housekeeping/qc` — Manager+ only.

- Chart trend theo ngày/tuần.
- Drill-down: bấm cột → list tasks bị reject của ngày đó.
- Export CSV.
- Memory: `qc-dashboard-and-notifications-v1`.

---

## RPC liên quan

```text
submit_room_check_lean       # main lean submit (atomic + conflict)
perform_quick_room_check     # 1-tap OK
undo_quick_room_check        # undo trong 24h
reopen_room_check            # manager
get_last_room_check          # cho prefill / context
transition_task_status       # task FSM
approve_task                 # manager review
reject_task ?                # via transition (rejected)
calculate_staff_statistics   # cho dashboard
```

## Edge functions liên quan

- `process-room-check-outbox` — fan-out side effects (giảm stock, tạo distribution, charge).
- `reconcile-room-check-side-effects` — bù trừ side effect lỗi.
- `notify-chargeable` — thông báo khoản tính phí cho khách.

## Permission

| Action | owner | hotel_mgr | dept_mgr | staff |
|---|:-:|:-:|:-:|:-:|
| Lean submit | ✓ | ✓ | ✓ | ✓ |
| Quick path | ✓ | ✓ | ✓ | ✓ |
| Reopen | ✓ | ✓ | ✓ (cùng dept) | ✗ |
| Toggle `use_lean` | ✓ | ✓ | ✗ | ✗ |
| QC view | ✓ | ✓ | ✓ | ✗ |

## Rủi ro

- F-HK-01: Outbox + reconcile có khả năng double-apply nếu fan-out lỗi giữa chừng → cần idempotent key đầy đủ.
- F-HK-02: `room_check_issues` fan-out 2 pass dùng `client_issue_id` → cần unique constraint thật trong DB.
- F-HK-03: Quick path daily/periodic only — chặn ở UI nhưng RPC cũng cần kiểm tra (defense in depth).
