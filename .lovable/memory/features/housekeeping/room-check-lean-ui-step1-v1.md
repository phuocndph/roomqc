---
name: RoomCheck Lean v1 — UI Step 1 Overview + Quick Path + Resume
description: Lean Overview screen ở /rooms/:id/check-lean. ResumeDraftSheet (bottom sheet, no-auto-restore), LeanContextCard (timeAgo · Ổn / cần chú ý), LeanChecklistPreview (group only), QuickPathConfirmSheet. CTA sticky footer 56/52px, body 18px, room name 28px. daily/periodic có quick path; checkin/checkout chỉ "Bắt đầu kiểm tra kỹ".
type: feature
---

# RoomCheck Lean — Step 1 (UI)

## Route
- `/rooms/:id/check-lean?type=daily|periodic|checkin|checkout|maintenance` — Lean Overview
- `/rooms/:id/check?type=...` — wizard cũ (giữ làm fallback Inspection cho prompt sau)

## Components mới
- `src/components/rooms/lean/ResumeDraftSheet.tsx` — bottom sheet TTL 24h, không auto-restore. CTA dọc: "Tiếp tục làm dở" / "Làm lại từ đầu" / link "Xem lại thông tin phòng". Khoá tap-outside.
- `src/components/rooms/lean/LeanContextCard.tsx` — title "Lần kiểm gần nhất" + "{timeAgo} · Ổn|Có N điểm cần chú ý" + 1 note ngắn + link "Xem thêm". Lỗi context: amber banner, KHÔNG chặn flow.
- `src/components/rooms/lean/LeanChecklistPreview.tsx` — chỉ NHÓM (linen, consumable, equipment, furniture) + đếm. Không liệt kê item.
- `src/components/rooms/lean/QuickPathConfirmSheet.tsx` — bottom sheet "Xác nhận phòng ổn", primary "Gửi nhanh" 56px, secondary "Quay lại kiểm tra kỹ" 52px. State loading "Đang gửi...", error inline thân thiện.

## Page
- `src/pages/rooms/RoomCheckOverviewPage.tsx` — Step 1 Overview. Header phòng 28px, type label + tên khách. Progress "Bước 1/3 — Xem nhanh phòng". Body: Context Card → Checklist Preview. Sticky footer pb safe-area.
  - daily/periodic + `quick_path_enabled`: primary "Phòng ổn, gửi nhanh" + secondary "Bắt đầu kiểm tra"
  - checkin/checkout/maintenance: chỉ "Bắt đầu kiểm tra kỹ"
  - photoMode='always' → Quick path bị redirect sang inspection (toast cảnh báo).

## Typography & touch targets (Lean rules)
- Room name 28px bold; header label 16px muted.
- Body 18px, secondary 16px, helper 14px.
- Primary CTA height 56px, secondary 52px, gap 12px, full-width xếp dọc.
- Tap target tối thiểu 52px ở mọi hàng tương tác.

## State handling
- Loading: header + 3 skeleton blocks, không hiện CTA.
- Error full screen: "Không mở được thông tin phòng này" + 2 CTA "Thử lại" / "Quay về danh sách việc".
- Context error: chỉ banner amber trong vùng card, vẫn cho tiếp tục.
- Quick path error: hiển thị inline trong sheet, không đóng sheet.

## Wiring
- `useRoom`, `useRoomBooking` để header.
- `useQuickRoomCheck` cho submit nhanh; `useHotelPhotoMode` để quyết định cho phép gửi rỗng ảnh.
- `useRoomCheckLeanConfig` cho `quick_path_enabled`.
- ResumeDraftSheet đọc `localStorage[room-check-{id}]` (TTL 24h). Khi user "Tiếp tục" → navigate sang `/rooms/:id/check?type=...&resume=true` (wizard cũ tự restore).

## Cố ý KHÔNG làm
- Không tự restore draft.
- Không hiển thị từng item trong preview.
- Không 2 nút đối nghịch ngang. Luôn xếp dọc.
- Không cleanliness score, không signature, không VIP, không Phase1Confirm trong Overview.
