# Module: Bookings

**Phụ thuộc**: Rooms · Guests · Payment · Invoices · Services · Minibar · Notifications · Workflows.

## Routes

```text
/bookings                  BookingsPage           (PermissionRoute module=bookings)
/bookings/:id              BookingDetailPage
/guests                    GuestsPage             (module=bookings)
/guests/:id                GuestDetailPage
/guest-invoices            GuestInvoicesPage
/reception/pending-charges PendingChargesPage
```

## Loại booking

| Loại | Field thời gian | RPC availability | Note |
|---|---|---|---|
| `daily` | `check_in_date` + `check_out_date` + giờ | `check_room_availability` | Tính số đêm |
| `hourly` | `hourly_date` + `hourly_start_time` + `booking_hours` | conflict by hour range | Min 2h, max 8h |
| `monthly` | `monthly_start_date` + `booking_months` | – | Discount 5/10/15% theo 3/6/12 tháng |

## State machine

Xem [05-state-machines/booking-status.md](../05-state-machines/booking-status.md).

```text
draft → pending → confirmed → checked_in → checked_out → completed
                                       ↓
                                   cancelled
```

Mọi transition qua **`transition_booking_status(_booking_id, _to_status, _reason?, _amount_owed?)`** + audit log.

## Flows chính

| Flow | RPC | File flow |
|---|---|---|
| Walk-in tạo nhanh + thu cọc | `create_booking` (insert) | [03-flows/booking-lifecycle.md](../03-flows/booking-lifecycle.md) |
| Check-in | **`perform_checkin(p_booking_id, p_room_id, p_early_checkin_charge)`** | atomic: validate room status, set checked_in, log audit |
| Check-out 1 phòng | **`perform_checkout(p_booking_id, p_room_id, p_late_checkout_charge, p_service_charges, p_subtotal, p_vat_amount, p_service_fee_amount, p_total_amount, p_damage_charges, p_damage_notes, p_damage_items, p_new_amount_paid, p_check_out_date)`** | atomic: tính tiền, room → cleaning, log |
| Check-out nhóm | **manual** post-payment (Group Checkout spec) | inspection prerequisite |
| Hủy | **`cancel_booking`** | refund handling tùy state |
| OTA ingest | flow riêng: import → booking + commission | [03-flows/payment-vietqr-sepay.md](../03-flows/payment-vietqr-sepay.md) |

## Tài chính booking

```text
total_amount = (room_price × duration) + service_charges + minibar
            + vat (8-10%) + service_fee (5%)
            - discount

paid       = sum(booking_payments.amount where status='completed')
deposit    = sum(deposit fields)
unpaid     = total_amount - (paid + deposit)
```

> **Memory rules**:
> - Walk-in deposit ghi vào field `deposit_amount` (không phải `amount_paid`).
> - Group payment: webhook tham chiếu metadata để biết phân bổ phòng nào.
> - OTA prepaid: record `ota_paid_amount` + commission, không tính vào `amount_paid` của khách.

## Bảng chính

```text
room_bookings              # entity gốc
booking_payments           # nhiều dòng / 1 booking
booking_consumables        # minibar / amenity tính phí
booking_service_charges    # extra services
pending_group_links        # lưu nhóm chờ pay-then-checkout
guest_invoices, invoices   # PDF + email
```

## Đặc thù

- **Surcharge check-in sớm** — xem memory `check-in-surcharge-logic`. Tính điều kiện theo thời gian thực + chính sách hotel.
- **Occupancy validation** — check-in chặn nếu phòng đang `occupied|maintenance|cleaning|dnd|oos`. Validation ở RPC + UI.
- **OTA**: `booking_source` ∈ {`booking_com`, `agoda`, `traveloka`, `expedia`} → bật commission flow. OTA payment types: `prepaid` / `pay_at_hotel` / `partial_prepaid`.
- **Group integrity**: query group luôn join rates để tránh stale price.
- **All Hotels mode**: chặn create booking, chỉ view tổng hợp; query keys phải có `hotelId='ALL'` để cache đúng.

## Permission

| Action | super_admin | owner | hotel_manager | dept_manager | staff |
|---|:-:|:-:|:-:|:-:|:-:|
| view | ✓ | ✓ | ✓ | ✓ (reception) | ✓ (reception) |
| create | ✓ | ✓ | ✓ | ✓ | ✓ |
| update | ✓ | ✓ | ✓ | ✓ | ✓ |
| delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| approve | ✓ | ✓ | ✓ | – | – |

(Memory: `permissions/booking-staff-access-rls`)

## Rủi ro / nợ kỹ thuật (xem [09-refactor/findings.md](../09-refactor/findings.md))

- F-BK-01: Tài chính tính ở nhiều chỗ (server + client). Nên có 1 view DB hoặc helper duy nhất.
- F-BK-02: Group checkout có 3 entry point (manual, payment-completed listener, button) — cần state machine rõ ràng.
- F-BK-03: OTA payment metadata phụ thuộc convention chuỗi → dễ vỡ. Nên enum + JSON schema.
