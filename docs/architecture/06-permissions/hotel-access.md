# Hotel Access Control

## Mô hình
- Tenant có nhiều hotels
- User thuộc 1 tenant (`users.tenant_id`)
- User có thể được gán nhiều hotels qua `user_hotels (user_id, hotel_id)`
- `users.hotel_id` = hotel mặc định / primary

## Visibility matrix

| Role | Hotel access |
|---|---|
| `super_admin` | All tenants × all hotels |
| `owner` | All hotels của tenant mình |
| `hotel_manager` | Hotels có row trong `user_hotels` |
| `department_manager` | Như manager |
| `staff` | Như manager |

## HotelContext (`src/contexts/HotelContext.tsx`)
- `currentHotelId` — hotel đang chọn (null = "All Hotels")
- `availableHotels` — list user được phép xem
- `setCurrentHotel(id)` — switch + invalidate queries

## All Hotels mode
Memory `all-hotels-mode-guards-v1`:
- `currentHotelId = null` → query không filter `hotel_id`
- **Block creation** ở mode này (phải chọn hotel cụ thể trước)
- Query keys phải include `hotelId` (kể cả null) để cache đúng

## Query pattern bắt buộc
```typescript
queryKey: ['domain', 'sub', tenantId, hotelId, ...filters]
queryFn: () => {
  let q = supabase.from('table').select('*').eq('tenant_id', tenantId)
  if (hotelId) q = q.eq('hotel_id', hotelId)
  return q
}
```

## RLS lớp bổ sung
Policy SELECT phải kiểm `hotel_id IN (SELECT hotel_id FROM user_hotels WHERE user_id=auth.uid())` cho non-owner roles.

Memory: `hotel-level-access-control`, `tenant-isolation-filtering-standard`.
