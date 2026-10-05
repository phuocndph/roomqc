# Module: Lost & Found

## Phạm vi
Quản lý đồ thất lạc của khách. Tạo từ Room Check Lean (issue type `lost_found`) hoặc thủ công.

## Bảng chính
- `lost_found_items`
  - `code` — format `LF-YYYYMMDD-NNN` (memory `lost-found/lost-found-management`)
  - `room_id`, `found_by`, `found_at`, `description`, `photos[]`
  - `status`: `unclaimed | claimed | disposed`
  - `claimed_by_guest_id`, `claimed_at`

## Routes
| Path | Component | Permission |
|---|---|---|
| `/lost-found` | List | `view_lost_found` |
| `/lost-found/:id` | Detail | `view_lost_found` |

## Code generation
Trigger `trg_lost_found_code` sinh `code` theo ngày + sequence per tenant.

## Tích hợp Room Check Lean
Issue bucket riêng `lost_found` → khi submit:
- Tạo `lost_found_items` với `status='unclaimed'`
- Link `room_check_issues.lost_found_id`

## Permissions
- `view_lost_found`: staff
- `manage_lost_found`: manager (claim, dispose)

## Refactor cần thiết
- Hiện code format hardcode — nên config được prefix per tenant.
- Thiếu notification khi guest cũ quay lại có item unclaimed.
