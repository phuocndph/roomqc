# Flow: Inventory Distribution

## Tổng quan
Distribution = chuyển hàng từ warehouse → room/department. Có flow approval (manager duyệt → staff giao). Có round-robin auto-assign. Có route batch (1 chuyến đi nhiều phòng).

## State machine

```mermaid
stateDiagram-v2
    [*] --> draft: Tạo từ Room Check (missing_replace)
    draft --> pending: Submit
    pending --> approved: Manager duyệt
    pending --> rejected: Manager từ chối
    approved --> in_progress: Staff nhận giao
    in_progress --> delivered: Giao xong + ký
    delivered --> [*]
    rejected --> [*]
```

## Sequence

```mermaid
sequenceDiagram
    actor HK as HK Staff
    participant LEAN as Room Check Lean
    participant DB
    participant M as Manager
    participant DEL as Delivery Staff

    LEAN->>DB: submit_room_check_lean với missing_replace
    DB->>DB: enqueue outbox
    Note over DB: process-room-check-outbox
    DB->>DB: insert distribution_orders (draft) + items

    HK->>DB: submit thành pending (hoặc auto-submit)
    M->>DB: approve_distribution_order
    DB->>DB: status=approved
    DB->>DB: round-robin assign DEL (on-shift staff)
    DB->>DEL: notify push

    DEL->>DB: start_delivery (status=in_progress)
    DEL->>DB: complete_delivery (signature, photo)
    DB->>DB: inventory_movements (warehouse→room)
    DB->>DB: items.quantity -= delivered_qty
    DB->>DB: status=delivered
```

## Validate
- Warehouse phải tồn tại (memory `warehouse-prerequisite-constraint`)
- Stock đủ trước khi approve
- Manager approval bắt buộc (memory `stock-integrity-and-distribution`)

## Route batch
Khi nhiều order cùng floor/wing → gom thành 1 route, in phiếu giao tổng (`printDistributionOrder.ts`).

## Round-robin assignment
- Filter `staff_status` on-shift trong department phù hợp
- Track `last_assigned_at` → chọn nhỏ nhất
- Memory: `unified-operations-and-task-system`

## Stock deduction
Memory `stock-deduction-rules`:
- Atomic RPC `deduct_inventory_for_distribution`
- Chỉ trừ khi `status=delivered`, không trừ ở `approved` (tránh trừ kép nếu reject)

## Memory
`features/inventory/stock-integrity-and-distribution`, `unified-operations-and-task-system`, `excel-import-standard-v1-refined`.
