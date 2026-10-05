---
name: Inventory Hub Task-First v3
description: /inventory v3 — InventoryTodoCard lên đầu (gộp phiếu xuất/sắp hết/đề xuất/kiểm kê chờ), 2 CTA primary Nhập+Xuất ngay header, KPI 4 ô đồng cỡ nhãn vận hành, lazy HotelBreakdown, ẩn breadcrumb ở Overview
type: design
---

## Layout Overview (`/inventory?tab=overview`)
1. `InventoryTodoCard` — danh sách "Việc cần làm hôm nay" (chấm màu + CTA per row).
   Nguồn: `useInventoryHubBadges` (distributionsPending / reorderPending / adjustmentsPending) + `useLatestConsumptionSnapshots` (forecastSoonOut <7d).
   Trống → state "Mọi thứ đang ổn" (emerald).
2. `InventoryKpiGrid` v3 — 4 ô đồng cỡ (Giá trị tồn / Loại hàng / Sắp hết 7 ngày / Tồn lâu >3 tháng). KHÔNG còn hero gradient.
3. Bento 12-col: Chart 8 + Forecast 4 + TopConsumed 7 + CombinedStockAlerts 5.
4. RecentTransactions full width.
5. `InventoryHotelBreakdown` — **lazy** (`React.lazy + Suspense`), self-guard chain mode.

## Header (cả desktop & mobile)
- Bỏ Dropdown "+ Thao tác" gộp.
- 2 nút primary: `Nhập kho` + `Xuất kho` (h-10 mobile / h-9 desktop, ≥44px touch).
- Dropdown `Khác` chứa: Chuyển kho · Kiểm kê · Thêm tài sản.
- Breadcrumb chỉ hiển thị khi `tab !== 'overview'`.

## Naming (nhãn dễ hiểu)
| Cũ | Mới |
|---|---|
| Số SKU | Loại hàng |
| Sắp hết · <7 ngày | Sắp hết (7 ngày) |
| Cần đặt lại | (đã chuyển vào TodoCard "đề xuất đặt hàng chờ duyệt") |
| Tồn ứ đọng ≥90d | Tồn lâu (>3 tháng) |
| Tổng giá trị tồn kho | Giá trị tồn kho |

## Files
- `src/components/inventory/hub/InventoryTodoCard.tsx` (mới)
- `src/components/inventory/hub/InventoryKpiGrid.tsx` (rewrite — 4 tile)
- `src/components/inventory/InventoryOverviewSection.tsx` (rewrite — thứ tự mới + lazy breakdown, bỏ CompactActionBar khỏi overview)
- `src/pages/inventory/InventoryDashboardPage.tsx` (header 2 CTA + Khác, ẩn breadcrumb overview)

## Giữ nguyên (không đụng nghiệp vụ)
- RPC, schema, permission, distribution flow, atomic stock.
- Sidebar 5 nhóm × 14 mục con và sub-tabs giữ y nguyên (deep-link cũ vẫn chạy).
- `MobileInventoryDashboard` cho mobile overview giữ nguyên.

## Memory liên quan (kế thừa / thay)
- Thay `design/inventory-hub-desktop-v3` (hero gradient bento) ở phần Overview.
- Bổ sung cho `ux/inventory-hub-consolidation-v1` và `design/inventory-hub-v2-layout`.
