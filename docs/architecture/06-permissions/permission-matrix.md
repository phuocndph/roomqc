# Permission Matrix

## Hierarchy

```text
super_admin  ──►  toàn hệ thống (cross-tenant)
  └─ tenant_owner ──►  toàn tenant + tất cả hotels
       └─ hotel_manager ──►  hotels được gán
            └─ department_manager ──►  department trong hotels được gán
                 └─ staff ──►  task được giao
```

## Module × Action × Role

Legend: ✓ = full · △ = own/assigned only · ✗ = no.

| Module | Action | super_admin | owner | hotel_mgr | dept_mgr | staff |
|---|---|:-:|:-:|:-:|:-:|:-:|
| dashboard | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| bookings | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| bookings | create/update | ✓ | ✓ | ✓ | ✓ | ✓ |
| bookings | delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| rooms | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| rooms | create/delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| rooms | update (incl. check) | ✓ | ✓ | ✓ | ✓ | △ |
| housekeeping (room check) | submit lean/quick | ✓ | ✓ | ✓ | ✓ | ✓ |
| housekeeping | reopen | ✓ | ✓ | ✓ | △ | ✗ |
| housekeeping | qc dashboard | ✓ | ✓ | ✓ | ✓ | ✗ |
| inventory | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| inventory | create/update | ✓ | ✓ | ✓ | ✓ | ✗ |
| inventory | approve distribution | ✓ | ✓ | ✓ | ✓ | ✗ |
| inventory | bulk delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| items | manage | ✓ | ✓ | ✓ | ✗ | ✗ |
| laundry | view/create batch | ✓ | ✓ | ✓ | ✓ | ✓ |
| laundry | approve compensation | ✓ | ✓ | ✓ | ✓ | ✗ |
| maintenance | view/create | ✓ | ✓ | ✓ | ✓ | ✓ |
| maintenance | assign/complete | ✓ | ✓ | ✓ | ✓ | △ |
| reports | view | ✓ | ✓ | ✓ | △ | ✗ |
| reports | export | ✓ | ✓ | ✓ | ✗ | ✗ |
| vendors | manage | ✓ | ✓ | ✓ | ✗ | ✗ |
| purchase_orders | manage | ✓ | ✓ | ✓ | ✗ | ✗ |
| hotels | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| hotels | create/manage | ✓ | ✓ | ✗ | ✗ | ✗ |
| settings | general | ✓ | ✓ | ✓ | ✗ | ✗ |
| settings | workflows (manage) | ✓ | ✓ | ✗ | ✗ | ✗ |
| users | view | ✓ | ✓ | ✓ | △ | ✗ |
| users | create | ✓ | ✓ | ✓ (≤ manager) | ✓ (staff only) | ✗ |
| users | reset password | ✓ | ✓ (tenant) | ✓ (hotel) | ✗ | ✗ |
| subscription | view | ✓ | ✓ | ✗ | ✗ | ✗ |
| subscription | manage | ✓ | ✓ | ✗ | ✗ | ✗ |

## Đặc thù

- **All Hotels mode**: chỉ owner / super_admin. Chặn create entity khi đang ở mode này (memory `all-hotels-mode-guards-v1`).
- **Suspended tenant**: tất cả role bị giới hạn read-only trừ `subscription` page.
- **Read-only flag**: `tenants.is_read_only=true` block mọi RPC mutation (`Foundation Hardening Phase 1`).

## Implementation

- **Route guard**: `<PermissionRoute module="..." action="...">` (default action = `view`).
- **Component gate**: `<PermissionGate module action>` trả về fallback nếu không có quyền.
- **Hook**: `useHasPermission` / `useCanAccess` (batch).
- **DB**: `has_user_permission(user_id, module, action)` (SECURITY DEFINER) — dùng trong RLS.

## RLS pattern

```sql
create policy "Owner sees tenant data" on <table> for select
  using ( tenant_id = (select tenant_id from users where id = auth.uid()) );

create policy "Manager sees assigned hotels" on <table> for select
  using (
    tenant_id = (select tenant_id from users where id = auth.uid())
    and ( hotel_id is null
          or hotel_id in (select hotel_id from user_hotels where user_id = auth.uid()) )
  );
```

(Sự thật chi tiết: `02-data/rls-policies.md`.)
