---
name: Laundry FSM v1 (Sprint 1C)
description: 9-state FSM + audit table + atomic RPCs partially_received/settle + policy_snapshot trigger + cancel guard
type: feature
---

# Sprint 1C — Laundry FSM hardening

## States (9)
draft → delivered → washing → ready → received → stocked → closed
ready → partially_received → compensation_needed → closed
draft/delivered → cancelled
**Cấm cancel** sau washing/ready/received/stocked/partially_received — chỉ Owner/Manager/Super Admin override.

## Tables
- `laundry_batch_audit` — mọi state transition (from/to/reason/details/by). RLS select per tenant.
- `laundry_batches.policy_snapshot` — auto snapshot khi insert qua trigger `trg_laundry_batch_policy_snapshot` từ `hotel_policy.laundry_compensation_after_days` (default 30).

## RPCs
- `transition_laundry_batch_status(_batch_id, _to, _reason)` — guard FSM + audit; cancel sau delivered cần role owner/hotel_manager/super_admin.
- `mark_batch_partially_received(_batch_id, _items jsonb)` — atomic: chỉ cho phép từ delivered/washing/ready, set `partially_received_at`, tăng `items_lost`, ghi audit. `_items[].quantity_sent` so với `_items[].quantity` để tính lost.
- `settle_batch_compensation(_batch_id, _amount, _notes)` — chỉ partially_received/compensation_needed → closed; ghi `compensation_settled_at/by/amount` + audit.

## Cron đã có
`mark_batches_compensation_needed` (đợt B) — chuyển `partially_received` → `compensation_needed` khi quá `policy_snapshot.compensation_after_days`.
Edge: `laundry-compensation-cron` (đã có) gọi RPC này.

## Frontend hooks (đã có)
- `useCompensationBatches`, `useMarkBatchPartiallyReceived`, `useSettleBatchCompensation`, `useCreateLinenBatch`, `useLinenBatches` trong `src/hooks/useLaundryCompensation.ts`.

## Còn thiếu (Sprint 2/3)
- UI button "Chuyển trạng thái" gọi `transition_laundry_batch_status` ở `/laundry/batches/:id`.
- Hook `useTransitionLaundryBatch` chưa viết — cần.
- View "Lịch sử trạng thái" đọc `laundry_batch_audit`.
