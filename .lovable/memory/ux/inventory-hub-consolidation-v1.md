---
name: Inventory Hub Consolidation v1
description: Sidebar "Kho & Tài sản" gom 15 mục con thành 1 lối vào /inventory; trang là hub Tabs (Tổng quan/Tài sản/Xuất nhập/Phân tích/Thiết lập) với URL ?tab=&sub=
type: design
---

## Sidebar
- Mục `inventory` trong `src/components/layout/Sidebar.tsx` chỉ có `href: '/inventory'`, không có `children`.
- Badge `inventoryTotal` gộp adjustments + distributions + reorderSuggestions + supplements.

## Hub layout (`src/pages/inventory/InventoryDashboardPage.tsx`)
- 5 tab chính sync với URL `?tab=`: `overview` (default) · `assets` · `operations` · `analytics` · `settings`.
- Sub-tab sync với URL `?sub=`:
  - assets: `items` | `categories`
  - operations: `transactions` | `adjustments` | `distributions` | `reorder`
  - analytics: `consumption` | `dead-stock`
  - settings: `supplements` | `warehouses`
- Mỗi tab `React.lazy` import page gốc + `Suspense` → chỉ tab active mới gọi data.
- Tab `settings` chỉ hiện cho role có quyền (super_admin/owner/hotel_manager/department_manager).
- Mobile + tab `overview` → render `MobileInventoryDashboard` nguyên bản.
- Header có `DropdownMenu` "Thao tác": Nhập / Xuất / Chuyển / Kiểm kê / Thêm tài sản.

## Tương thích
- Toàn bộ route con (`/inventory/transactions`, `/items`, `/inventory/inbound/new`, `/supplements`, `/settings/warehouses`, …) giữ nguyên — bookmark/QR cũ không vỡ.
- Khi cần deep-link vào sub-tab: `/inventory?tab=operations&sub=distributions`.

## Section component
- `src/components/inventory/InventoryOverviewSection.tsx` chứa nội dung Tổng quan cũ (Hero, KPI, LowStock, Chart, Alerts, RecentTx). Có thể reuse ở chỗ khác nếu cần.

## Khi thêm tab mới
- Thêm enum vào `MainTab` + sub union, thêm `<TabsTrigger>` + `<TabsContent>` lazy-load.
- Đừng nhồi thêm mục vào sidebar — luôn dùng tab.
