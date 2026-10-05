# Module: Rooms

**Phụ thuộc**: Tenants/Hotels · Bookings · Housekeeping · Maintenance.

## Routes

```text
/rooms                            RoomsPage
/rooms/new                        RoomFormPage
/rooms/:id                        RoomDetailPage
/rooms/:id/edit                   RoomFormPage
/rooms/:id/check                  RoomCheckRouter   (smart redirect)
/rooms/:id/check-lean[/...]       Lean flow (xem housekeeping.md)
/rooms/standards                  RoomStandardsPage
```

## State Machine v2 (11 trạng thái)

Xem chi tiết: [05-state-machines/room-status.md](../05-state-machines/room-status.md).

```text
available → reserved → occupied → checked_out_pending → cleaning
                                                       → inspected → available
            ↑                                         ↓
            ←──────── dnd / oos / maintenance ────────
            ←──────── reserved_no_show ────────
```

Mọi transition qua **`transition_room_status(_room_id, _to_status, _reason, _dnd_until?, _oos_until?, _force?)`** với audit log + permission check (memory: `state-machine-v2-rollout`).

DND/OOS có `expires_at` → cron `lift-expired-dnd-oos` tự lift.

## Bảng chính

```text
rooms                  # status, hotel_id, room_type_id, current_booking_id
room_types             # template
room_type_standards    # default item list / quantity / quy chuẩn
room_pricing_rules     # giá theo ngày/giờ/tháng + ngày đặc biệt
room_items             # snapshot item ở phòng (link tới items)
```

## Pricing Rules

- Theo loại phòng × loại booking (daily/hourly/monthly).
- Override theo ngày (lễ Tết, weekend).
- Tích hợp với booking wizard step 4.

## Quy chuẩn phòng (Room Standards)

- `room_type_standards` định nghĩa item × số lượng chuẩn cho từng loại phòng.
- `apply_room_standards(p_room_id)` RPC: copy template vào `room_items`.
- Trở thành baseline để Lean Room Check so sánh "thiếu / thừa".

## RoomCheckRouter (per-hotel flag)

- `/rooms/:id/check` → `RoomCheckRouter` quyết định:
  - Nếu `?type=replenish|delivery` hoặc có `distribution_order_id|room_order_id|inspection` → flow legacy (full check).
  - Ngược lại + `settings.room_check.use_lean = true` (default) → redirect `/rooms/:id/check-lean`.
- Per-hotel toggle ở `hotels.settings.room_check.use_lean` (audit log mọi thay đổi).

## Permission

| Action | super_admin | owner | hotel_manager | dept_manager | staff |
|---|:-:|:-:|:-:|:-:|:-:|
| view | ✓ | ✓ | ✓ | ✓ | ✓ |
| create | ✓ | ✓ | ✓ | ✗ | ✗ |
| update | ✓ | ✓ | ✓ | ✓ | ✓ (check) |
| delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| manage standards | ✓ | ✓ | ✓ | ✗ | ✗ |
