# Quy chuẩn góc giao diện

| Thành phần | Class | Bán kính |
| --- | --- | --- |
| Thẻ thống kê, khung nội dung, bảng dữ liệu | `rounded-panel` | 0px |
| Nút, ô nhập, ô chọn | `rounded-control` | 4px |
| Menu, hộp thoại, tooltip | `rounded-overlay` | 4px |
| Nhãn trạng thái | `rounded-badge` | 2px |
| Avatar, chấm trạng thái, radio, nút chat nổi | `rounded-full` | Tròn |

Các token nằm trong `src/index.css` và được ánh xạ trong `tailwind.config.ts`.
Các class cũ `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl` dùng cho
khung nội dung được ánh xạ về 0px; `rounded-md` dùng 4px, `rounded-sm` dùng 2px.
Khi thêm thành phần mới, dùng class theo chức năng ở bảng trên.
Giữ đường viền và focus ring để phân biệt vùng nội dung và thao tác bàn phím.
