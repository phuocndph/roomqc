# Flow: Authentication & Onboarding

## Tổng quan
Email/password + Google OAuth. PWA cache credentials cho mobile staff. Password reset qua OTP edge function.

## Sequence: Đăng nhập email/password

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Login.tsx
    participant SB as Supabase Auth
    participant DB as users + user_roles
    participant CTX as AuthContext

    U->>FE: Nhập email + password
    FE->>SB: signInWithPassword
    SB-->>FE: session + jwt
    FE->>CTX: set session
    CTX->>DB: useUser query (users + tenant + hotel + roles)
    DB-->>CTX: UserWithRelations
    CTX->>FE: primaryRole, tenantId, hotelId
    FE->>U: Redirect /dashboard (theo role)
```

## Sequence: Password reset qua OTP

```mermaid
sequenceDiagram
    actor U
    participant FE as ForgotPassword
    participant EF1 as reset-password-with-otp
    participant EF2 as verify-otp
    participant SB as Supabase Auth
    participant MAIL as send-notification-email

    U->>FE: Nhập email
    FE->>EF1: { email }
    EF1->>SB: admin.getUserByEmail
    EF1->>EF1: gen OTP 6 số, lưu password_reset_otps
    EF1->>MAIL: gửi OTP
    MAIL-->>U: Email với mã OTP
    U->>FE: Nhập OTP + new password
    FE->>EF2: { email, otp, new_password }
    EF2->>EF2: validate OTP (5 phút, 1 lần)
    EF2->>SB: admin.updateUserById(password)
    EF2-->>FE: success
    FE->>U: Redirect login
```

Memory: `secure-otp-and-password-reset-v1`. Password validation high-strength (zod).

## PWA Credential caching
- `lib/credential-manager.ts` lưu credentials vào IndexedDB (encrypted)
- Khi mất mạng + PWA mode → fallback offline auth (read-only)
- Auto re-validate khi online lại
Memory: `pwa-credential-management-spec`.

## Onboarding flow (tenant mới)
1. Register → tạo `auth.users` (chưa có row trong `public.users`)
2. `useUser` return `null` → redirect `/onboarding`
3. User chọn: tạo tenant mới hoặc join existing (qua invite)
4. Form: tên hotel, address, plan trial
5. RPC `create_tenant_with_owner` → tạo `tenants` + `users` + `user_roles=owner` + `hotels[0]` + 14-day trial

## Permissions checkpoint
- `RoleGuard` ở route bao bọc page
- `usePermission(permission)` hook check ở component
- Server-side: RLS + RPC `has_role(uid, role)`
