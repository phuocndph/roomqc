---
name: Inbound Form Schema Unification v1
description: Shared Zod schema for Nhập kho (Inbound) form across desktop + mobile, with to_warehouse_id UUID and auto-pick default warehouse
type: feature
---
Sprint 1 audit /inventory hợp nhất schema Inbound:

- File: `src/lib/inventory/inboundFormSchema.ts` xuất `inboundFormSchema`, `buildInboundDefaults`, type `InboundFormData`.
- Cả `src/pages/inventory/InboundPage.tsx` (desktop) và `src/components/inventory/MobileInboundForm.tsx` cùng import — không tự define lại Zod.
- Mobile **bắt buộc** dùng `WarehouseSelect` + auto-pick `useDefaultWarehouse()` khi mount. KHÔNG bao giờ dùng `to_location` text tự do nữa.
- Trường bắt buộc: `transaction_category`, `from_location` (text), `to_warehouse_id` (uuid), `items` (≥1 item, qty ≥1).

Khi cần thêm field mới: sửa schema 1 chỗ, cả 2 form tự nhận. Tuyệt đối không thêm `.refine` đặc thù mobile.
