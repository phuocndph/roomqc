---
name: RoomCheck Lean UI Step 2 v1
description: Trang /rooms/:id/check-lean/inspection — DefaultOK grouped, LeanReportIssueSheet 2 tầng (3 lựa chọn L1), minibar inline stepper, autosave qua useLeanDraft 24h
type: feature
---

# Step 2 Inspection (Lean)

## Route
- `/rooms/:id/check-lean/inspection?type=daily|periodic|checkin|checkout|maintenance&resume=true`
- Step 1 (`RoomCheckOverviewPage.goInspection`) chuyển trực tiếp sang route này (không còn fallback wizard cũ).

## Components
- `src/pages/rooms/LeanInspectionPage.tsx` — page chính
- `src/components/rooms/lean/LeanReportIssueSheet.tsx` — bottom sheet 2 tầng:
  - **L1**: đúng 3 nút lớn: `damaged_lost`, `missing_replace`, `consumed_chargeable`
  - **L2**: stepper 56×56, ảnh (Chụp/Chọn từ máy), Tính phí khách (Có/Không), notes
  - Map sang `kind`: damaged_lost→damaged, missing_replace→missing, consumed_chargeable→consumed
- `src/hooks/useLeanDraft.ts` — autosave debounced 800ms, key `room-check-{id}`, TTL 24h.

## State management
- `issues: Record<itemId, LeanIssue>` — 1 issue/item, edit lại = mở sheet với `initial`.
- `minibar: Record<itemId, qty>` — inline stepper, KHÔNG mở sheet.
- `startedAtRef` — set khi mở page, dùng cho conflict check khi submit.
- `draftPayload` = `{ startedAt, issues, minibar }` lưu localStorage.

## Item grouping (5 nhóm cứng)
1. Khăn & linen — `item_type === 'linen'`
2. Phòng tắm — regex tên item / category
3. Thiết bị — `equipment | furniture`
4. Minibar — `is_chargeable === true && (consumable | tên category match /minibar/i)` (DB không có cột `is_minibar` — heuristic này thay thế)
5. Khác — catch-all

## Conditional rendering
- Minibar inline chỉ hiện khi `checkType ∈ {checkout, daily}`. Các loại khác coi minibar như item thường (mở sheet).
- Photo required do `useRoomCheckLeanConfig` quyết theo từng L1.

## UI rules
- Row >= 56px, stepper 56×56, CTA chính 56px, secondary 52px.
- Save status line: `Đang lưu...` / `Đã lưu lúc HH:mm` / `Chưa lưu` / error message Vietnamese.
- Sticky footer Tiếp tục → `/rooms/:id/check-lean/review` (Step 3 ở prompt sau).

## Cố ý KHÔNG làm trong Lean
- Không Phase1Confirm
- Không laundry-special / dispute / VIP / compensation
- Không stock warning trong sheet (đẩy về Step 3)
- Không multi-issue/item (1 issue/item, edit lại để đổi)
