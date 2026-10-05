# Module: Users + Permissions

**Phụ thuộc**: Tenants/Hotels · mọi module khác (gate).

## 4-tier user level

| Level | Mô tả | Tạo được ai |
|---|---|---|
| `super_admin` | RoomQc team | tất cả |
| `tenant_owner` | Chủ doanh nghiệp | manager, staff |
| `manager` (hotel/department) | Quản lý cấp KS hoặc phòng ban | manager (cùng cấp), staff |
| `staff` | Nhân viên | – |

## App roles (legacy enum)

```text
super_admin · owner · hotel_manager · department_manager · staff
```

Map: `tenant_owner ↔ owner`, `manager ↔ {hotel_manager, department_manager}`.

## Bảng

```text
users               # tenant_id, hotel_id, position_id, status
user_roles          # user_id × role  (CRITICAL: tách khỏi users để tránh privilege escalation)
roles               # catalog
permissions         # module × action
role_permissions    # role × permission
positions           # chức danh + department + user_level_code
user_hotels         # multi-hotel assignment cho manager/staff
```

> **NEVER** lưu role trong `users` hoặc `profiles`.

## Hotel Access Control

- Owner / Super Admin: thấy tất cả hotels của tenant.
- Manager / Staff: chỉ thấy hotels được gán qua `user_hotels`.
- `HotelContext` filter mọi query.
- All Hotels mode chỉ cho owner/super_admin (memory `all-hotels-mode-guards-v1`).

## RPC

```text
has_user_permission(user_id, module, action) → bool   # SECURITY DEFINER, dùng trong RLS + UI
calculate_staff_statistics(...)
```

`has_user_permission` là **xương sống** của permission gate. Không gọi recursive trong RLS (vì bản thân nó dùng SECURITY DEFINER).

## Permission action set (8)

```text
view · create · update · delete · export · approve · assign · manage
```

(Memory: `permissions/flexible-module-action-system-v1`.)

## Module list

```text
dashboard, items, rooms, bookings, laundry, inventory, reports,
vendors, maintenance, settings, users, subscription, hotels, purchase_orders
```

## Tier hierarchy & enforcement

- Owner reset password được manager/staff trong tenant.
- Manager reset được staff trong hotel.
- Staff không reset ai.
- Edge fn `reset-password-with-otp` + `verify-otp` cho self-service.
- Memory: `secure-otp-and-password-reset-v1`, `tiered-hierarchy-and-enforcement-model`.

## Data isolation

- RLS theo `tenant_id` + (nếu cần) `hotel_id`.
- User chỉ xem profile của người **cùng tenant** (memory `user-data-isolation-and-rls-hardening`).
- Owner Navigation không bị restrict (memory `owner-unrestricted-navigation-v1`).

## PWA & Credential

- Memory: `pwa-credential-management-spec`.
- Auto-update PWA: `CacheBuster` + bump `CURRENT_VERSION` mỗi release.
- Bottom nav filter theo permission, max 5 + tràn vào More.
