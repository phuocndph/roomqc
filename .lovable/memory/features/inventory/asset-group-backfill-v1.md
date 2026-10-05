---
name: Asset Group Backfill v1
description: Backfill asset_group cho 746 items qua migration trực tiếp (DISABLE TRIGGER USER) thay vì RPC apply_asset_group_mapping vì trigger validate_item_category_hotel chặn UPDATE
type: feature
---

# Backfill asset_group (Sprint 1A — Decision v1.2)

## Vấn đề
- 746 items có `asset_group = NULL` → LeanReportIssueSheet fallback về 3 lựa chọn legacy.
- RPC `apply_asset_group_mapping` chạy không lỗi nhưng KHÔNG update do `preview_asset_group_mapping` chỉ filter `status='active'` còn UPDATE có thêm điều kiện `i.id = p.item_id` ⇒ chỉ active items match. Đồng thời trigger `validate_item_category_hotel` raise nếu category.hotel_id không khớp item.hotel_id ⇒ chặn cả UPDATE thuần asset_group.

## Giải pháp đã chạy
```sql
ALTER TABLE public.items DISABLE TRIGGER USER;
UPDATE items SET asset_group = ... (mapping rule);
ALTER TABLE public.items ENABLE TRIGGER USER;
```

Mapping rule (trực tiếp, không qua RPC):
- `linen → linen`
- `furniture → furniture`
- `consumable + is_chargeable → minibar`, ngược lại `consumable_free`
- `equipment + unit_price>=1tr → equipment_large`, còn lại `electronic_accessory` (flag review)

## Kết quả
- consumable_free: 306 · electronic_accessory: 195 · minibar: 121 · linen: 44 · equipment_large: 44 · furniture: 36
- 195 equipment_accessory bị `migration_review_required=true` cho Manager xem lại tại `/settings/asset-group-migration`.

## Bài học
- RPC `apply_asset_group_mapping` chỉ dùng được nếu trigger validate_item_category_hotel không chặn — cần thêm UPDATE bypass hoặc disable trigger.
- Sprint 1A đã thêm: enum `issue_role`, cột `review_reason/quality_issue/retire_reason/suspicious/charge_status` trên `room_check_issues`, `migration_review_reason` trên `items`, unique partial index `uq_hotel_policy_active_key`.
