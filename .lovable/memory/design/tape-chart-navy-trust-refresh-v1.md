---
name: Tape Chart Navy Trust refresh v1
description: RoomTapeChart booking bar palette + day header polish + click-row to open room detail
type: design
---

# Tape Chart Navy Trust refresh v1 — Batch 3 / B3

## Hierarchy 3 lớp theo độ chú ý
- **Đang lưu trú** (`checked_in`): `bg-slate-900 text-white border-l-[hsl(var(--primary))]` — nổi bật nhất, là phòng đang có khách
- **Còn nợ sau trả** (`debt_after_checkout`): `bg-red-600 text-white border-l-red-900` — cảnh báo
- **Confirmed (sắp tới)**: tint nhạt + viền trái màu semantic
  - Đã cọc đủ → `bg-emerald-50 border-l-emerald-600 text-emerald-900`
  - Cọc một phần → `bg-amber-50 border-l-amber-600 text-amber-900`
  - Chưa cọc → `bg-orange-50 border-l-orange-500 text-orange-900`
- **Đã trả phòng (quá khứ)**: `bg-slate-100 border-l-slate-400 text-slate-600` — mờ nhất

Tất cả border trái là `border-l-[3px]`, bar `rounded-md` cả 2 đầu (trước đó `rounded-r-md` gây cảm giác "thiếu đầu").

## Day header
- Hôm nay: bg primary/10 + ring primary/40 + chữ primary + underline rounded ở chân
- Cuối tuần (T7/CN): `bg-slate-100/80`
- Ngày lễ VN: `bg-rose-50 text-rose-700` + tên rút gọn ở dưới
- Header sticky: `bg-slate-50/95 backdrop-blur-sm` thay cho `bg-muted/40`

## Room column (cột trái)
- Đổi từ `<div>` thành `<button>` với hover `bg-accent/60`
- Icon `Eye` (lucide) opacity 0 → 100 khi hover
- Click → `navigate('/rooms/:id')` (chi tiết phòng đầy đủ thay vì gắng wire QuickViewEntry cần thêm 3-4 query)

## Source badge trong bar
- Đổi `bg-white/25 text-white` → `bg-black/10 text-current` để hiển thị tốt trên cả bar tối lẫn bar sáng

## Color-blind overlay
- Confirmed bars (light bg): pattern opacity giảm còn 10-12%
- Solid bars (navy/đỏ): pattern màu trắng 10-18%

## Files
- `src/lib/tape-chart.ts` — getBarColor (palette mới)
- `src/components/rooms/RoomTapeChart.tsx` — header, room column button, legend, bar shape, CSS overlay

## Không thay đổi
- Drag-and-drop, context menu, virtualization, KPI strip, TapeChartTodoPanel, TapeChartBookingSheet, BlockDialog, search/filter, shortcuts (← → T [ ])
