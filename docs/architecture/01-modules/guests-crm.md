# Module: Guests CRM

## Phạm vi
Quản lý thông tin khách lưu trú, lịch sử booking, thống kê chi tiêu. Auto-link bookings theo số điện thoại.

## Routes
| Path | Component | Guard |
|---|---|---|
| `/guests` | `GuestsPage` | `view_guests` |
| `/guests/:id` | `GuestDetailPage` | `view_guests` |

## Bảng chính
- `guests` — danh sách khách
  - `phone` (unique per tenant) — khóa link bookings
  - `id_number`, `id_type` (`cccd | passport`), `nationality`
  - `total_bookings`, `total_spent`, `last_stay_at` — auto-update qua trigger
  - `notes`, `tags[]` (VIP, blacklist…)

## Triggers
- `trg_guest_stats_on_booking_complete`: khi booking checkout → recompute `total_bookings`, `total_spent`, `last_stay_at`.
- `trg_guest_link_on_booking_insert`: insert booking với `guest_phone` → upsert `guests` + set `booking.guest_id`.

## OCR CCCD (Gemini Flash)
- Edge fn: `scan-guest-document`
- Input: ảnh CCCD/passport → output JSON: `name, id_number, dob, address, gender`
- 422 nếu không phải giấy tờ hợp lệ (memory `document-validation-and-error-handling-spec`)
- Mobile remote scan: PC mở dialog → QR → mobile mở `/scan/document` → upload qua `mobile-scan-upload` → realtime sync về PC (memory `remote-mobile-capture-sync-v1`)

## Permissions
- `view_guests`: staff trở lên
- `manage_guests`: manager (edit, merge duplicates, blacklist)

## Refactor cần thiết
- Duplicate detection theo phone + id_number (chưa có UI merge).
- Export GDPR (chưa có).
