---
name: Outbound Hub Consolidation v1
description: Trang Xuất kho gộp 2 view List+Manual, banner Yêu cầu bổ sung mở mặc định và tạo phiếu inline ngay tại banner, không chuyển view
type: feature
---

## Cấu trúc tab `/inventory?tab=operations&sub=outbound`

- **Sub-tabs hiển thị**: chỉ 2 — `view=list` (Danh sách phiếu, default) | `view=manual` (+ Tạo phiếu mới).
- **`view=from-requests`** legacy: useEffect ở `InventoryDashboardPage` tự redirect về `view=list`. Tab `list` luôn render `DistributionOrdersPage`.
- Badge `distributionsPending` chỉ hiện ở cấp 2 ("Xuất kho"), KHÔNG lặp lại ở cấp 3.

## Logic submit (OutboundPage)

- `from_warehouse_id` optional khi `transaction_category === 'room_assign'` (room_assign dùng `useDistributionForm` riêng).
- 3 mutation pending hợp nhất → `isAnyPending` cho mọi nút submit.
- Sau success: toast + `form.reset()`/`distributionForm.reset()` + `goToList()` (chuyển `view=list`), KHÔNG `navigate()` ra ngoài hub.
- Lỗi thiếu phòng/sản phẩm/lô giặt: `toast.error()` thay vì `return` im lặng.
- Bỏ emoji 🏠🧺🔧🗑️➖ ở SelectItem.

## DistributionOrdersPage header

- **KHÔNG** còn nút dropdown "Tạo phiếu mới" (cả mobile + desktop). Tab `+ Tạo phiếu mới` của hub Xuất kho đã thay thế.
- Header chỉ còn: tiêu đề + nút Refresh.
- `EmptyState` của tab `todo`/`all` giữ inline button "Tạo phiếu mới" → `switchView('manual')`.

## PendingSupplementsBanner contract

- `useState(true)` cho `isOpen` — mặc định mở để khoe danh sách yêu cầu ngay khi vào trang.
- **KHÔNG** có nút "Xử lý ngay"; trigger chỉ có chevron expand/collapse.
- Khi `selectedIds.length > 0` render inline form: `Select` nhân viên (`useOnShiftStaffList(selectedHotel?.id)`) + Checkbox "Giao ngay" (enable khi đã chọn nhân viên).
- Submit gọi trực tiếp `useCreateDistributionFromSupplements` (mutation tự toast + invalidate `distribution-orders` + `supplement-requests`); banner thêm invalidate `distribution-routes` để DistributionOrdersPage refresh.
- `onSuccess` reset `selectedIds` + `assignedTo`, KHÔNG đổi URL.

## Legacy redirects (App.tsx)

- `/inventory/distributions/new` → `InventoryHubRedirect tab=operations sub=outbound view=manual`
- `/inventory/distributions/from-supplements` → vào trang standalone `CreateFromSupplementsPage` (không embedded) — giữ làm fallback cho bookmark cũ.
