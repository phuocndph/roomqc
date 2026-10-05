---
name: Outbox Hardening v1 (Sprint 1B)
description: Retry curve 1/5/15/60/180', dead-letter sau 5 attempts, SHA-256 idempotency hash, reconciliation RPC + edge cron
type: feature
---

# Sprint 1B — Outbox hardening

## Schema (room_check_issue_outbox)
- `schema_version smallint default 1`
- `retry_count int`, `next_retry_at timestamptz`
- `idempotency_key_raw text`, `idempotency_key_hash text` (SHA-256, backfilled)
- `dead_letter_at`, `dead_letter_reason`
- Unique `uq_rcio_idempotency (tenant_id, hotel_id, idempotency_key_hash)`
- Index `idx_rcio_ready (next_retry_at) WHERE status IN ('pending','retry')`
- Index `idx_rcio_dead_letter (hotel_id, dead_letter_at DESC) WHERE status='dead_letter'`

## RPCs
- `outbox_next_retry_at(retry_count) → timestamptz` — curve 1/5/15/60/180 phút
- `process_room_check_issue_outbox(_limit)` — refactor:
  - Pick by `next_retry_at <= now()` + `FOR UPDATE SKIP LOCKED`
  - Trên exception: nếu `attempts >= 5` → `status=dead_letter` + `dead_letter_reason`; ngược lại `status=retry` với `next_retry_at` mới.
  - Trả về `{processed, done, failed, skipped, dead_letter}`
- `reconcile_room_check_outbox(_hours)` — đếm dead-letter / stuck / orphan issue.

## Edge functions
- `process-room-check-outbox` — đã có; giờ tự động dùng curve mới qua RPC
- `reconcile-room-check-side-effects` — cron 6h, gọi `reconcile_room_check_outbox`, log JSON cho operator

## Job kinds hiện hỗ trợ
- `laundry` → laundry_requests (gom theo room_check_id)
- `inventory_lost`/`inventory_damaged`/`inventory_consumed` → inventory_transactions (idempotent)
- `charge_guest` → chargeable_consumptions (status=pending_fo_confirm)
- `maintenance` → maintenance_requests

## Rollout
- Existing rows: backfill `idempotency_key_hash` đã chạy trong migration.
- Worker cũ tương thích vì cột mới có default. Không cần cutover.
- Cron `reconcile-room-check-side-effects` cần schedule qua pg_cron (gắn 0 */6 * * *).
