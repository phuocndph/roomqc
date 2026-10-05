# Flow: Room Check Lean

## Tổng quan
Quy trình kiểm phòng tinh gọn: Default-OK reverse logic — mọi item mặc định OK, chỉ tap khi có vấn đề. Atomic RPC + outbox + autosave 24h.

## Routes
- `/rooms/:id/check` → `RoomCheckRouter` redirect Lean (trừ replenish/delivery)
- `/rooms/:id/check-lean` → Overview
- `/rooms/:id/check-lean/inspection` → Step 2
- `/rooms/:id/check-lean/review` → Step 3
- `/rooms/:id/check-lean/success` → Confirmation

## State machine session

```mermaid
stateDiagram-v2
    [*] --> overview
    overview --> quick_path: 1-tap "Phòng OK hoàn toàn"
    overview --> inspection: Có vấn đề
    inspection --> review: Next
    review --> overview: Sửa lại
    review --> submitting
    quick_path --> submitting
    submitting --> success: RPC OK
    submitting --> conflict: 409 conflict
    conflict --> overview: Reload session
    success --> [*]
    overview --> resume: Có draft <24h
    resume --> overview: Tiếp tục
    resume --> overview: Bỏ draft
```

## Sequence: Submit Lean

```mermaid
sequenceDiagram
    actor S as Staff
    participant UI as Lean UI
    participant LS as IndexedDB draft
    participant RPC as submit_room_check_lean
    participant DB
    participant OBX as Outbox
    participant EF as process-room-check-outbox

    S->>UI: Tap items có vấn đề (sheet 2 tầng)
    UI->>LS: autosave mỗi 5s
    S->>UI: Submit
    UI->>RPC: submit_room_check_lean(payload)
    RPC->>RPC: validate (qty>0, photo per-bucket)
    RPC->>DB: insert room_check_sessions
    RPC->>DB: insert room_check_issues (fan-out 2 pass: primary + derived)
    RPC->>DB: enqueue room_check_outbox (side effects)
    RPC->>DB: audit_log lean_submit
    RPC-->>UI: { session_id, issues_count }
    UI->>LS: clear draft
    UI->>S: → /success

    Note over OBX,EF: Async side effects
    EF->>DB: process outbox
    EF->>DB: tạo maintenance_requests (damaged_lost)
    EF->>DB: tạo lost_found_items (lost_found bucket)
    EF->>DB: trừ inventory (consumed_chargeable)
    EF->>DB: tạo distribution_requests (missing_replace)
    EF->>DB: notify chargeable guest
```

## Issue buckets (5)
| Bucket | Photo? | Side effect |
|---|---|---|
| `damaged_lost` | ON (default) | Maintenance request |
| `missing_replace` | OFF | Distribution request |
| `consumed_chargeable` | OFF | Trừ inventory + charge guest |
| `dirty` | OFF | HK task |
| `lost_found` | ON | Lost & found item |

Memory: `room-check-lean-validation-and-permission-v1`.

## Quick path
- Chỉ áp dụng `daily | periodic` (không checkin/checkout)
- RPC `perform_quick_room_check(room_id, type)` → tạo session rỗng + audit `quick_submit`
- Undo trong 5 phút: RPC `undo_quick_room_check`

## Reopen (Manager)
- RPC `reopen_room_check(session_id, reason)` → unlock session, audit
- UI: Manager menu trên session detail

## Realtime
Subscribe `room_check_sessions` filter `room_id=eq.X` → sync check type + lock state cho multi-staff.

Memories: `room-check-lean-business-logic-v1`, `lean-ui-step1/2/3`, `lean-undo-and-edit-v1`, `lean-rollout-router-v1`, `lean-rollout-completion-v1`.
