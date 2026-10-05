---
name: unified-pricing-pipeline-v1
description: Đường ống giá thống nhất — resolver RPC, seasonal overlay trên grid, health banner, archive room_types, auto-sync rooms
type: feature
---

## Đường ống giá (single source of truth)

```
rooms.room_type (text) → trigger auto-sync → room_types (UUID)
room_type_rates.daily_rate = giá nền
+ seasonal_rate_overrides (overlay theo ngày)
+ rate_plan_daily_prices (override cứng)
→ resolve_daily_prices_bulk(room_type_id, from, to, apply_to, hotel_id)
```

## RPCs

- `resolve_daily_prices_bulk` → trả `{date, base_price, override_price, final_price, is_closed, source, seasonals[]}` cho từng ngày. Override cứng thắng seasonal. Seasonal sort priority ASC, mode `overwrite` chặn add_on tiếp theo.
- `get_pricing_health(hotel_id)` → `{room_types_total, with_rate, missing_rate, seasonal_active, seasonal_conflicts}`. Conflict = cùng priority + overlap ngày + apply_to giao nhau.

## Triggers

- `guard_room_type_delete` BEFORE DELETE: nếu còn rooms linked → set `status='archived'`, chặn DELETE (RETURN NULL).
- `auto_sync_room_type_on_room_change` AFTER INSERT/UPDATE OF room_type ON rooms → gọi `sync_room_types_from_rooms(NEW.hotel_id)`.

## Hooks

- `useResolvedDailyPrices(roomTypeId, from, to, applyTo, hotelId)` — Map<date, ResolvedDailyPrice>
- `usePricingHealth(hotelId)` — staleTime 60s, dùng cho banner ở PricingHubPage

## UI rules

- Grid cell có seasonal: chấm cam `bg-amber-500` top-right + giá hiển thị theo `final_price`, gạch ngang `base_price` ở dưới.
- Header strip: link "N quy tắc mùa đang áp" → tab `seasonal`, tooltip list tên quy tắc.
- PricingHubPage: banner amber khi `missing_rate>0 || conflicts>0`, có nút điều hướng tab.
- Khi save bất kỳ giá nào → `refresh()` phải invalidate cả `['resolved-daily-prices']` và `['pricing-health']`.

## Defaults đã chọn

- Xóa hạng phòng còn phòng → archive (không xóa cứng)
- Tạo phòng với room_type text mới → tự tạo room_types row
- Booking engine wire seasonal sang sprint sau (hiện tại chỉ preview ở grid)
