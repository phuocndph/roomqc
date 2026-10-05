---
name: Default-OK Room Check UX
description: Logic kiểm tra phòng đảo ngược + chuẩn minimalist không icon — mặc định Đạt, chỉ chạm vào mục cần xử lý để mở bottom sheet cập nhật tình trạng. Áp dụng cho TẤT CẢ check types.
type: design
---

# Default-OK Room Check UX

## Nguyên tắc
Đảo ngược logic mặc định: mọi item xuất hiện ở trạng thái "Đạt" (không có dấu hiệu thị giác). Nhân viên chỉ tương tác khi có vấn đề — phản ánh đúng thực tế 80/20 buồng phòng.

## Cấu trúc
- **`DefaultOkItemsCheck.tsx`** — component chính, group dọc theo category, không tabs.
- **`ReportIssueSheet.tsx`** — bottom sheet (Sheet side="bottom") gom: chọn tình trạng + số lượng (stepper text +/−) + tạo phiếu bổ sung (switch) + ghi chú.
- Vào qua `ItemsCheckStep.tsx` cho mọi check type.

## Quy chuẩn UI — Enterprise SaaS minimalist

### KHÔNG dùng
- Icon trang trí (`Check`, `AlertCircle`, `X`, `Search`, `AlertTriangle`, `Plus`, `Minus`)
- Emoji (🧺 🔄 ➕ 🚫 🛠️ ⛔ 📦 📭)
- Màu nền sặc sỡ cho card/badge status
- Vòng tròn status circle

### DÙNG
- **`border-l-4`** màu semantic bên trái card thay cho vòng tròn status (transparent khi Đạt)
- **Màu chữ semantic**: `text-green-600` (đạt/thêm), `text-blue-600` (giặt), `text-amber-600/700` (hỏng/thiếu), `text-destructive` (mất), `text-cyan-600` (đã dùng), `text-primary` (thay)
- **Banner trạng thái**: 1 khối `border-l-4` + text 2 dòng, không icon
- **Stepper số lượng**: nút text `+` `−` (không lucide icon)
- **Cảnh báo kho**: chỉ `<p>` với màu chữ, không Alert component có icon

## Tag trạng thái — chuẩn ngôn ngữ
"Đã + động từ" cho hành động đã thực hiện, danh từ cho tình trạng.

| Action | Label |
|---|---|
| `ok` | Đạt |
| `laundry` | Đã giặt |
| `add` | Đã thêm |
| `change` | Đã thay |
| `lost` | Mất |
| `damaged` | Hỏng |
| `missing` | Thiếu |
| `consumed` | Đã dùng |
| `empty` | Hết |

## Bảng ngôn từ chuẩn (KHÔNG dùng cũ → DÙNG mới)

| Cũ | Mới |
|---|---|
| OK | Đạt / Đạt chuẩn |
| Mặc định OK · Chạm để báo sự cố | (bỏ — đã có banner) |
| Báo sự cố | Cập nhật tình trạng / Cập nhật |
| Loại sự cố | Tình trạng |
| sự cố | mục cần xử lý |
| Đã ghi nhận N sự cố | N mục cần xử lý |
| Hỏng / Bẩn (gộp) | tách: **Hỏng** & **Bẩn (cần giặt)** |
| Cần bổ sung từ kho + sub | Tạo phiếu bổ sung từ kho |
| Lưu sự cố | Lưu |
| Bỏ báo cáo (nút X) | Bỏ (text) |

## Loại tình trạng trong sheet (theo `item_type` × `allowedActions`)
- **linen**: laundry (Bẩn cần giặt), change, add, missing, damaged, lost
- **consumable**: consumed, empty, missing, lost
- **equipment / furniture**: damaged, missing, lost

## Touch standards
- Card item ≥56px, toàn bộ chạm được, `active:bg-muted/50`
- Search chỉ hiện khi totalItems > 8, không icon
- Banner đổi semantic theo số mục cần xử lý

## Đã loại bỏ
- `CategoryBasedItemsCheck.tsx`, `CategoryItemRow.tsx` (UI cũ với tabs ngang + drawer phức tạp)
- Dòng tổng kết cuối "X OK · Y sự cố · Tổng Z" (trùng với banner)
