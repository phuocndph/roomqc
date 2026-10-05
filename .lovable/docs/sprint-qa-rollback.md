# QA Matrix & Rollback Plan — Decision v1.2

## 1. Sprint coverage map

| Sprint | Scope | AC group |
|---|---|---|
| 1A | Asset group enum, charge_status, idempotency cols | DL-01..05 |
| 1B | Outbox v1: hash, retry curve, dead-letter, reconciliation | DL-06..12 |
| 1C | Laundry FSM (partially_received, compensation_needed, closed), audit | DL-13..16 |
| 2  | Smart Sheet 9 variant theo asset_group | US-01..12 |
| 3  | Manager review queue + override charge + supplement fanout | CM-01..10 |
| 4  | Cron, Storekeeper UI, Lean opt-in cho replenish/delivery, QA docs | CM-11..16 + SEC-01..14 |

## 2. Acceptance Test Cases

### DL — Data Layer
| ID | Mô tả | Expected |
|---|---|---|
| DL-01 | Insert item NULL asset_group | Trigger gắn migration_review_required=true |
| DL-06 | submit_room_check_lean fan-out → mỗi issue tạo N outbox jobs | Hash unique theo (tenant,issue,job_kind) |
| DL-07 | Worker fail 1 lần | retry_count=1, next_retry_at +1m |
| DL-08 | Worker fail 5 lần | status=dead_letter, dead_letter_reason set |
| DL-09 | Re-submit cùng issue | Outbox UNIQUE chặn duplicate |
| DL-13 | Mark batch partially_received | items_lost = sent − returned, status đúng |
| DL-15 | Cancel batch sau delivered (staff) | RPC raise PERMISSION_DENIED |

### US — UX Smart Sheet
| ID | Mô tả | Expected |
|---|---|---|
| US-01 | Tap linen → sheet hiện 4 variant (gửi giặt / hỏng / mất / cần thay) | Đúng |
| US-04 | Minibar consumed → toggle "Tính phí khách" mặc định ON | Đúng |
| US-09 | Asset_group=equipment_large + damaged | Auto enqueue maintenance |

### CM — Cross-module
| ID | Mô tả | Expected |
|---|---|---|
| CM-01 | Issue needs_review=true | KHÔNG enqueue inventory cho tới khi Manager duyệt |
| CM-02 | Manager approve issue | Enqueue đúng bucket, charge_status đổi |
| CM-04 | Manager override charge không kèm reason | RPC raise OVERRIDE_REASON_REQUIRED |
| CM-06 | Bucket items_replaced | Tạo supplement_request gom theo room_check |
| CM-11 | Cron 5 phút | process_room_check_issue_outbox chạy đều |
| CM-12 | Cron 6h | reconcile-room-check-side-effects log JSON |
| CM-15 | Storekeeper filter source=room_check | Chỉ trả về requests có room_check_id |

### SEC — Security
| ID | Mô tả | Expected |
|---|---|---|
| SEC-01 | Staff gọi review_room_check_issue | PERMISSION_DENIED |
| SEC-02 | Staff gọi manager_override_charge | PERMISSION_DENIED |
| SEC-04 | Cross-tenant SELECT room_check_issue_reviews | RLS chặn |
| SEC-07 | Outbox idempotency hash trùng | UNIQUE chặn double-effect |
| SEC-10 | Cancel laundry sau delivered (staff) | Bị từ chối |

## 3. Rollback plan

### Sprint 3 (review/override)
- Disable trigger fanout supplement: `ALTER TABLE room_check_issues DISABLE TRIGGER trg_room_check_issues_outbox_fanout;` rồi recreate version cũ.
- Revoke RPC: `REVOKE EXECUTE ON FUNCTION review_room_check_issue, manager_override_charge FROM authenticated;`
- Page `/housekeeping/issues-review` xoá khỏi App.tsx (giữ migration để audit).
- Override columns trên `chargeable_consumptions` để lại — backward compat.

### Sprint 4 (cron + Lean opt-in)
- Tắt cron: `SELECT cron.unschedule('process-room-check-outbox-5min');` và `'reconcile-room-check-side-effects-6h'`.
- Reset RoomCheckRouter: bỏ check `optInLean` (giữ wizard cũ default).
- Storekeeper filter: bỏ Select source — chỉ là client-side filter, không ảnh hưởng DB.

### Outbox dead-letter recovery
1. `SELECT * FROM room_check_issue_outbox WHERE status='dead_letter';`
2. Sửa nguyên nhân (thiếu booking, item bị xóa, v.v.)
3. `UPDATE room_check_issue_outbox SET status='retry', attempts=0, next_retry_at=now(), dead_letter_at=NULL WHERE id=...;`

## 4. Pilot checklist (2 hotels)
- [ ] Backfill asset_group → Manager sign-off
- [ ] Bật cron 5m + 6h, watch 24h
- [ ] Pilot 50 lượt room check Lean
- [ ] So khớp `reconcile_room_check_outbox(24)` mỗi sáng — 0 stuck/orphan
- [ ] Manager dùng `/housekeeping/issues-review` ≥ 1 lần/ngày
- [ ] Storekeeper duyệt supplement từ room_check ≥ 1 lần/ngày
- [ ] Không có dead_letter > 0 cuối ngày
