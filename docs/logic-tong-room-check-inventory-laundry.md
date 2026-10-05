# LOGIC TỔNG — Room Check ↔ Inventory ↔ Laundry

> **Phiên bản:** v1.0 — 2026-05-03
> **Phạm vi:** Mô tả chính xác cách 3 module Room Check / Housekeeping, Inventory / Kho, và Laundry / Giặt là **liên kết với nhau** trong webapp Hotel Asset Manager hiện tại.
> **Đối tượng:** Product, BA, Engineer, QA, Operations Manager khách sạn.
> **Tham chiếu code:** `submit_room_check_lean`, `perform_quick_room_check`, `atomic_item_*`, `room_items_update_inventory`, `laundry_batch_items_update_inventory`, `create_laundry_batch_with_items`, `create_distribution_order`, `stock_adjustment_items_apply`.

---

## 0. Bản đồ tổng (Big Picture)

```text
                   ┌─────────────────────────────────────┐
                   │        ROOM CHECK (5 loại)          │
                   │  checkin · daily · periodic         │
                   │  checkout · maintenance             │
                   └─────────────────┬───────────────────┘
                                     │
                                     ▼
        ┌─────────────────────────────────────────────────────┐
        │          ROOM_CHECKS (6 buckets JSONB)              │
        │  sent_to_laundry / consumed / lost / damaged /      │
        │  replaced / missing                                 │
        └────────┬────────────────┬──────────────────┬────────┘
                 │                │                  │
                 ▼                ▼                  ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
         │ ROOM_ITEMS   │  │ ITEMS / KHO  │  │ AUTO REQUESTS    │
         │ (per room)   │  │ warehouse_   │  │ - laundry_req    │
         │ quantity     │  │ stock        │  │ - supplement_req │
         └──────────────┘  └──────┬───────┘  │ - maintenance_req│
                                  │          └────────┬─────────┘
                                  ▼                   │
                          ┌──────────────────┐        │
                          │ LAUNDRY BATCH    │◀───────┘
                          │ draft → delivered│
                          │ → washing → ready│
                          │ → received       │
                          └──────────────────┘
```

**Ba quy tắc bất biến (invariants):**

1. **Không trừ kho 2 lần.** Mỗi item bị consumed/lost/sent-to-laundry chỉ được phản ánh **một lần** vào `inventory_transactions`. Nếu Room Check đã tạo batch giặt thì batch không trừ thêm.
2. **Mọi mutation đa bảng đi qua RPC atomic.** Cấm update rời rạc từ client.
3. **Tenant + Hotel scope.** Mọi RPC validate `tenant_id` của task/room/batch trùng với user; cross-tenant → `forbidden_tenant`.

---

## 1. Phân loại đồ (Item Classification)

### 1.1 4 item_type cốt lõi

| Code | Nhãn VI | Vòng đời | Cột trên `items` chịu tác động |
|------|---------|----------|--------------------------------|
| `linen` | Đồ vải | **Tuần hoàn**: phòng → giặt → kho → phòng | `quantity_in_stock`, `quantity_in_laundry`, `current_wash_cycles`, `quantity_lost`, `quantity_damaged` |
| `consumable` | Tiêu hao | **Một chiều**: kho → phòng → khách dùng → loại bỏ | `quantity_in_stock`, `quantity_lost` |
| `equipment` | Thiết bị | **Bền**: ít hư, hỏng → bảo trì | `quantity_in_stock` (mới mua); damage → `maintenance_request` |
| `furniture` | Nội thất | **Bền**: thay khi hỏng nặng | giống equipment |

### 1.2 Flag nghiệp vụ trên `items`

| Field | Ý nghĩa | Ảnh hưởng |
|-------|---------|-----------|
| `is_chargeable` | Đồ tính phí khách (minibar, bia, đồ ăn) | Default `charge_to_guest = true` ở bucket `items_consumed` |
| `unit_price` | Giá đơn vị | Tính `total_value` cho `inventory_transactions`, supplement, lost |
| `standard_quantity` (trên `room_items`) | Số chuẩn 1 phòng phải có | So sánh với thực tế → bucket `items_missing` |

### 1.3 Heuristic Minibar (Lean)

```ts
isMinibar(item) = item.is_chargeable === true
              && (item.item_type === 'consumable'
                  || item.category?.name?.toLowerCase().includes('minibar'))
```

→ Hiển thị inline stepper +/- thay vì sheet báo sự cố.

---

## 2. Module Room Check / Housekeeping

### 2.1 5 loại check & ngữ cảnh

| `check_type` | Khi nào | Quyền tạo | Tự động sau check |
|--------------|---------|-----------|--------------------|
| `checkin` | Khách nhận phòng | Reception/Manager | Phòng → `occupied` |
| `daily` | Hàng ngày phòng đang ở | Housekeeping | Cập nhật `last_cleaned_at` |
| `periodic` | Định kỳ phòng trống | Housekeeping | Reset clean status |
| `checkout` | Khách trả phòng | Housekeeping | Phòng → `cleaning` (auto via state machine) |
| `maintenance` | Sau bảo trì | Maintenance/Manager | Phòng từ `maintenance` → `available` |

### 2.2 Hai luồng UI: Lean vs Classic

```
/rooms/:id/check  ──┐
                    ├─►  RoomCheckRouter  ──┐
                    │                       │  ?type=replenish|delivery
                    │                       │  hoặc có distribution_order_id
                    │                       │  → Classic flow
                    │                       │
                    │                       └─►  Lean flow (default)
                    │                            /rooms/:id/check-lean
```

**Lean flow** (mặc định, mobile-first, U50 friendly):

```
Overview → [Quick Path] (1 tap)              → submit
        → [Standard]   /inspection           → /review → /success
                       (default-OK reverse logic)
```

- **Quick Path**: chỉ daily/periodic, RPC `perform_quick_room_check` — đánh dấu phòng OK toàn bộ trong 1 chạm.
- **Standard**: mọi item mặc định OK → chạm để mở `LeanReportIssueSheet` báo sự cố.

**Classic flow** (giữ lại cho replenish/delivery): màn hình form đầy đủ 6 bucket, dùng cho phân phối kho theo lệnh `distribution_order`.

### 2.3 RPC then chốt

```sql
submit_room_check_lean(
  _room_id, _check_type, _started_at,
  _notes, _photos,
  _items_missing, _items_damaged, _items_lost,
  _items_consumed, _items_replaced,
  _task_id
) RETURNS { check_id, summary_ok_count, summary_issue_count, minibar_count }
```

**Validate & guard** (xem `RoomCheck Lean Validation v1`):
- Tenant của task = tenant của room.
- `quantity > 0` cho mọi entry.
- Photo enforcement granular từ `hotels.settings.room_check`:
  - `photo_required_damaged_lost` (default **true**) → áp damaged + lost.
  - `photo_required_missing_replace` (default **false**) → áp missing + replaced.
  - `photo_required_consumed_chargeable` (default **false**) → chỉ khi `charge_to_guest = true`.
- Conflict: nếu `MAX(checked_at) > _started_at` → `conflict_room_updated` (ai đó vừa kiểm trước).
- Audit: `log_state_transition('room_checks', check_id, 'lean_submit')`.

---

## 3. Module Inventory / Kho

### 3.1 Cấu trúc 3 lớp tồn kho

```
        ┌─────────────────────────┐
        │   items (catalog)       │  ← định nghĩa SKU + tổng aggregate
        │   - quantity_in_stock   │
        │   - quantity_in_laundry │
        │   - quantity_lost       │
        │   - quantity_damaged    │
        └─────────────┬───────────┘
                      │ 1-N
                      ▼
        ┌─────────────────────────┐
        │ warehouse_stock         │  ← tồn kho thực tế từng kho
        │ (item_id, warehouse_id, │
        │  quantity)              │
        └─────────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ room_items              │  ← tồn tại từng phòng
        │ (room_id, item_id,      │
        │  quantity, standard_qty)│
        └─────────────────────────┘
```

### 3.2 Inventory transactions (audit log mọi vận động kho)

Mọi thay đổi kho ghi vào `inventory_transactions`:

| `transaction_type` | `direction` | Tình huống |
|--------------------|-------------|------------|
| `purchase` | `in` | Nhập từ vendor (purchase_order) |
| `distribution` | `out` | Xuất từ kho về phòng (distribution_order) |
| `consumed` | `out` | Khách dùng (room check `items_consumed`) |
| `lost` | `out` | Mất (room check `items_lost`) |
| `to_laundry` | `out` | Gửi giặt (chuyển stock → laundry pool) |
| `from_laundry` | `in` | Nhận về sau giặt |
| `damaged` | `out` | Hỏng không sửa được |
| `adjustment` | `in/out` | Stock adjustment thủ công (cần manager approve) |
| `transfer` | `in/out` | Chuyển giữa 2 kho |

### 3.3 RPC nguyên tử

| RPC | Tác dụng |
|-----|----------|
| `atomic_item_consumed` | Trừ `room_items.quantity`, trừ `warehouse_stock`, ghi transaction `consumed`, có thể tạo `chargeable_consumption` nếu `charge_to_guest` |
| `atomic_item_lost` | Trừ `warehouse_stock`, cộng `quantity_lost`, ghi transaction `lost` |
| `atomic_item_to_laundry` | Trừ `warehouse_stock`, cộng `quantity_in_laundry`, ghi transaction `to_laundry` (chuẩn bị tạo batch) |
| `room_items_update_inventory` | Trigger sync `items.quantity_in_stock` từ tổng `warehouse_stock` |
| `stock_adjustment_items_apply` | Áp dụng stock adjustment sau manager approve |
| `create_distribution_order` | Tạo lệnh phân phối kho → phòng |
| `confirm_warehouse_delivery` | Xác nhận đã giao, trừ `warehouse_stock`, cộng `room_items` |

### 3.4 Default Warehouse — prerequisite

- Mỗi `hotel` **bắt buộc** có ít nhất 1 default warehouse (`is_default = true`).
- RPC `ensure_single_default_warehouse` đảm bảo unique.
- `create_default_warehouse_for_hotel` chạy khi tạo hotel mới.
- **Nếu thiếu default warehouse** → các auto-flow (consumed/lost/laundry) sẽ raise `no_default_warehouse`.

---

## 4. Module Laundry / Giặt là

### 4.1 State machine của `laundry_batches`

```
   draft  ──[send]──►  delivered  ──[start]──►  washing
                            │                       │
                            │                       │
                            └────────[skip]─────────┴──[done]──►  ready  ──[receive]──►  received
                                                                                              │
                                                                                              ▼
                                                                                        (kết thúc)
```

| Trạng thái | Ý nghĩa | Trigger inventory |
|------------|---------|--------------------|
| `draft` | Đang gom đồ tại hotel, chưa gửi | Không trừ kho |
| `delivered` | Đã giao cho vendor | **Trừ `quantity_in_stock`, cộng `quantity_in_laundry`** |
| `washing` | Vendor đang giặt | Không đổi |
| `ready` | Vendor báo xong | Không đổi |
| `received` | Hotel nhận về | **Cộng `quantity_in_stock`, trừ `quantity_in_laundry`, cộng `current_wash_cycles`** |

Trigger thực hiện: `laundry_batch_items_update_inventory` (gắn vào `laundry_batch_items` ON UPDATE/INSERT/DELETE).

### 4.2 Flow tạo batch từ Room Check

```
Room Check
  │ items_sent_to_laundry: [{ item_id, quantity, ... }]
  │
  ▼
RPC: submit_room_check_lean
  │ ghi vào room_checks.items_sent_to_laundry (chưa trừ kho)
  │
  ▼
TRIGGER (hoặc job): tạo laundry_request (status = pending)
  │
  ▼
Manager: gom thành laundry_batch
  RPC: create_laundry_batch_with_items
  │ → tạo batch ở status `draft`
  │ → chưa trừ kho
  │
  ▼
Manager: chuyển sang `delivered` (gửi vendor)
  │ → trigger trừ stock, cộng laundry
  │
  ▼
Vendor: washing → ready
  │
  ▼
Hotel: nhận về → `received`
  │ → trigger cộng stock, trừ laundry, +1 wash_cycle
```

### 4.3 Xử lý mất / hỏng tại vendor

| Tình huống | RPC | Inventory effect |
|------------|-----|------------------|
| Vendor làm mất linen | `create_laundry_loss_transaction` | Trừ `quantity_in_laundry`, cộng `quantity_lost`, ghi transaction `lost` với `source = 'laundry_loss'` |
| Hotel nhận về thiếu | `create_laundry_return_transaction` (loại `partial`) | Cộng đủ phần thực nhận; phần thiếu xử lý theo loss flow |

### 4.4 Wash cycles

- `items.max_wash_cycles` — giới hạn (ví dụ 80 lần).
- Mỗi lần `received` → `current_wash_cycles += 1`.
- Khi `>= max_wash_cycles` → flag `needs_replacement = true` (cảnh báo manager).

---

## 5. Bảng ánh xạ Bucket → Side-effect

**Bảng quan trọng nhất của tài liệu này.** Mỗi bucket trong `room_checks` ánh xạ tới side-effect cụ thể trên kho và request tự sinh:

| Bucket | Item type | Trừ `room_items` | Trừ `warehouse_stock` | Cập nhật `items.*` | Auto-create request | Tính phí khách |
|--------|-----------|------------------|------------------------|--------------------|----------------------|----------------|
| `items_sent_to_laundry` | linen | ✓ | (qua batch khi `delivered`) | `+quantity_in_laundry` khi batch `delivered` | `laundry_request` | Không |
| `items_consumed` | consumable | ✓ | ✓ | `quantity_in_stock -=` | `supplement_request` (auto bù) | Có nếu `charge_to_guest = true` → `chargeable_consumption` |
| `items_lost` | linen/consumable | ✓ | ✓ | `quantity_lost +=` | (không) | Có thể (manager quyết định trên booking) |
| `items_damaged` | equipment/furniture | (giữ nguyên — vẫn ở phòng) | (không) | `quantity_damaged +=` | `maintenance_request` (priority theo `damage_level`) | Có thể (charge khách nếu lỗi do khách) |
| `items_replaced` | linen/consumable | `+quantity` (cộng vào phòng) | ✓ (trừ ra để bù) | (không) | (không — đã là kết quả của supplement) | Không |
| `items_missing` | bất kỳ | (báo cáo, không đụng) | (không) | (không) | `supplement_request` nếu `reason = 'shortage'` | Không |

> **CẢNH BÁO khoảng cách hiện tại (phase sau cần đóng):**
> RPC `submit_room_check_lean` hiện chỉ **ghi nhận record + audit**, KHÔNG tự gọi `atomic_item_*` để trừ kho ngay.
> Side-effect kho chỉ chạy đầy đủ ở Classic flow (qua các nút "Xác nhận xuất kho" gọi `atomic_item_*`).
> → **Phase tiếp theo**: trigger AFTER INSERT trên `room_checks` để gọi `atomic_item_consumed/lost/to_laundry` cho từng entry trong bucket tương ứng (idempotent theo `check_id + item_id`).

---

## 6. Logic theo từng nút bấm (Lean UI)

### 6.1 Màn `/rooms/:id/check-lean` (Overview)

| Nút | Điều kiện hiện | Hành động |
|-----|----------------|-----------|
| **"Phòng OK hoàn toàn"** (Quick Path) | `check_type ∈ {daily, periodic}` AND không có draft | RPC `perform_quick_room_check` → submit ngay → /success |
| **"Bắt đầu kiểm chi tiết"** | Luôn hiện | Navigate `/inspection` |
| **"Tiếp tục bản nháp"** | Có `lean_draft` < 24h | Restore từ localStorage |
| **"Hủy bản nháp"** | Có draft | Xóa draft, reset |

### 6.2 Màn `/inspection`

- Render danh sách `room_items` của phòng + minibar inline stepper.
- **Tap card item** (default OK) → mở `LeanReportIssueSheet`.
- **Sheet 2 tầng**:
  - Tầng 1: chọn loại sự cố (Thiếu / Hỏng / Mất / Tiêu hao / Bù từ kho).
  - Tầng 2: nhập qty, photo (nếu config bắt), notes, `charge_to_guest` (default theo bucket).
- **Defaults `charge_to_guest`**:
  - `consumed_chargeable` (minibar) → **true**
  - `damaged_lost` → **false** (manager duyệt sau)
- **"Lưu tạm"** (header) → autosave draft localStorage 24h.

### 6.3 Màn `/review`

- Hiển thị summary card: số ok / số issue / minibar count.
- Banner đỏ nếu pre-validation lỗi (qty=0, thiếu ảnh).
- Click vào card issue → scroll + `?edit={itemId}` mở lại sheet.
- **"Gửi kiểm phòng"** → RPC `submit_room_check_lean`.
- **"Sửa lại từ đầu"** → quay `/inspection`.

### 6.4 Màn `/success`

- 2 hành động chính:
  - **"Xem phòng khác cùng tầng"** (gợi ý dựa heuristic regex room number).
  - **"Về danh sách công việc"** (`/my-tasks`).
- Nếu vừa Quick Path → "Hoàn tác" (RPC `undo_quick_room_check`, TTL 5 phút).

---

## 7. Quy trình end-to-end ví dụ

### 7.1 Khách checkout — phát hiện thiếu khăn + dùng minibar

```
1. Housekeeping tap phòng → /rooms/123/check?type=checkout
2. Lean inspection:
   - Khăn tắm: report → "Mất" qty=1, photo → bucket items_lost
   - Coca minibar: stepper -2 → bucket items_consumed (charge_to_guest=true)
   - Còn lại OK
3. Submit → submit_room_check_lean:
   - check_id created
   - audit log
   - (PHASE SAU: trigger gọi atomic_item_lost + atomic_item_consumed)
4. Reception thấy minibar charge ở booking → tính vào hóa đơn checkout
5. Manager review items_lost → quyết định charge khách hay write-off
6. Phòng auto chuyển → cleaning (state machine)
```

### 7.2 Daily check — gửi đồ giặt

```
1. Housekeeping kiểm phòng đang ở
2. Bucket items_sent_to_laundry: ga giường x2, áo gối x2
3. Submit → laundry_request (status=pending) tự tạo
4. Cuối ca: Manager → /laundry/batches/new
   → gom các laundry_request thành 1 batch
   → create_laundry_batch_with_items (status=draft)
5. Sáng hôm sau: chuyển batch → delivered
   → trigger laundry_batch_items_update_inventory:
     items.quantity_in_stock -= 4
     items.quantity_in_laundry += 4
     ghi inventory_transactions: type=to_laundry, out, value=4*unit_price
6. Vendor xong → washing → ready
7. Hotel nhận → received:
   - quantity_in_stock += 4
   - quantity_in_laundry -= 4
   - current_wash_cycles += 1 cho từng item
```

### 7.3 Distribution order — bù kho đầu phòng

```
1. Manager: /inventory/distribution → tạo distribution_order
2. RPC create_distribution_order (status=pending)
3. Housekeeping: /rooms/:id/check?distribution_order_id=xyz
   → RoomCheckRouter ép vào Classic flow
4. Confirm từng item nhận → atomic update room_items + warehouse_stock
5. RPC confirm_warehouse_delivery → status = completed
6. Inventory transaction type=distribution, direction=out
```

---

## 8. Permission matrix tổng

| Hành động | Staff (HK) | Manager | Tenant Owner | Super Admin |
|-----------|------------|---------|--------------|-------------|
| Submit room check (own task) | ✓ | ✓ | ✓ | ✓ |
| Quick Path | ✓ (nếu config) | ✓ | ✓ | ✓ |
| Reopen room check | ✗ | ✓ | ✓ | ✓ |
| Tạo laundry batch | ✗ | ✓ | ✓ | ✓ |
| Chuyển trạng thái batch | ✗ | ✓ | ✓ | ✓ |
| Stock adjustment (apply) | ✗ | ✓ (cần approve) | ✓ | ✓ |
| Tạo distribution order | ✗ | ✓ | ✓ | ✓ |
| Xem inventory transactions | (limited) | ✓ | ✓ | ✓ |

---

## 9. Risk register & gaps hiện tại

| # | Risk | Nguyên nhân | Mức | Hướng xử lý |
|---|------|-------------|-----|-------------|
| 1 | Lean submit không tự trừ kho | RPC chỉ ghi record | **High** | Trigger AFTER INSERT gọi `atomic_item_*` idempotent theo `check_id+item_id` |
| 2 | Double-deduction linen | Vừa trừ ở Lean trigger vừa trừ khi batch `delivered` | High (sau khi fix #1) | Khi linen vào batch, batch trigger SKIP nếu đã có transaction `to_laundry` cùng `room_check_id` |
| 3 | No default warehouse → mọi auto-flow fail | Hotel mới chưa setup | Medium | Bắt buộc tạo default warehouse trong onboarding wizard |
| 4 | Wash cycle không reset khi thay linen mới | Trigger chỉ +1, không phân biệt SKU mới | Medium | Tạo cột `batch_uniform` hoặc reset thủ công khi nhập purchase mới |
| 5 | Consumed chargeable không sync về invoice | Phụ thuộc realtime + service charge aggregation | Medium | Đảm bảo `chargeable_consumption` insert kèm `booking_id`, hook checkout đọc từ đây |
| 6 | Maintenance request từ items_damaged không link booking | Hiện chỉ ghi room_id | Low | Thêm `source_check_id` + `source_booking_id` khi auto-create |

---

## 10. Test cases chính cần có

### 10.1 Room Check ↔ Inventory

- [ ] Submit lean với `items_consumed` qty=2, charge=true → tạo 1 `chargeable_consumption` qty=2.
- [ ] Submit lean với `items_lost` qty=1 → cộng `items.quantity_lost +=1`, trừ `warehouse_stock`.
- [ ] Submit lean cùng `_started_at` cũ → expect `conflict_room_updated`.
- [ ] Cross-tenant room → expect `forbidden_tenant`.
- [ ] Photo bắt buộc damaged_lost OFF → submit không photo cho damaged → pass.

### 10.2 Inventory ↔ Laundry

- [ ] Tạo batch draft → kho không đổi.
- [ ] Chuyển draft → delivered: stock -=N, laundry +=N, transaction `to_laundry` xuất hiện.
- [ ] Received: stock +=N, laundry -=N, wash_cycles +=1.
- [ ] Loss: laundry -=K, lost +=K, transaction `lost` source `laundry_loss`.
- [ ] Idempotent: chuyển delivered 2 lần → không double-trừ.

### 10.3 End-to-end

- [ ] Checkout flow: lean submit có lost + consumed → invoice checkout có line tương ứng.
- [ ] Daily flow: lean submit có sent_to_laundry → laundry_request tạo, manager gom batch, lifecycle đầy đủ → kho đúng số.

---

## 11. Glossary

| Thuật ngữ | Nghĩa |
|-----------|-------|
| **Bucket** | Một mảng JSONB trong `room_checks` (sent_to_laundry, consumed, lost, damaged, replaced, missing) |
| **Lean flow** | UX mới mặc định cho Room Check, default-OK reverse logic |
| **Quick Path** | Submit room check 1-tap khi mọi thứ OK |
| **Atomic RPC** | Stored procedure xử lý mutation đa bảng trong 1 transaction |
| **Default warehouse** | Kho mặc định của hotel cho auto-flow |
| **Wash cycle** | Số lần linen đã giặt; chạm max → cảnh báo thay |
| **Chargeable consumption** | Bản ghi đồ tính phí khách (minibar, đồ lost) → vào hóa đơn |

---

**Hết tài liệu — phiên bản v1.0.**
Mọi thay đổi nghiệp vụ ảnh hưởng đến mapping bucket↔inventory đều phải cập nhật bảng §5 và risk register §9.
