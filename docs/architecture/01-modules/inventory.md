# Module: Inventory

**Phụ thuộc**: Items · Warehouses · Vendors · Laundry · Housekeeping (room check) · Reports.

## Sub-modules

```text
Items                    catalog SKU + category-driven classification
Warehouses               kho (mỗi hotel ≥ 1, là prerequisite)
Warehouse stock          tồn kho per (item × warehouse)
Inventory transactions   sổ cái nhập/xuất/điều chuyển
Distribution orders      manager approve → giao phòng → confirm
Stock adjustments        kiểm kê / điều chỉnh
Reorder suggestions      tự sinh từ consumption_snapshots (Intelligence C2)
Dead stock               báo cáo không tiêu thụ
Consumption snapshots    cron hourly tổng hợp
Chargeable consumptions  minibar / amenity → booking
```

## Routes (nhiều)

Xem `04-contracts/api-routes.md` filter `inventory/`. Tóm tắt:

```text
/inventory                  dashboard
/inventory/transactions     ledger
/inventory/inbound|outbound /new
/inventory/transfer/new
/inventory/adjustments[/new|/:id|/:id/check]
/inventory/distributions[/new|/:id|/from-supplements]
/inventory/reorder
/inventory/dead-stock
/inventory/analytics

/items[/new|/:id|/:id/edit|/categories]
/settings/warehouses
/supplements
```

## RPC chính

```text
atomic_item_consumed         # giảm stock + ghi transaction
atomic_item_lost             # giảm stock + lý do
atomic_item_to_laundry       # stock → laundry pool
apply_asset_group_mapping    # gom item theo asset group
batch_confirm_room_deliveries # confirm phân phối nhiều phòng
approve_reorder_suggestions  # approve gợi ý mua hàng
bulk_delete_items            # xóa hàng loạt
refresh_consumption_snapshots # cron hourly
get_dead_stock              # báo cáo
get_consumption_trend       # cho dashboard
```

## Quy tắc trừ stock (Stock Deduction Rules)

- **Mọi mutation tồn kho phải qua atomic RPC**, không UPDATE `warehouse_stock` trực tiếp ở client.
- Điều kiện trừ: chỉ sau khi giao dịch nguồn được confirm (room check submitted, batch stocked, distribution confirmed).
- Idempotent key: `(transaction_type, source_id, item_id)`.

## Distribution orders (manager approval gate)

```text
draft → pending_approval → approved → in_delivery → delivered → confirmed
                                  ↓
                              rejected
```

- Staff tạo từ supplements / room check missing → manager approve.
- Manager confirm batch deliveries: `batch_confirm_room_deliveries`.

## Minibar / Chargeable Consumables

- Item flag `is_chargeable=true` + giá `charge_price`.
- Khi room check báo `consumed_chargeable` + có booking active → tạo `chargeable_consumptions` → link `booking_consumables` để tính tiền checkout.
- **Tránh double-bill**: idempotent qua `room_check_issue_id`.

## Warehouse Prerequisite

- Hotel mới phải tạo warehouse trước khi có thể tạo item / distribution.
- UI guard + RPC validate.

## Excel Import

- Memory: `excel-import-standard-v1-refined`. Format chuẩn cho items (SKU, category, unit, min_stock, charge_price).

## Permission

| Action | owner | hotel_mgr | dept_mgr (inv) | staff |
|---|:-:|:-:|:-:|:-:|
| view | ✓ | ✓ | ✓ | ✓ |
| create item | ✓ | ✓ | ✓ | ✗ |
| approve distribution | ✓ | ✓ | ✓ | ✗ |
| stock adjustment | ✓ | ✓ | ✓ | ✗ |
| bulk delete | ✓ | ✓ | ✗ | ✗ |
