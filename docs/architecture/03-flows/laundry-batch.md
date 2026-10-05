# Flow: Laundry Batch

## Tổng quan
Quản lý batch giặt: tạo → giao nhà giặt → nhận về → nhập kho. Compensation khi mất/hỏng.

## State machine

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> delivered: Giao vendor
    delivered --> washing: Vendor xác nhận
    washing --> ready: Sẵn sàng nhận
    delivered --> ready: Skip washing
    ready --> received: Nhận về
    received --> stocked: Nhập kho
    stocked --> [*]
    received --> compensation: Phát hiện mất/hỏng
    compensation --> stocked
```

## Inventory impact

| Transition | Stock | Laundry | Lost/Damaged |
|---|---|---|---|
| `draft → delivered` | -qty | +qty | – |
| `received → stocked` | +qty | -qty | – |
| `compensation` (lost) | – | -qty | +qty (lost) |
| `compensation` (damaged) | – | -qty | +qty (damaged) |

## Sequence: Tạo + nhận batch

```mermaid
sequenceDiagram
    actor HK as Housekeeping
    participant FE
    participant RPC
    participant DB
    participant V as Vendor

    HK->>FE: Tạo batch (vendor, items + qty)
    FE->>RPC: create_laundry_batch
    RPC->>DB: insert linen_batches (delivered)
    RPC->>DB: insert linen_batch_items
    RPC->>DB: inventory_movements (out: stock→laundry)

    Note over V: Vendor giặt
    V-->>HK: Báo xong

    HK->>FE: Mark received
    FE->>RPC: transition_batch(received)
    RPC->>DB: validate transition
    RPC->>DB: update status

    HK->>FE: Inspection + Mark stocked
    FE->>RPC: stock_batch(actual_returned, lost, damaged)
    RPC->>DB: inventory_movements (in: laundry→stock)
    RPC->>DB: nếu lost/damaged → compensation_requests
    RPC->>DB: status=stocked
```

## Compensation
- Cron `laundry-compensation-cron` quét batch quá hạn không nhận về
- Tạo `compensation_requests` cho vendor
- Manager approve → trừ từ vendor balance

Memory: `laundry/operations-spec`, `fsm-v1-sprint1c`.

## Allowed transitions (validate trong RPC)
```
draft       → delivered
delivered   → washing | ready
washing     → ready
ready       → received
received    → stocked | compensation
compensation→ stocked
```
