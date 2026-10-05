---
name: Rooms Grid Quick View Consolidation v1
description: Pattern thống nhất giữa /rooms (desktop+mobile) cho card phòng, Quick View dialog và phân vai tab theo role
type: feature
---

# Rooms UX Consolidation v1 — pattern Quick View thống nhất

## Card phòng (Lưới HK)
- Cả desktop (`RoomGrid.tsx`) và mobile (`MobileRoomsPage.tsx`) chỉ còn **1 nút duy nhất** trên footer card: "Kiểm tra".
- Header card: `[chấm semantic] · {room_number} · {nhãn trạng thái màu}` — bỏ pill chọn trạng thái và giá phòng.
- Click vào card body (không phải nút) → mở `RoomQuickViewDialog` chứ không điều hướng.

## Quick View Dialog
- 2 biến thể, dùng chung `RoomQuickHeader`:
  - `RoomQuickViewDialog` (Lưới HK): ops-focused — đổi trạng thái, vật tư, session check
  - `ReceptionQuickDialog` (Sơ đồ Lễ tân): pricing, finance, ops tabs + ⋯ menu
- Hành động phụ (Giao việc / Xem chi tiết / Đổi trạng thái) gom hết vào dialog, không xuất hiện trên card.

## Phân vai tab `/rooms`
- 4 tab: `grid` (HK), `list` (Bảng), `floor` (Lịch đặt phòng — tape chart), `map` (Sơ đồ tình trạng — Lễ tân).
- Default view theo role (`defaultViewByRole`):
  - `owner | super_admin | hotel_manager` → `map`
  - `department_manager` và khác → `grid`
- Persist user override vào `localStorage['rooms.viewMode']` + URL `?view=`.

## Helper màu trạng thái
- `getRoomStatusDotClass(status)` → `bg-*-500`
- `getRoomStatusTextClass(status)` → `text-*-700`
- Suy ra từ `ROOM_STATUS_META_V2.text` — đổi 1 nơi, đồng bộ 4 component.
