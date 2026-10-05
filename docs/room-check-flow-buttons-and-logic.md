# Kiểm tra phòng (Room Check) — Logic luồng & danh sách nút chi tiết

**Phiên bản:** Lean v1 (rollout đang ON, default per-hotel)  
**Ngày cập nhật:** 03/05/2026  
**Phạm vi:** Toàn bộ flow `/rooms/:id/check` của webapp hiện tại.

---

## 0. Bản đồ tổng

```
              ┌──────────────────────────┐
URL gốc       │  /rooms/:id/check        │
              │   RoomCheckRouter.tsx    │
              └──────────┬───────────────┘
                         │
       ┌─────────────────┴─────────────────┐
       │                                   │
   Lean route                       Wizard cũ (legacy)
   /rooms/:id/check-lean            /rooms/:id/check
   (default)                         dùng khi:
       │                              - type=replenish | delivery
       │                              - distribution_order_id / room_order_id
       │                              - inspection
       │                              - hotel tắt use_lean
       │
       ▼
 Step 1 Overview ──► Step 2 Inspection ──► Step 3 Review ──► Success
   (overview)         (inspection)          (review)         (success)
       │
       └──► Quick Path (1 chạm: "Phòng ổn, gửi nhanh")
              chỉ daily/periodic, có Undo 10s
```

3 RPC nghiệp vụ trung tâm (đều atomic, audit log, tenant guard):

| RPC | Mục đích |
|---|---|
| `perform_quick_room_check` | Quick Path 1 chạm |
| `submit_room_check_lean`   | Submit chuẩn từ Step 3 Review |
| `undo_quick_room_check`    | Hoàn tác Quick trong cửa sổ 10s |
| `reopen_room_check`        | Manager mở lại bản kiểm đã gửi |
| `get_last_room_check`      | Đọc lần kiểm gần nhất cho Context Card |

Per-hotel config: `settings.room_check.use_lean`, `quick_path_enabled`, `photo_required_*`.

---

## 1. RoomCheckRouter — `/rooms/:id/check`

**File:** `src/pages/rooms/RoomCheckRouter.tsx`

### Logic redirect
1. Đợi load `room` + `useRoomCheckLeanConfig(hotelId)` (tránh flash sai hướng).
2. Đọc query string:
   - `type=replenish | delivery` → **giữ wizard cũ** (`RoomCheckPage`).
   - Có `distribution_order_id | room_order_id | inspection` → **giữ wizard cũ**.
3. Else đọc per-hotel flag `use_lean` (default `true`):
   - `true` → `<Navigate replace to="/rooms/:id/check-lean?{qs giữ nguyên}" />`.
   - `false` → render wizard cũ.

### Nút trên màn hình
*Không có nút riêng* — đây là router lazy-load, fallback `null` khi đợi.

---

## 2. Step 1 — Overview Lean — `/rooms/:id/check-lean`

**File:** `src/pages/rooms/RoomCheckOverviewPage.tsx`  
**Mục tiêu:** Cho user (đa số U50, dùng mobile dọc) thấy nhanh trạng thái phòng và chọn 1 trong 2 đường: gửi nhanh hay kiểm chi tiết.

### Header
| Nút | Hành động | Logic |
|---|---|---|
| `←` (`ChevronLeft`) | `navigate(-1)` | Quay lại danh sách việc; smart fallback nếu không có history. |
| Tiêu đề `Phòng {room_number}` | (không bấm) | Font 28px, bold. |
| Subtitle | hiển thị `{CHECK_TYPE_LABEL[type]} · Khách: {guest_name?}` |  |
| Progress text | "Bước 1/3 — Xem nhanh phòng" |  |

### Banner xung đột phiên (realtime)
Hiển thị khi `useRoomCheckSession(roomId)` phát hiện `session.user_id !== currentUser.id`.
- Nội dung: "{Tên người khác} đang kiểm phòng này" + thời lượng phiên.
- Nút **`Tiếp quản phiên`** *(chỉ hiện cho Manager / Admin)*  
  → gọi `takeOverSession()` → tạo session mới mang user hiện tại → navigate sang Inspection.

### Body
- `LeanContextCard` — đọc `get_last_room_check` → hiển thị lần kiểm gần nhất, có nút `Xem chi tiết phòng`.
- `LeanChecklistPreview` — group items theo `linen / consumable / equipment / furniture`, đếm số mục.

### ResumeDraftSheet (auto)
- Đọc localStorage key `room-check-{roomId}` qua `readLeanDraft()`.
- Nếu có draft <24h → tự bung sheet bottom với:
  - **`Tiếp tục bản nháp`** → `ensureSession()` → navigate Inspection với `?resume=true`.
  - **`Bỏ và làm lại`** → ở lại Overview, draft sẽ bị overwrite ở submit lần sau.
  - **`Xem thông tin phòng`** → navigate `/rooms/:id`.

### Sticky footer (thumb-zone)
Phụ thuộc `allowQuickPath = (type ∈ {daily, periodic}) && cfg.quick_path_enabled`.

| Trường hợp | Nút Primary | Nút Secondary |
|---|---|---|
| `daily` / `periodic`, có Quick | **`Phòng ổn, gửi nhanh`** (h=56) → mở `QuickPathConfirmSheet` | **`Bắt đầu kiểm tra`** → `goInspection()` |
| `checkin` / `checkout` / `maintenance` hoặc Quick disabled | **`Bắt đầu kiểm tra kỹ`** | (none) |

Cả hai đều bị `disabled` khi `isOtherSession && !canTakeOver` (chống xung đột).

### `goInspection()` — logic vào Inspection
1. Nếu phiên đang bị người khác giữ và không có quyền tiếp quản → toast "Phòng đang được người khác kiểm tra." Dừng.
2. `ensureSession()`:
   - Có session là của mình → tiếp tục.
   - Có session người khác + Manager → cho qua (sẽ takeover ở bước riêng).
   - Chưa có session → `createSession(roomId, sessionType, fullName, tenantId)` (`periodic` map về `daily` cho bảng session vốn không có `periodic`).
3. `navigate('/rooms/:id/check-lean/inspection?type=...')`.

### `QuickPathConfirmSheet` (mở từ "Phòng ổn, gửi nhanh")
- Cảnh báo "Bạn xác nhận phòng đang ổn?".
- **`Xác nhận, gửi`** (primary) → `handleQuickConfirm()`:
  1. Nếu `photoMode === 'always'` → toast "yêu cầu chụp ảnh", đóng sheet, chuyển sang `goInspection()`.
  2. Gọi `useQuickRoomCheck.mutateAsync({ roomId, checkType, photos: [] })` → RPC `perform_quick_room_check`.
  3. Best-effort `deleteSession()` (Quick không qua submit_lean nên cần dọn).
  4. `navigate('/rooms/:id/check-lean/success?type=...&issues=0&checkId=...&quick=1', { replace: true })`.
  - Lỗi: hiển thị inline `Mạng yếu, thử lại hoặc kiểm tra kỹ.` Map cụ thể: `photo_required`, `quick_path_disabled`, `quick_rate_limited:N`, `quick_path_not_allowed`, `forbidden_tenant`, `room_not_found`.
- **`Quay lại kiểm kỹ`** → đóng sheet và `goInspection()`.
- **`Huỷ`** → đóng sheet, không gọi mạng.

---

## 3. Step 2 — Inspection — `/rooms/:id/check-lean/inspection`

**File:** `src/pages/rooms/LeanInspectionPage.tsx`  
**Triết lý:** *Default-OK*. Mọi mục mặc định là Ổn — chỉ chạm khi có vấn đề.

### Khởi tạo state
- `startedAt` (ref) = `new Date().toISOString()` — dùng cho `submit_room_check_lean` để conflict-check.
- Hydrate từ localStorage nếu URL có `?resume=true`.
- Auto-mở `LeanReportIssueSheet` cho item nếu URL có `?edit={itemId}` (về từ Step 3).
- Enrich items: query `items` để lấy `item_type`, `unit_price`, `is_chargeable`, `category`. Suy luận `is_minibar` = `is_chargeable && (consumable || tên category chứa "minibar")`.
- Group items theo: `linen / bathroom / equipment / minibar / other` — chỉ render group có item.

### Realtime takeover
Nếu `useRoomCheckSession.session.user_id !== currentUser.id` → coi như bị tiếp quản:
- Hiện toast warning duy nhất 1 lần.
- Sau 4s redirect về Overview.
- Đồng thời render **overlay full-screen** chặn thao tác, có nút `Quay lại tổng quan`.

### Header
| Nút | Hành động |
|---|---|
| `←` | `navigate(-1)` |
| Tiêu đề | `Kiểm tra phòng {room_number}` (22px) |
| Subtitle | "Bước 2/3 — Ghi nhận vấn đề" |
| **`Lưu tạm`** (góc phải) | `saveNow()` qua `useLeanDraft` → toast "Đã lưu tạm." |

Dòng status: `Đang lưu... / Đã lưu lúc HH:MM / Chưa lưu / Chưa lưu tạm được. Thông tin bạn vừa nhập vẫn còn trên máy này.`

### Body — danh sách item theo group

Mỗi group là card có header `LABEL · n mục`. Trong group có 2 dạng row:

#### 3.1. Row mặc định (item thường)
- Vùng bấm chính (`button` chiếm full row, min-h 64) → mở `LeanReportIssueSheet` cho item:
  - Hiện `Có vấn đề` (badge bên phải) khi chưa có issue.
  - Hiện trạng thái issue khi đã ghi: `{issueLabel} · SL {qty} · {n} ảnh` (text vàng/amber).
- Khi có issue, có thêm nút phụ **`Bỏ`** (tách riêng tránh nested) → `removeIssue(itemId)` xoá issue.
- Khi chưa có issue → text dưới tên item là `Ổn` (xanh).

#### 3.2. Row minibar inline (chỉ khi `checkType ∈ {checkout, daily}` và item.is_minibar và chưa có issue)
- Hiển thị tên + "Chưa dùng" / "Đã dùng N".
- Khi `qty === 0`: nút **`Đã dùng`** (border, h=44) → set qty=1.
- Khi `qty >= 1`: cụm stepper:
  - **`−`** (56×56, bold 24px) → `setMinibarQty(itemId, max(0, qty-1))` (về 0 sẽ xoá khỏi minibar map).
  - Số lượng (font 22px tabular-nums).
  - **`+`** (56×56) → tăng 1.
- Nếu user muốn báo "hỏng/mất/thiếu" cho item minibar → vẫn được, nhưng phải bấm vào card khác (vì row inline không mở sheet). *(Hiện UX: minibar deep mode chỉ cho count consumed; báo lỗi minibar cần chuyển sang flow chuẩn — đây là giới hạn đã biết.)*

### Empty state
"Phòng này chưa có danh mục đồ. Bạn vẫn có thể tiếp tục để gửi kiểm phòng."

### Sticky footer
- **`Tiếp tục`** (h=56) — luôn enable, hiển thị badge `· N sự cố` nếu N>0  
  → `saveNow()` rồi `navigate('/rooms/:id/check-lean/review?type=...&started=...')`.

### `LeanReportIssueSheet` (mở từ row item)
**File:** `src/components/rooms/lean/LeanReportIssueSheet.tsx`. Bottom sheet 2 tầng.

**L1 — chọn loại vấn đề (3 ô lớn 72px):**
| Nút | `level1` | `kind` map | Default `chargeToGuest` |
|---|---|---|---|
| **`Đồ hỏng / mất`** | `damaged_lost` | `damaged` | `false` *(Manager duyệt sau)* |
| **`Thiếu / cần thay`** | `missing_replace` | `missing` | — (ẩn toggle) |
| **`Khách đã dùng / cần ghi nhận`** | `consumed_chargeable` | `consumed` | `true` |

**L2 — form tối giản:**
- **`← Đổi loại vấn đề`** → quay về L1.
- Stepper số lượng: **`−`** (56×56, disabled khi =1), số (32px), **`+`** (56×56).
  - Cảnh báo amber khi `qty > standardQuantity`.
- Khu ảnh:
  - Grid ảnh đã chọn, mỗi ảnh có nút `×` xoá.
  - 2 nút label-input (h=52):
    - **`Chụp ảnh`** (`<input capture="environment">`) → `useImageUpload.uploadImage(file, tenantId)`.
    - **`Chọn từ máy`** (`<input type=file>`).
  - Photo required theo per-hotel: mặc định bật cho `damaged_lost`, tắt cho 2 nhánh còn lại. Nếu required và chưa có ảnh → text đỏ + Submit disabled.
- Toggle **`Tính phí khách?`** (`Có` / `Không`, 56×56) — chỉ hiện cho `damaged_lost` + `consumed_chargeable`.
- Textarea ghi chú.
- Footer:
  - **`Lưu mục này`** (h=56) → `onSubmit({ level1, kind, quantity, photos, chargeToGuest, notes })` → đóng sheet.
    - Validate: `quantity >= 1`, ảnh nếu required.
  - **`Huỷ`** (h=52) → đóng sheet không lưu.

Kết quả issue lưu vào `issues[itemId]` của Inspection page.

---

## 4. Step 3 — Review — `/rooms/:id/check-lean/review`

**File:** `src/pages/rooms/LeanReviewPage.tsx`

### Khởi tạo
- Đọc draft localStorage 1 lần qua `readLeanDraft()` + `sanitizeLeanDraft()` (loại bỏ field không hợp lệ — chuẩn user U50).
- Tách: `issues = Object.values(draft.issues)`, `minibar = entries(qty>0)`.
- Tính `okCount = totalItems - issueCount`.

### Header
| Nút | Hành động |
|---|---|
| `←` | `handleBackToInspection()` → `navigate(.../inspection?type=...&resume=true)` |
| Tiêu đề | `Phòng {room_number}` |
| Subtitle | "Bước 3/3 — Gửi kết quả kiểm tra" |

### Body
1. **Card Tổng kết** — 3 cell to:
   - `okCount` (xanh) "mục ổn".
   - `issueCount` (amber) "vấn đề".
   - `minibarCount` (neutral) "minibar".
   - Nếu rỗng tuyệt đối → text xanh "Không có vấn đề nào. Phòng sạch."

2. **Vấn đề đã ghi nhận** — list card. Mỗi card:
   - Tên item, label vấn đề, SL, có hiển thị `Tính phí khách` nếu true.
   - Notes (line-clamp 2).
   - Thumbnail ảnh (tối đa 4 + ô `+N`).
   - Khi có lỗi `errorItemId === item.id`: viền destructive + ring + text "Mục này cần được sửa trước khi gửi."
   - Nút **`Sửa lại`** (border-2, h=44) → navigate Inspection với `?resume=true&edit={itemId}` (Step 2 sẽ auto mở sheet).

3. **Minibar đã dùng** — list các dòng `Tên × N`.

4. **Ghi chú chung** — Textarea (3 rows) tuỳ chọn.

5. **`LeanInlineError`** hiển thị khi `submitError` — có nút inline `Thử lại` gọi lại `handleSubmit()`.

### Sticky footer
- **`Gửi kết quả kiểm tra`** (h=56, primary) → `handleSubmit()`.
- **`Quay lại sửa`** (h=52, outline) → `handleBackToInspection()`.

### `handleSubmit()` — chi tiết
1. `preSubmitValidate({ issues, config: leanCfg })` (client) — kiểm:
   - `quantity > 0`.
   - Per-bucket photo required theo `cfg.photo_required_damaged_lost / missing_replace / consumed_chargeable`.
   - Nếu fail → setSubmitError + scroll & focus card lỗi.
2. Group issues theo `kind`:
   - `itemsDamaged`, `itemsLost`, `itemsMissing`, `itemsConsumed`.
   - `itemsConsumed` cộng thêm các minibar (qty, `charge_to_guest=true`, `source: 'minibar'`, `photos: []`).
3. `useSubmitRoomCheckLean.mutateAsync(...)` → RPC `submit_room_check_lean`:
   - Atomic: insert `room_checks` + items vào jsonb buckets, conflict check `started_at`, audit log `lean_submit`.
   - Map lỗi qua `mapLeanError()` → trả `Error.itemId` để UI scroll.
4. Success:
   - `clearLeanDraft(roomId)` xoá localStorage.
   - `navigate('/rooms/:id/check-lean/success?type=...&issues=N&checkId=...', { replace: true })`.
5. Error:
   - Hiển thị inline + scroll tới item lỗi nếu có `itemId`.

---

## 5. Success — `/rooms/:id/check-lean/success`

**File:** `src/pages/rooms/LeanSuccessPage.tsx`

### Hiển thị
- Icon `CheckCircle2` xanh, 72×72.
- Tiêu đề "Đã gửi kết quả kiểm tra phòng."
- Phòng + loại kiểm + thời gian gửi.
- Box xanh ("Phòng đã được xác nhận ổn.") nếu `issues=0`, hoặc box amber `"N vấn đề đã được ghi nhận."`.

### Cửa sổ Hoàn tác (chỉ Quick Path)
Khi `?quick=1` và `checkId` có giá trị:
- Hiện text **`Hoàn tác (10s)`** (đỏ, underline) — countdown 1s/lần.
- Bấm → `useUndoQuickRoomCheck.mutateAsync({ checkId, reason: 'undo from success screen' })` → RPC `undo_quick_room_check`.
- Sau khi undo OK → `navigate('/rooms/:id/check-lean?type=...', { replace: true })` (về Overview, có thể kiểm lại).
- Hết 10s → ẩn nút.

### CTA cuối
- **`Quay về danh sách việc`** (primary, h=56) → `navigate('/my-tasks', { replace: true })`.
- **`Xem kết quả vừa gửi`** (outline, h=52) → `navigate('/rooms/:id')` (chỉ khi có `checkId`).

---

## 6. Quick Path — chi tiết

| Bước | Hành vi |
|---|---|
| Trigger | Nút "Phòng ổn, gửi nhanh" ở Overview (chỉ daily/periodic). |
| Pre-check | `cfg.quick_path_enabled`. Nếu `photoMode === 'always'` → ép sang Inspection. |
| RPC | `perform_quick_room_check(_room_id, _check_type, _notes, _photos)` |
| Side-effects server | Tenant guard, photo evidence (nếu cấu hình), audit log `quick_submit`, cập nhật last check. Rate limit "không 2 quick liên tiếp trong N phút" (`quick_rate_limited:N`). |
| UI sau khi OK | Success screen có Undo 10s. |
| Undo | `undo_quick_room_check(_check_id, _reason)` — Lean hỗ trợ undo trong cửa sổ. |

---

## 7. Manager — Reopen room check

**Hook:** `useReopenRoomCheck` (`useRoomCheckLean.ts`).  
**Trigger:** Component `ReopenCheckDialog` ở màn xem chi tiết kiểm.  
**Logic:**
- Manager nhập lý do, gọi `reopen_room_check(_check_id, _reason)`.
- Server set status về `reopened`, audit log, gửi notification về staff đã submit.
- Invalidate query `room-checks` + `last-room-check`.

---

## 8. Bảng tổng hợp toàn bộ NÚT

| Màn | Nút | Loại | Hành động |
|---|---|---|---|
| Router | — | — | redirect tự động |
| Overview | `←` | icon | back |
| Overview | `Tiếp quản phiên` | outline | takeOverSession + nav Inspection |
| Overview | `Phòng ổn, gửi nhanh` | primary | mở QuickPathConfirmSheet |
| Overview | `Bắt đầu kiểm tra` / `Bắt đầu kiểm tra kỹ` | primary/outline | ensureSession + nav Inspection |
| ResumeDraftSheet | `Tiếp tục bản nháp` | primary | nav Inspection ?resume=true |
| ResumeDraftSheet | `Bỏ và làm lại` | outline | đóng sheet |
| ResumeDraftSheet | `Xem thông tin phòng` | text | nav `/rooms/:id` |
| QuickPathConfirmSheet | `Xác nhận, gửi` | primary | RPC quick → nav Success |
| QuickPathConfirmSheet | `Quay lại kiểm kỹ` | outline | nav Inspection |
| QuickPathConfirmSheet | `Huỷ` | text | đóng |
| Inspection | `←` | icon | back |
| Inspection | `Lưu tạm` | text-button | saveNow + toast |
| Inspection (row) | `Có vấn đề` (chính) | badge-button | mở `LeanReportIssueSheet` |
| Inspection (row) | `Bỏ` | text | xoá issue |
| Inspection (minibar) | `Đã dùng` | outline | qty=1 |
| Inspection (minibar) | `−` / số / `+` | stepper | giảm/tăng qty |
| Inspection | `Tiếp tục` | primary | saveNow + nav Review |
| Takeover overlay | `Quay lại tổng quan` | primary | nav Overview |
| Issue Sheet L1 | 3 nút loại | card-button | chọn level1 |
| Issue Sheet L2 | `← Đổi loại vấn đề` | outline | reset L1 |
| Issue Sheet L2 | `−` / số / `+` | stepper | qty |
| Issue Sheet L2 | `Chụp ảnh` | label-input | upload (capture camera) |
| Issue Sheet L2 | `Chọn từ máy` | label-input | upload từ thư viện |
| Issue Sheet L2 | `×` (trên ảnh) | icon | xoá ảnh |
| Issue Sheet L2 | `Có` / `Không` (Tính phí) | toggle | set chargeToGuest |
| Issue Sheet L2 | `Lưu mục này` | primary | onSubmit + đóng |
| Issue Sheet L2 | `Huỷ` | outline | đóng |
| Review | `←` | icon | back Inspection (resume) |
| Review (issue card) | `Sửa lại` | outline | nav Inspection ?edit={itemId} |
| Review | `Gửi kết quả kiểm tra` | primary | preValidate + RPC submit_lean → Success |
| Review | `Quay lại sửa` | outline | back Inspection (resume) |
| Review (error) | `Thử lại` | inline | retry handleSubmit |
| Success | `Hoàn tác (Ns)` | text-destructive | RPC undo + nav Overview |
| Success | `Quay về danh sách việc` | primary | nav `/my-tasks` |
| Success | `Xem kết quả vừa gửi` | outline | nav `/rooms/:id` |

---

## 9. State machine tóm tắt

```
[Overview]
   │
   ├── Quick:  perform_quick_room_check ──► [Success?quick=1]
   │                                            └── undo_quick_room_check ──► [Overview]
   │
   └── Inspection ◄──┐
         │            │ (Sửa lại / Quay lại sửa, hydrate localStorage)
         ▼            │
       [Review] ──────┘
         │
         └── submit_room_check_lean ──► [Success]
                                            └── (manager) reopen_room_check
```

## 10. Bảo vệ dữ liệu (sống còn)

- **Tenant isolation**: tất cả RPC kiểm `tenant_id` server-side; client query đều `eq('tenant_id', tenantId)`.
- **Concurrent edit**: dùng `room_check_sessions` realtime, chỉ Manager/Admin được takeover.
- **Atomicity**: insert + jsonb buckets đi qua 1 RPC, chống half-write.
- **Audit log**: mọi `quick_submit / lean_submit / undo / reopen / settings change` đều ghi `audit_log`.
- **Offline-tolerant**: `useLeanDraft` lưu localStorage 24h, có resume sheet, submit có retry và bảo toàn nhập tạm khi mạng yếu.
- **Photo enforcement**: bắt buộc per-bucket theo `settings.room_check.photo_required_*`, default chỉ ép `damaged_lost`.
- **Quick rate limit**: server chặn 2 Quick liên tiếp trong N phút (mặc định 30).

## 11. Hằng số UI quan trọng (đã chuẩn hoá)

| Thông số | Giá trị |
|---|---|
| Tap target tối thiểu | 44px |
| Nút chính (footer) | 56px |
| Nút stepper | 56×56 |
| Font heading màn chính | 28px (Overview), 22px (Inspection/Review) |
| Font body | 16px |
| Footer thumb-zone | `pb-[calc(env(safe-area-inset-bottom)+12px)]` |
| Undo window (Quick) | 10.000 ms |
| Draft TTL | 24h (localStorage) |
| Takeover redirect | 4s |

---

*File: `docs/room-check-flow-buttons-and-logic.md`. Đồng bộ với code commit ngày 03/05/2026.*
