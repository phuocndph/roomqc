---
name: Detail Title Block & Mobile Floor Map v1
description: Shared RoomDetailTitleBlock cho 3 trang detail; MobileRoomsPage thêm tab Sơ đồ Lễ tân (RoomFloorMapView)
type: feature
---

# Batch 3 — B5 + A2 (v1.1.60)

## A2 — RoomDetailTitleBlock
- File: `src/components/rooms/detail/RoomDetailTitleBlock.tsx`
- Dùng ở 3 nơi: `RoomDetailPage` (size="lg"), `MobileRoomDetailPage`, `StaffRoomDetailPage` (size="md" mặc định).
- Cấu trúc: `[Phòng {n}] [StatusBadge]` + `RoomMetaSubtitle` (loại · tầng · m² · giường · view · giá + popover amenities/notes).
- Thêm trường meta mới → chỉ sửa `RoomMetaSubtitle`, 3 trang tự đồng bộ.

## B5 — Sơ đồ Lễ tân trên mobile
- `MobileRoomsPage` thêm tab thứ 3 `map`, render `<RoomFloorMapView />` trực tiếp (đã có content-visibility lazy + Quick View tích hợp từ v1.1.59).
- CellSize tự thích ứng theo preset đang lưu (sm/md/lg) — mobile mặc định preset `sm` (16 cột, height 76px) vẫn dùng được trên 390px nhờ scroll ngang.
- Tablet ≥768px vẫn đi qua RoomsPage gốc với 4 tab — không thay đổi.
