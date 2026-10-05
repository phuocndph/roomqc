---
name: Asset Group System v1 (Đợt A)
description: 9-group asset_group enum + items.asset_group/migration_review_required + preview_asset_group_mapping + apply_asset_group_mapping RPCs + room_check_staff_items_view (no price/wash/stock)
type: feature
---

# Đợt A — Asset Group + Hotel Policy + Charge Status

## Database

**Enum `asset_group` (9 nhóm)**:
- `linen`, `consumable_free`, `minibar`, `stationery`, `equipment_large`,
  `electronic_accessory`, `furniture`, `glassware`, `bathroom_hardware`

**Cột mới trên `items`**:
- `asset_group asset_group` (nullable — backfill bằng RPC)
- `migration_review_required boolean DEFAULT false`

**Bảng `hotel_policy`** (per-hotel config):
- 8 key seed mặc định: `minibar_expiry_warning_days`, `laundry_compensation_after_days`,
  `quick_path_undo_ttl_minutes`, `draft_ttl_hours`, `photo_required_by_issue_type`,
  `charge_policy_by_asset_group`, `max_wash_cycles_by_linen_category`,
  `minibar_fo_reject_notify_manager`
- Trigger `trg_hotel_policy_history` tự bump `version` + ghi `hotel_policy_history`
- RLS: select toàn tenant, insert/update/delete chỉ owner/hotel_manager

**Enum `charge_status` (7 giá trị)** — chuẩn bị cho Đợt C:
`not_applicable`, `not_chargeable`, `pending_manager_review`, `pending_fo_confirm`,
`fo_rejected`, `chargeable_confirmed`, `chargeable_rejected`

**Idempotency** (chuẩn bị cho Đợt B):
- `inventory_transactions.idempotency_key_raw / idempotency_key_hash`
- Unique index `uq_inv_tx_idempotency` partial WHERE hash IS NOT NULL

## RPCs

- `preview_asset_group_mapping(_tenant_id, _hotel_id?)` → table dry-run.
  - Mapping rule: linen→linen, furniture→furniture, consumable+chargeable→minibar,
    consumable→consumable_free, equipment+price≥1tr→equipment_large,
    equipment→electronic_accessory.
  - Equipment LUÔN được đánh dấu `needs_review=true` để Manager xem lại.
- `apply_asset_group_mapping(_tenant_id, _hotel_id?, _override_existing=false)` → jsonb.
  - Quyền: owner/hotel_manager/super_admin (KHÔNG dùng `tenant_owner`/`manager` — dự án dùng `app_role` enum).

## View

`room_check_staff_items_view` (security_invoker) — staff chỉ thấy:
`item_code, display_name, item_type, asset_group, room_quantity_expected,
room_quantity_current, condition, badge_label`. KHÔNG bao giờ trả về `unit_price`,
`charge_price`, `wash_cycles`, `quantity_in_stock`.

## UI

- `/settings/asset-group-migration` — `AssetGroupMigrationPage.tsx` + hook `useAssetGroupMapping.ts`
- `/settings/hotel-policy` — `HotelPolicyPage.tsx` + hook `useHotelPolicy.ts` + `HotelPolicyHistoryDrawer.tsx`
- Sidebar group "Nghiệp vụ": "Phân loại tài sản", "Cấu hình khách sạn"
- Cả 2 page chỉ truy cập được bởi `super_admin / owner / hotel_manager`

## Test

`supabase/tests/asset_group_migration.sql` — 9 assertion:
enum count, columns exist, seed 8 keys, version bump + history, RPC signatures,
view không lộ price/wash/stock, charge_status enum, idempotency index.

## Rollback

```sql
DROP VIEW room_check_staff_items_view;
DROP FUNCTION apply_asset_group_mapping;
DROP FUNCTION preview_asset_group_mapping;
DROP TABLE hotel_policy_history;
DROP TABLE hotel_policy;
DROP FUNCTION trg_hotel_policy_history;
DROP INDEX uq_inv_tx_idempotency;
ALTER TABLE inventory_transactions DROP COLUMN idempotency_key_raw, DROP COLUMN idempotency_key_hash;
ALTER TABLE items DROP COLUMN asset_group, DROP COLUMN migration_review_required;
DROP TYPE asset_group;
DROP TYPE charge_status;
```

Không mất dữ liệu nghiệp vụ. UI route chỉ ẩn khỏi sidebar.

## Next (Đợt B)

- Refactor `LeanReportIssueSheet` → đọc `asset_group` để render variant.
- Linen Pool Bridge: `atomic_item_to_laundry` ngừng trừ stock; chỉ `atomic_laundry_batch_delivered` mới trừ.
- `batch_inventory` cho FIFO linen.
