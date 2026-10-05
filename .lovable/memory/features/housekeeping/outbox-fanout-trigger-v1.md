---
name: Outbox Fan-out Trigger v1 (Sprint 2)
description: BEFORE INSERT trigger trên room_check_issues tự enqueue jobs vào outbox theo bucket + extra; auto-set charge_status
type: feature
---

# Sprint 2 — Outbox fan-out

## Smart Sheet (đã có sẵn)
- `LeanReportIssueSheet` đọc `assetGroup` (B1 land trước đó)
- `L1_BY_GROUP` định nghĩa 9 variant (4 lựa chọn/group) trong `src/lib/issueBucketMapping.ts`
- Sub-reasons ENUM (radio), không free-text
- Derived action sinh kèm khi chọn (vd: `glassware.broken` → derived `glassware.replace`)

## Trigger mới `trg_rci_outbox_fanout` (BEFORE INSERT)
- Auto set `charge_status`:
  - `pending_fo_confirm` nếu `charge_to_guest=true`
  - `pending_manager_review` nếu `needs_review=true`
- SKIP `derived_action` (primary đã xử lý)
- SKIP `needs_review=true` cho mọi bucket trừ `items_sent_to_laundry` (chờ Manager Sprint 3 enqueue tay)
- Mapping bucket → job_kinds:
  - `items_sent_to_laundry` → `[laundry]`
  - `items_lost` → `[inventory_lost]` + `[charge_guest]` nếu charge
  - `items_damaged` → `[inventory_damaged]` + `[maintenance]` nếu `extra.create_maintenance` hoặc asset_group ∈ {equipment_large, furniture, bathroom_hardware}
  - `items_consumed` → `[inventory_consumed]` + `[charge_guest]` nếu charge
  - `items_replaced/items_missing` → bỏ qua (manager review)
- Idempotency: `tenant:issue:job_kind` SHA-256 hash, ON CONFLICT (issue_id, job_kind) DO NOTHING

## Worker (Sprint 1B)
`process_room_check_issue_outbox` đã hỗ trợ tất cả job_kinds: laundry, inventory_lost/damaged/consumed, charge_guest, maintenance.

## Còn thiếu
- Sprint 3: Manager review queue cho `needs_review=true` issues → khi approve sẽ enqueue thủ công bằng RPC.
- UI Storekeeper, FO override.
