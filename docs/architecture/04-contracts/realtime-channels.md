# Realtime Channels

## Tổng quan
Supabase Realtime qua Postgres logical replication. Subscribe `postgres_changes` với filter cụ thể.

## Channels chính

| Channel | Table | Filter | Consumer |
|---|---|---|---|
| `payment-tx-{tenantId}` | `payment_transactions` | `tenant_id=eq.X` | Payment QR page, dashboard |
| `tenants-{tenantId}` | `tenants` | `id=eq.X` | Subscription page |
| `invoices-{tenantId}` | `invoices` | `tenant_id=eq.X` | Reception, accounting |
| `notifications-{userId}` | `in_app_notifications` | `recipient_id=eq.X` | Bell |
| `room-check-{roomId}` | `room_check_sessions` | `room_id=eq.X` | Multi-staff sync |
| `staff-status-{hotelId}` | `staff_status` | `hotel_id=eq.X` | On-shift list dialogs |
| `tasks-{userId}` | `housekeeping_tasks` | `assigned_to=eq.X` | My Tasks page |
| `bookings-{hotelId}` | `room_bookings` | `hotel_id=eq.X` | Reception dashboard |
| `rooms-{hotelId}` | `rooms` | `hotel_id=eq.X` | Room grid |

## Pattern chuẩn
```typescript
useEffect(() => {
  const channel = supabase
    .channel(`name-${id}`)
    .on('postgres_changes', {
      event: '*',                    // Hoặc cụ thể: INSERT/UPDATE/DELETE
      schema: 'public',
      table: 'table_name',
      filter: `tenant_id=eq.${tenantId}`
    }, (payload) => {
      queryClient.invalidateQueries({ queryKey: ['domain', tenantId] })
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [tenantId])
```

## Bảng đã enable realtime
Xem `_generated/db-rls-enabled.tsv` cột `realtime`. ALTER PUBLICATION khi cần thêm.

## Memory
- `on-shift-list-realtime-v1`
- `group-payment-realtime-v1`
- `room-check-session-sync-v1`

## Performance pitfalls
- F-PERF-02: Subscribe `event: '*'` thay vì cụ thể event/filter → bandwidth waste
- F-PERF-03: queryKey thiếu hotelId → invalidate nhầm hoặc cache leak khi switch hotel
