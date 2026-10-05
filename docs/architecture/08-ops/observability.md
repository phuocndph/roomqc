# Observability

## Logging
- **Edge functions**: `console.log/error` → Supabase logs
- **Frontend errors**: try/catch + toast; chưa có Sentry (TODO)
- **DB**: pg_audit cho slow queries (TBD)

## Metrics cần track (TODO)
- API p95 latency per RPC
- Webhook success rate (SePay, Telegram)
- Cron job duration & failure
- Outbox queue depth (`room_check_outbox`)
- Realtime channel subscriber count

## Health checks
- `cloud_status` tool — provider lifecycle
- Edge fn `cleanup-sessions` cũng làm health beacon

## Alerting (cần làm)
- Webhook fail > 3 lần liên tiếp
- Outbox stuck > 100 items
- Cron skip > 1 lần
- DB connections > 80%
- Tenant approaching room limit / suspension

## Performance memory
- `room-check-submission-optimization` — non-blocking UI submit
- `staff-presence-and-heartbeat-logic` — 5 phút heartbeat, 30 phút offline

## Recommended next
- Tích hợp Sentry frontend
- pg_stat_statements analysis định kỳ
- Structured logging với correlation_id ở edge fn
