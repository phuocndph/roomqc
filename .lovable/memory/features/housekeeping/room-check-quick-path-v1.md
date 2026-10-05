---
name: RoomCheck Quick Path & Phase 2 polish
description: Phase 1 (Quick Path 1-tap + Context Card + photo_evidence_mode) + Phase 2 (photo enforcement client+server, DraftResumeBanner, audit ngôn từ Việt, photos forwarding từ ReportIssueSheet vào form). Wizard giữ 6 bước nhưng 80% case daily đi qua chỉ 3 bước thực tế.
type: feature
---

# RoomCheck — Quick Path + Phase 2

## Phase 1
- **RPC `perform_quick_room_check`** + **`get_last_room_check`**
- **`hotels.photo_evidence_mode`** ENUM `none|on_issue|always`
- **`QuickOkButton`** + **`LastCheckContextCard`**

## Phase 2
### Photo enforcement HAI LỚP
- **Client** (`ReportIssueSheet`): đọc `useHotelPhotoMode`, block nút Lưu khi vi phạm.
- **Server** (trigger `enforce_room_check_photos` BEFORE INSERT trên `room_checks`):
  - mode=`always` → cần ≥1 ảnh mọi lần kiểm
  - mode=`on_issue` → cần ảnh khi `items_damaged|lost|missing` không rỗng
  - mode=`none` → bỏ qua
  - Raise `photo_required: ...` (P0001), client map sang toast tiếng Việt thân thiện trong `useCreateRoomCheck.onError`.

### Photos forwarding pipeline
- `ReportIssueSheet` upload ảnh → `IssueAction.photos`
- `DefaultOkItemsCheck.applyIssue` forward qua callback `onPhotosCollected`
- `ItemsCheckStep` gộp vào `form.photos` (dedupe) bằng `setValue('photos', ...)`
- Submit qua `useCreateRoomCheck` → photos[] đi vào DB, qua trigger enforce.

### Autosave
- **Đã tồn tại**: `RoomCheckPage` tự lưu `room-check-${id}` trong localStorage cho mọi field form + step + quickMode (line 426–451), restore qua `resumeCheck()`. Không cần thêm hook mới.

### DraftResumeBanner
- Component reusable trên `CheckTypeStep`, dùng `useRoomCheckSession`.
- Phiên của mình (Tiếp tục/Bỏ) vs người khác (Tiếp quản nếu manager). Stale > 60p → border-amber.

### Audit ngôn từ Việt + bỏ icons (CheckTypeStep)
- Bỏ tất cả `lucide-react` icons. "Chế độ nhanh" → "Kiểm nhanh tổng quan". Label uppercase tracking-wider.

## Files
- DB: trigger `enforce_room_check_photos` + RPCs Phase 1
- `src/components/rooms/check-steps/`:
  - QuickOkButton.tsx, LastCheckContextCard.tsx, DraftResumeBanner.tsx
  - ReportIssueSheet.tsx (photos + enforcement client)
  - DefaultOkItemsCheck.tsx (`onPhotosCollected` callback)
  - ItemsCheckStep.tsx (gộp photos vào form.photos)
  - CheckTypeStep.tsx (audit Việt + bỏ icons + banner)
- `src/hooks/useQuickRoomCheck.ts`, `useHotelPhotoMode.ts`
- `src/hooks/useRoomChecks.ts` (map photo_required onError)
- `src/components/settings/HotelPhotoEvidenceSettings.tsx`

## Còn debt
- Wizard 6→3 bước cứng: hoãn (routing đã skip thông minh, daily thực tế 3 bước).
- Photo enforcement chưa áp dụng cho RPC nội bộ khác (chỉ INSERT room_checks + perform_quick_room_check). Inspection riêng chưa enforce.
