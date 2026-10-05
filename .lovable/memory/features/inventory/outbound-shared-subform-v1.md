---
name: outbound-shared-subform-v1
description: Hợp nhất logic submit + category grid + stock validation giữa QuickOutboundDialog và MobileOutboundForm qua shared sub-form
type: feature
---
## Outbound shared sub-form (v1)

Shared modules tại `src/components/inventory/outbound/shared/`:

- `types.ts` — `OutboundCategory`, `OutboundSubmitPayload`, `OutboundSubmitExtras`, `LaundryExtras`, `MaintenanceExtras`.
- `useOutboundSubmit.ts` — Hook duy nhất dispatch submit:
  - `room_assign + selectedRoomIds[]` → `useCreateDistributionOrder`
  - `laundry + laundryData` → `useCreateLaundryBatch`
  - còn lại → `useCreateOutboundTransaction` (kèm related_type/id nếu có maintenance request)
  - Trả về `{ submit, isPending }` gộp loading 3 mutation.
- `OutboundCategoryGrid.tsx` — Picker dùng chung, 2 variant: `compact` (dialog) và `wizard` (full screen).
- `useStockValidation.ts` — Tính `hasStockError` + `lowStockWarnings`, ưu tiên `stockMap` warehouse, fallback `available_quantity`.

Bug đã sửa: QuickOutboundDialog trước đây luôn gọi `createOutbound` ngay cả khi category là `room_assign` / `laundry` → tạo sai loại phiếu. Giờ đi đúng nhánh.

Quy tắc:
- Mọi entrypoint xuất kho mới phải dùng `useOutboundSubmit`, không gọi trực tiếp 3 hook tạo.
- Dialog dùng `OutboundCategoryGrid` variant `compact`; full-screen wizard dùng `wizard`.
- QuickOutboundDialog default category = `'other'` để tránh vô tình tạo distribution order khi user chỉ muốn xuất nhanh không chọn phòng.
