# Logic Kiểm Tra Phòng ↔ Quản Lý Kho ↔ Quản Lý Giặt Là

> Tài liệu nội bộ — mô tả **chính xác hành vi hiện tại** của hệ thống Hotel Asset Manager.
> Phạm vi: từ thao tác nút trên Room Check, đến phân loại đồ, đến trừ/cộng kho và vòng đời batch giặt.
> Tham chiếu code: `src/hooks/useRoomChecks.ts`, `src/hooks/useRoomCheckLean.ts`, `src/types/items.types.ts`,
> các migration RPC `atomic_item_*`, `submit_room_check_lean`, `laundry_batch_items_update_inventory`.

---

## 0. Sơ đồ tổng

```text
            ┌─────────────────────────────┐
            │   ROOM CHECK (5 loại)       │
            │ checkin / daily / periodic  │
            │ checkout / maintenance      │
            └──────────────┬──────────────┘
                           │ ghi room_checks
        ┌──────────────────┼─────────────────────────────┐
        │                  │                             │
        ▼                  ▼                             ▼
   ROOM_ITEMS         ITEMS (kho)                 AUTO-CREATE REQUESTS
   (quantity per      quantity_in_stock           - laundry_requests
    room)             quantity_in_laundry         - supplement_requests
                      quantity_lost               - maintenance_requests
                      quantity_damaged
                           │
                           ▼
                     WAREHOUSE_STOCK
                     (kho mặc định
                      của hotel)
                                                        ▼
                                                   LAUNDRY BATCH
                                              draft → delivered → washing
                                              → ready → received
                                              (trigger trừ/cộng items)
```

---

## 1. Phân loại đồ (Item Types)

Định nghĩa chính thức tại `src/types/items.types.ts`:

| Code         | Nhãn VI     | Đặc điểm                                                      | Tác động phổ biến                                       |
| ------------ | ----------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `linen`      | Đồ vải      | Khăn, ga, gối — **giặt đi giặt lại**, có `current_wash_cycles`| `items_sent_to_laundry` → đẩy sang batch giặt           |
| `consumable` | Tiêu hao    | Bàn chải, kem đánh răng, nước, đồ minibar                     | `items_consumed` → trừ kho 1 chiều, có thể tính phí khách |
| `equipment`  | Thiết bị    | Ấm, tivi, điều khiển                                          | `items_damaged` → tự động tạo `maintenance_request`     |
| `furniture`  | Nội thất    | Bàn, ghế, tủ                                                  | `items_damaged` → tự động tạo `maintenance_request`     |

Thuộc tính bổ sung trên `items` quyết định nghiệp vụ:
- `is_chargeable` (bool) — đồ được phép tính phí khách (minibar, đồ tính phí riêng).
- Heuristic minibar (Lean): `is_chargeable = true` AND (`item_type = 'consumable'` OR tên category chứa `minibar`).
- `unit_price` (numeric) — dùng để tính `total_value` cho `inventory_transactions` và `supplement_requests`.

### 1.1 Bucket trong room check (6 mảng JSONB)

Mỗi bản ghi `room_checks` lưu các mảng JSONB rời rạc:

| Bucket                    | Item type áp dụng        | Ý nghĩa                                                |
| ------------------------- | ------------------------ | ------------------------------------------------------ |
| `items_sent_to_laundry`   | `linen`                  | Đồ gửi giặt — sẽ đẩy vào batch giặt                    |
| `items_consumed`          | `consumable`             | Khách dùng / hao mòn → có flag `charge_to_guest`       |
| `items_lost`              | `linen` / `consumable`   | Mất hẳn → cộng `quantity_lost`, trừ tổng kho           |
| `items_damaged`           | `equipment` / `furniture`| Hỏng — tạo `maintenance_request`                       |
| `items_replaced`          | `linen` / `consumable`   | Bù từ kho vào phòng → cộng `room_items.quantity`       |
| `items_missing`           | bất kỳ                   | Thiếu so với `standard_quantity` (có sub-`reason`)     |

Schema mỗi entry tối thiểu:
```ts
{ item_id, item_name, quantity, item_code?, notes?, photos?: string[] }
// items_consumed thêm: charge_to_guest: boolean
// items_damaged thêm: damage_level: 'minor'|'moderate'|'major'|'critical'
// items_missing thêm: reason: 'shortage'|'lost'|..., shortage: number
```

---

## 2. 5 loại Room Check & nút bấm trên UI

| `check_type`  | Khi nào                                | Trừ kho?                | Tạo request?                              |
| ------------- | -------------------------------------- | ----------------------- | ----------------------------------------- |
| `checkin`     | Khách nhận phòng                       | KHÔNG                   | KHÔNG                                     |
| `daily`       | Dọn hằng ngày                          | Trừ `room_items` thôi   | laundry + supplement (consumed/shortage)  |
| `periodic`    | Định kỳ (tuần/tháng)                   | Như `daily`             | Như `daily`                               |
| `checkout`    | Khách trả phòng                        | **TRỪ KHO ĐẦY ĐỦ**      | laundry + supplement + maintenance        |
| `maintenance` | Bảo trì độc lập                        | Tuỳ thao tác cụ thể     | maintenance                               |

### 2.1 Hành vi từng nút (flow Lean — `/rooms/:id/check-lean`)

**Step 1 — Overview (`RoomCheckOverviewPage`)**
- `Phòng ổn, gửi nhanh` → gọi RPC `perform_quick_room_check`
  - Chỉ enabled với `daily` / `periodic` (per-hotel flag `quick_path_enabled`)
  - Ghi 1 dòng `room_checks` rỗng issue, **không trừ kho**, **không tạo request**.
- `Bắt đầu kiểm tra` / `Bắt đầu kiểm tra kỹ` → vào Step 2.
- `Tiếp quản phiên` (manager) → ghi đè `room_check_sessions`.

**Step 2 — Inspection (`LeanInspectionPage`)**
- Tap row item OK → mở `LeanReportIssueSheet` (sheet bottom 2 tầng).
- Tầng 1 chọn loại sự cố (3 options Lean):
  - `damaged_lost` → kind `damaged` (mặc định không tách `lost` ở Lean)
  - `missing_replace` → kind `missing`
  - `consumed_chargeable` → kind `consumed`
- Tầng 2 form: stepper số lượng, ảnh (per-bucket required theo cấu hình hotel), toggle "Tính phí khách?", note.
- Defaults `chargeToGuest`:
  - `consumed_chargeable` → `true` (mặc định Có)
  - `damaged_lost` → `false` (HK không tự quyết, Manager duyệt)
- Minibar inline stepper: chỉ với `checkout`/`daily` và item là minibar — không bắt ảnh.
- `Bỏ` (per-row) → xoá issue đã ghi nhận.
- `Lưu tạm` → ghi draft localStorage 24h (`useLeanDraft`).
- `Tiếp tục` → Step 3.

**Step 3 — Review (`LeanReviewPage`)**
- `Sửa lại` → quay về Step 2 với `?edit={itemId}`.
- `Gửi kết quả kiểm tra` → gọi RPC `submit_room_check_lean` (xem §3.2).

### 2.2 Hành vi từng nút (flow Classic — `processCheckoutCheck` / `processDailyCheck`)

Khi check_type = `checkout`, sau khi insert `room_checks`:

1. **`updateLaundryQuantities()`** — với mỗi item linen trong `items_sent_to_laundry`, gọi RPC `atomic_item_to_laundry`:
   - `items.quantity_in_laundry += qty`
   - `items.quantity_in_stock -= LEAST(qty, stock_hiện_tại)`
   - `warehouse_stock` của warehouse mặc định: `quantity -= LEAST(...)`
2. **`createLostItemTransaction()`** — RPC `atomic_item_lost`:
   - `items.quantity_in_stock -= qty` (floor 0)
   - `items.quantity_lost += qty`
   - `warehouse_stock` của warehouse mặc định: `quantity -= qty`
   - Insert `inventory_transactions` (transaction_type='out', category='lost')
3. **`createConsumedItemTransaction()`** — RPC `atomic_item_consumed`:
   - `items.quantity_in_stock -= qty`
   - Warehouse mặc định: `quantity -= qty`
   - Insert `inventory_transactions` (out / consumed)
4. **`applyRoomItemChanges()`** — cập nhật `room_items.quantity` cho phòng (offset của laundry/lost/consumed/replaced).
5. **Tự động tạo request** (xem §4).

Daily/Periodic giống checkout NHƯNG **KHÔNG** gọi `atomic_item_lost` / `atomic_item_consumed` — không phát sinh `inventory_transactions`. Chỉ có:
- `atomic_item_to_laundry` cho linen → vẫn ảnh hưởng kho thật.
- `applyRoomItemChanges()` cập nhật `room_items` (giảm theo consumed/laundry, tăng theo replaced).

---

## 3. RPC nghiệp vụ chính

### 3.1 `atomic_item_*` (file `20260308055642_*.sql`)

Tất cả đều `SECURITY DEFINER`, dùng `FOR UPDATE` chống race.

| RPC                       | Tác động lên `items`                                                              | Tác động lên `warehouse_stock`               |
| ------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| `atomic_item_to_laundry`  | `quantity_in_laundry += p_quantity`; `quantity_in_stock -= LEAST(p_quantity, stock)` | Warehouse mặc định: `quantity -= LEAST(...)` |
| `atomic_item_lost`        | `quantity_in_stock -= p_quantity` (floor 0); `quantity_lost += p_quantity`        | `quantity -= p_quantity`                     |
| `atomic_item_consumed`    | `quantity_in_stock -= p_quantity` (floor 0)                                       | `quantity -= p_quantity`                     |

> Lưu ý: chỉ trừ vào **warehouse mặc định** (`is_default = true AND is_active = true`). Nếu hotel chưa có warehouse mặc định → chỉ cập nhật `items`, không cập nhật `warehouse_stock` (gây lệch — xem §6 Pitfall).

### 3.2 `submit_room_check_lean` (file `20260503023425_*.sql`)

**Hiện tại RPC này CHỈ:**
1. Validate quyền + tenant + check_type + quantity > 0 + photo per-bucket + conflict (`room_checks.checked_at > _started_at`).
2. Insert `room_checks` với `check_mode = 'lean'`, `status = 'submitted'`.
3. Ghi audit `log_state_transition('room_checks', _, 'lean_submit', ...)`.
4. Trả `{check_id, summary_*}`.

**RPC này KHÔNG:**
- KHÔNG gọi `atomic_item_*` → KHÔNG trừ kho thật.
- KHÔNG tạo `laundry_requests` / `supplement_requests` / `maintenance_requests`.
- KHÔNG đụng `room_items.quantity`.

> ⚠️ **Đây là gap thiết kế quan trọng**: flow Lean hiện chỉ ghi nhận sự cố. Side-effects kho/giặt/bảo trì phải được client trigger sau (giống classic) hoặc bổ sung trong RPC ở phase sau. Roadmap phase tiếp theo cần một trong hai:
> - Bọc `atomic_item_*` + auto-create requests vào trong `submit_room_check_lean`.
> - Hoặc gọi từ `useRoomCheckLean` ngay sau khi RPC trả thành công (gắn try/catch không-blocking).

### 3.3 `perform_quick_room_check`

Quick path "Phòng ổn 1-tap": insert 1 dòng `room_checks` rỗng issue. Không có side-effect kho/giặt. Hợp lý vì không có sự cố để xử lý.

### 3.4 `add_laundry_to_draft_batch`

Sau khi `createLaundryRequestFromCheck()` insert `laundry_requests`, gọi RPC này để gom request vào batch `status='draft'` của hotel (tạo mới batch nếu chưa có). Đây là cơ chế gộp đơn để giặt theo lô.

---

## 4. Auto-create requests (Classic checkout)

| Điều kiện trong room_check                                | Request tạo ra                   | Bảng                    | Trạng thái khởi tạo |
| --------------------------------------------------------- | -------------------------------- | ----------------------- | ------------------- |
| `items_sent_to_laundry.length > 0`                        | Phiếu giặt                       | `laundry_requests`      | `pending` → auto-add vào draft batch |
| `items_consumed.length > 0` OR `items_lost.length > 0`    | Phiếu bổ sung                    | `supplement_requests`   | `pending` (đợi manager duyệt) |
| `items_damaged` có item type ∈ {equipment, furniture}     | Phiếu bảo trì                    | `maintenance_requests`  | `waiting` (chưa giao) |
| `items_missing` có `reason='shortage'`                    | Phiếu bổ sung (gộp với consumed) | `supplement_requests`   | `pending`           |

`request_type` của `supplement_requests`:
- `consumed` (chỉ có consumed)
- `lost` (chỉ có lost)
- `mixed` (cả hai) — có cả shortage cũng đi nhánh `consumed`/`mixed`.

Maintenance priority map từ `damage_level`:
- `minor → low`, `moderate → medium`, `major → high`, `critical → urgent`.

Tất cả request gửi notification (in-app + push + Telegram) tới role `manager` trong hotel.

---

## 5. Vòng đời Laundry Batch & ảnh hưởng kho

### 5.1 State machine batch

```text
draft → delivered → washing → ready → received
                                  ↘  cancelled
```

Quy tắc transition (tham chiếu spec `Laundry Operations`):
- `delivered` / `washing` → `ready` (vendor báo xong)
- `ready` → `received` (kho nhận lại)
- `received` → `stocked` (đã nhập lại kho — thực tế đa số trigger gộp luôn ở `received`)

### 5.2 Trigger `laundry_batch_items_update_inventory`

Trigger `AFTER INSERT OR UPDATE ON laundry_batch_items`:

**INSERT** (lúc batch được tạo và linen đẩy vào):
```text
items.quantity_in_laundry += quantity_delivered
items.quantity_in_stock   -= quantity_delivered
items.current_wash_cycles += 1
```

**UPDATE** (khi batch nhận về `quantity_returned` / `quantity_lost` / `quantity_damaged`):
```text
quantity_returned ↑  → quantity_in_laundry -= delta;  quantity_in_stock += delta
quantity_lost     ↑  → quantity_in_laundry -= delta;  quantity_lost     += delta;  quantity_total -= delta
quantity_damaged  ↑  → quantity_in_laundry -= delta;  quantity_damaged  += delta
```

> Đây là **nguồn sự thật duy nhất** cho dòng tiền linen vào/ra kho khi đi giặt. Không trừ tay ở chỗ khác để tránh double-count.

### 5.3 Tránh double-deduct linen

Lưu ý mâu thuẫn tiềm tàng: khi `processCheckoutCheck` chạy `atomic_item_to_laundry` (đã trừ stock), sau đó `add_laundry_to_draft_batch` rồi insert `laundry_batch_items` (trigger LẠI trừ stock). Theo memory `Minibar Billing & Stock`, để tránh double-deduct:
- `atomic_item_to_laundry` chỉ trừ tối đa stock hiện tại (`LEAST(qty, stock)`).
- Batch trigger trừ stock theo `quantity_delivered` thực tế khi đẩy vào batch.

Trên thực tế, để đảm bảo nhất quán, **cần một trong hai chiến lược**:
- **A) (KHUYẾN NGHỊ)** `atomic_item_to_laundry` chỉ cập nhật `quantity_in_laundry` (không đụng stock). Trigger batch lo trừ stock.
- **B)** Khi `laundry_request` đã được auto-add vào batch, không cập nhật stock lần nữa từ trigger (chỉ tăng `current_wash_cycles`).

Hiện code chạy A một phần (RPC trừ stock) + trigger trừ stock — có rủi ro double-deduct nếu cả hai cùng chạy. Cần audit theo tenant để xác nhận.

---

## 6. Pitfalls & lưu ý vận hành

1. **Lean RPC chưa side-effect kho/giặt** (xem §3.2). Đảm bảo phase sau đồng bộ với classic flow trước khi rollout 100%.
2. **Warehouse mặc định bắt buộc**: nếu hotel chưa cấu hình warehouse `is_default = true`, các RPC `atomic_*` chỉ cập nhật `items` — `warehouse_stock` không được trừ → báo cáo sai.
3. **`quantity_in_stock` không âm**: tất cả RPC dùng `GREATEST(0, ...)`. Khi linen mất nhiều hơn stock thực, thực tế chỉ ghi nhận trừ tối đa stock — phần thiếu phản ánh ở `quantity_lost` / `quantity_damaged`.
4. **Daily check không tạo `inventory_transactions`** cho consumed/lost (chỉ checkout mới tạo). Báo cáo tổn thất theo ngày phải hợp nhất từ cả `room_checks` và `inventory_transactions`.
5. **Lean default `chargeToGuest`**:
   - `consumed_chargeable` → mặc định `true`
   - `damaged_lost` → mặc định `false` (HK không tự quyết, manager duyệt)
6. **Quick Path** không tạo bất kỳ request nào — chỉ phù hợp khi không có vấn đề.
7. **Photo policy per-bucket** chỉ áp dụng trong RPC Lean (`submit_room_check_lean`). Flow classic không có cấp policy granular này.
8. **Conflict detection**: `submit_room_check_lean` chặn nếu có `room_checks.checked_at > _started_at` cho cùng phòng — bảo vệ trường hợp 2 staff cùng kiểm.

---

## 7. Bảng quyết định nhanh (decision matrix)

| Tình huống vận hành                               | Bucket                          | Trừ items.quantity_in_stock                          | Trừ warehouse_stock | Tạo request          |
| ------------------------------------------------- | ------------------------------- | ---------------------------------------------------- | ------------------- | -------------------- |
| Linen gửi giặt (daily/checkout)                   | `items_sent_to_laundry`         | Có (qua `atomic_item_to_laundry`)                    | Có (default WH)     | `laundry_requests` (auto-add batch) |
| Đồ tiêu hao khách dùng (checkout)                 | `items_consumed`                | Có                                                   | Có                  | `supplement_requests` (consumed) |
| Đồ tiêu hao khách dùng (daily)                    | `items_consumed`                | Không (chỉ `room_items`)                             | Không               | `supplement_requests` (consumed) |
| Đồ mất sau khách trả (checkout)                   | `items_lost`                    | Có + `quantity_lost++`                               | Có                  | `supplement_requests` (lost/mixed) |
| Đồ thiếu so với chuẩn (daily/checkout)            | `items_missing`                 | Không                                                | Không               | `supplement_requests` (gộp) |
| Đồ bù vào phòng từ kho                            | `items_replaced`                | Cần thao tác qua `distribution_order` (không tự trừ) | Cần                 | (tách flow phân phối) |
| Thiết bị / Nội thất hỏng                          | `items_damaged`                 | Không (đợi manager xử lý)                            | Không               | `maintenance_requests` |
| Khách dùng minibar (Lean inline)                  | `items_consumed` + `charge=true`| Khi ghi nhận → trừ kho qua RPC consumed              | Có                  | (đi vào billing flow checkout) |

---

## 8. Tham chiếu file & RPC

**Code (TS):**
- `src/types/items.types.ts` — định nghĩa ItemType + nhãn VI
- `src/hooks/useRoomChecks.ts` — toàn bộ flow classic (insert + side-effects)
- `src/hooks/useRoomCheckLean.ts` — wrapper RPC Lean
- `src/lib/roomCheckLeanErrors.ts` — sanitize draft + validate trước submit
- `src/components/rooms/lean/LeanReportIssueSheet.tsx` — sheet 2 tầng

**Migrations / RPCs:**
- `20260503023425_*.sql` — `submit_room_check_lean` (latest)
- `20260308055642_*.sql` — `atomic_item_to_laundry`, `atomic_item_lost`, `atomic_item_consumed`
- `20251108025001_*.sql` — trigger `laundry_batch_items_update_inventory`
- `20260204154606_*.sql` — `add_laundry_to_draft_batch`
- `20251230035831_*.sql` — distribution_order batch state machine (handed_over → received → delivered)

---

_Tài liệu này phản ánh trạng thái codebase ở thời điểm phát hành. Khi RPC Lean được mở rộng để side-effect kho, hãy cập nhật §3.2 và §6._
