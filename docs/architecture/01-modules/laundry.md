# Module: Laundry

**Phụ thuộc**: Inventory (linen pool) · Vendors · Notifications.

## Routes

```text
/laundry                          dashboard
/laundry/batches[/new|/:id|/:id/receive]
/laundry/vendors[/new|/:id|/:id/edit]
/laundry/compensation
/laundry/linen-batches/new
```

## Batch FSM

```text
draft → delivered → washing → ready → received → stocked
                                  ↓
                              compensation_requested → resolved
```

- `delivered`/`washing` → `ready` (vendor báo xong).
- `ready` → `received` (KS nhận về).
- `received` → `stocked` (kiểm + nhập kho).
- Mất / hỏng → `compensation_requests`.

## Stock impact

| Sự kiện | Impact |
|---|---|
| Tạo batch (gửi giặt) | `warehouse_stock.qty_in_stock --` ; `qty_in_laundry ++` |
| `received` | – (trung gian) |
| `stocked` | `qty_in_laundry --` ; `qty_in_stock ++` |
| Mất/hỏng | `qty_in_laundry --` ; `qty_lost/qty_damaged ++` |

## RPC

```text
add_laundry_to_draft_batch
atomic_item_to_laundry
```

## Compensation

- Cron `laundry-compensation-cron` auto chốt yêu cầu compensation quá hạn.
- Manager approve / reject ở `/laundry/compensation`.

## Permission

| Action | owner | hotel_mgr | dept_mgr (laundry) | staff |
|---|:-:|:-:|:-:|:-:|
| view | ✓ | ✓ | ✓ | ✓ |
| create batch | ✓ | ✓ | ✓ | ✓ |
| approve compensation | ✓ | ✓ | ✓ | ✗ |
