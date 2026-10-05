# State Machine: Room Status v2

## 11 trạng thái
| Code | Vietnamese | Mô tả |
|---|---|---|
| `available` | Trống sẵn sàng | Sẵn cho check-in |
| `occupied` | Đang ở | Có khách lưu trú |
| `cleaning` | Đang dọn | HK đang làm |
| `dirty` | Chưa dọn | Sau checkout chờ HK |
| `inspection` | Chờ kiểm tra | HK xong, chờ supervisor |
| `maintenance` | Bảo trì | Đang sửa |
| `dnd` | Không làm phiền | Khách yêu cầu, auto lift sau X giờ |
| `oos` | Ngừng kinh doanh | Out of service, có expiry |
| `oo` | Ngoài lịch | Out of order, dài hạn |
| `reserved` | Đã đặt giữ | Booking confirmed chưa check-in |
| `blocked` | Khoá | Manual lock (admin) |

## Diagram

```mermaid
stateDiagram-v2
    [*] --> available
    available --> reserved: Booking confirmed
    available --> occupied: Walk-in check-in
    reserved --> occupied: Check-in
    reserved --> available: Cancel/no-show
    occupied --> dirty: Checkout
    dirty --> cleaning: HK nhận task
    cleaning --> inspection: HK xong
    inspection --> available: Supervisor pass
    inspection --> cleaning: Reject
    available --> maintenance: Phát hiện hỏng
    occupied --> maintenance: Khẩn cấp
    maintenance --> available: Hoàn thành
    available --> dnd: Khách yêu cầu
    dnd --> available: Hết giờ DND (cron)
    available --> oos: Manager block ngắn hạn
    oos --> available: Hết hạn (cron)
    available --> oo: Manager block dài hạn
    oo --> available: Manual unlock
    available --> blocked: Admin lock
    blocked --> available: Admin unlock
```

## RPC: `transition_room_status`
```sql
transition_room_status(
  _room_id uuid,
  _to_status text,
  _reason text default null,
  _dnd_until timestamptz default null,
  _oos_until timestamptz default null,
  _force boolean default false
) returns jsonb
```
Validate:
- `from_status → new_status` có trong allowed transitions table
- User có permission tương ứng
- Insert `room_status_audit` (ai, khi nào, từ→đến, lý do)

## Cron lift
- `lift-expired-dnd-oos` chạy mỗi 15 phút → lift `dnd` (>24h default), `oos` (theo expiry)

## Memory
`state-machine-v2-rollout`, `foundation-hardening-phase-1`.
