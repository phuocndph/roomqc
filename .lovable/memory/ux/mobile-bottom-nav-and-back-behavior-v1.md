---
name: Mobile Bottom Nav & Back Behavior v1
description: Permission-based bottom nav (max 5, overflow → More) and smart back with auto-hide on root paths + module-root fallback
type: design
---

# Mobile Bottom Nav & Back Behavior

## Bottom Nav (`MobileBottomNav.tsx`)

- Pool 8 tab cố định: Home, Tasks, Đặt phòng, Phòng, Giặt là, Bảo trì, Kho, Thêm.
- **Filter theo permission thuần** (qua `useUserModulePermissions`) — KHÔNG gating theo `hasMode('homestay')`.
  - `Tasks`: hiện nếu có quyền 1 trong `housekeeping_tasks | room_checks | maintenance_requests | distribution_orders` (view tổng hợp).
  - Các tab module khác: cần `can_view || can_create || can_update || can_delete` trên module tương ứng.
  - `super_admin` & `owner`: luôn thấy đủ.
- Slot tối đa: **5 nút** = Home (cố định đầu) + tối đa 3 module tabs (theo thứ tự ưu tiên trong pool) + More (cố định cuối). Tab tràn được gom vào `/more`.
- Tasks path tự đổi theo department: `housekeeping` → `/staff/housekeeping`, còn lại → `/my-tasks`.

## Back Behavior (`MobileDetailHeader.tsx`)

- **Auto-hide back** trên root paths: `/`, `/my-tasks`, `/staff/housekeeping`, `/bookings`, `/rooms`, `/laundry`, `/maintenance`, `/inventory`, `/items`, `/more`, `/settings` — bất kể prop `showBack` truyền vào.
- **Smart back** (`handleBack`):
  1. Có `onBack` prop → gọi.
  2. `window.history.state?.idx > 0` (có history trong app) → `navigate(-1)`.
  3. Không có history → fallback module root suy từ pathname:
     - `/rooms/:id/check*` → `/staff/housekeeping` (housekeeping) hoặc `/my-tasks` (khác)
     - `/rooms/...` → `/rooms`
     - `/bookings/...` → `/bookings`
     - `/laundry/...` → `/laundry`
     - `/maintenance/...` → `/maintenance`
     - `/inventory/...` | `/items/...` → `/inventory`
     - mặc định → `/`

**Why:** Người dùng mở deep link / từ thông báo không bị back ra ngoài app; trang root không hiện back vô nghĩa; không cần đi từng trang sửa `showBack={false}`.
