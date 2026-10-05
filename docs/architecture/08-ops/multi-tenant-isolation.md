# Multi-tenant Isolation

## 3 lớp bảo vệ
1. **RLS policies** — DB enforce
2. **Client `.eq('tenant_id', tenantId)`** — defense in depth
3. **RPC validate** — server kiểm `tenant_id` arg vs `auth.uid()` profile

## Lý do 3 lớp
- RLS có thể bị bypass nếu dùng service_role key (edge fn)
- Client filter giảm tải DB + index hit tốt hơn
- RPC validate = fail-fast khi có bug

## Pattern bắt buộc
```typescript
// Hook
const { tenantId, hotelId } = useUser()
const { data } = useQuery({
  queryKey: ['domain', tenantId, hotelId],
  queryFn: async () => {
    let q = supabase.from('table').select('*').eq('tenant_id', tenantId!)
    if (hotelId) q = q.eq('hotel_id', hotelId)
    return q
  },
  enabled: !!tenantId
})
```

## Cross-tenant leak risks
- Edge fn dùng service_role mà quên filter
- Realtime subscription không filter
- Storage bucket public không có tenant prefix path
- Aggregate views không có RLS

## Storage convention
- `guest-documents` là **private** — SELECT theo tenant và preview dùng signed URL.
- Bucket public còn lại (nếu có) phải dùng path `{tenantId}/{...}`; không dùng public URL cho PII.
- Khi chuyển một bucket sang private, cập nhật toàn bộ caller sang signed URL có TTL.

## Edge fn rule
Edge fn nhận `tenant_id` từ JWT claims (`auth.uid()` → query users) thay vì trust client payload.

## Memory
- `tenant-isolation-filtering-standard`
- `user-data-isolation-and-rls-hardening`
- `anonymous-upload-proxy-edge-function`
