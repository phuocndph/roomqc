---
name: Cross-module Review (Sprint 3)
description: Manager review queue cho room_check_issues needs_review, override charge của FO, audit log, supplement_request job
type: feature
---

## Tables / Columns
- `chargeable_consumptions` thêm: `final_status, overridden_by, overridden_at, override_reason, source_issue_id`.
- `room_check_issues` thêm: `reviewed_by, reviewed_at, review_decision`. Index `idx_rci_pending_review (hotel_id, created_at)` WHERE needs_review AND review_decision IS NULL.
- `room_check_issue_reviews`: audit (decision ∈ approved|rejected|overridden_approve|overridden_reject).

## RPCs
- `review_room_check_issue(p_issue_id, p_decision, p_reason)` — chỉ manager+. Khi approved sẽ enqueue lại outbox theo bucket (lost/damaged/consumed/replaced).
- `manager_override_charge(p_charge_id, p_decision, p_override_reason)` — bắt buộc reason ≥5 ký tự. Set `final_status` + override timestamps + audit liên kết `source_issue_id`.
- `is_manager_or_above(_user)` helper.

## Outbox
- Job kind mới `supplement_request`: gom theo `room_check_id` thành 1 `supplement_requests` (pending, request_type=replenish).
- Trigger fanout: bucket `items_replaced` → supplement; lost/consumed có `extra.create_supplement=true` → supplement.

## UI
- `/housekeeping/issues-review` (RoleGuard manager): list issues needs_review, duyệt/từ chối kèm lý do, realtime.
- `PendingChargesPage`: Manager thấy nút "Ghi đè" trên dòng đã duyệt/từ chối → dialog yêu cầu lý do ≥5 ký tự, gọi `manager_override_charge`.
