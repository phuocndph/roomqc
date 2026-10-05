# Audit Log

## Mô hình
Mọi state transition quan trọng → insert vào audit table tương ứng.

## Bảng audit
| Bảng | Domain |
|---|---|
| `room_status_audit` | Room transitions |
| `booking_status_audit` | Booking transitions |
| `task_status_audit` | Task & QC transitions |
| `payment_audit` | Payment match/refund |
| `super_admin_activity_log` | Super admin actions |
| `room_check_audit` | Lean submit, quick submit, reopen, undo |
| `settings_audit` | Hotel settings changes (`settings.room_check.*`) |

## Schema chuẩn
```sql
create table xxx_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  hotel_id uuid,
  entity_id uuid not null,
  actor_id uuid not null,
  action text not null,
  from_value jsonb,
  to_value jsonb,
  reason text,
  metadata jsonb,
  created_at timestamptz default now()
);
```

## Helper RPC
`log_state_transition(table, entity, actor, from, to, reason, meta)` — central helper (memory `foundation-hardening-phase-1`).

## RLS
- Tenant isolation: select chỉ trong tenant
- Insert: chỉ qua RPC (security definer)
- Không cho update/delete (immutable)

## Retention
- Mặc định: giữ vĩnh viễn
- Cron monthly archive ra cold storage (TBD)

## Query helpers
- `useAuditLog(entityType, entityId)` — load timeline cho entity
- Page `/settings/audit-log` — global view (manager+)
