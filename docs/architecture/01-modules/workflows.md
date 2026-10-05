# Module: Workflows / Automation Engine

## Phạm vi
Cho phép tenant tự định nghĩa workflow `Trigger × Condition × Action` cho automation (auto-assign, escalation, notification rules…).

## Bảng chính
- `workflows` — định nghĩa workflow (name, trigger_type, conditions JSONB, enabled)
- `workflow_actions` — actions (type, config JSONB, order)
- `workflow_executions` — log mỗi lần trigger fire (status, error, payload)

## Edge function
- `execute-workflow` — invoke từ DB trigger / cron / app event → resolve conditions → run actions sequentially → log.

## Trigger types
| Trigger | Source |
|---|---|
| `booking.created` | DB trigger insert |
| `booking.checked_in` | RPC `perform_checkin` |
| `room_check.issue_reported` | RPC `submit_room_check_lean` |
| `task.overdue` | Cron 5 phút |
| `payment.received` | SePay webhook |
| `subscription.expiring_soon` | Cron daily |

## Action types
| Action | Config |
|---|---|
| `notify` | channel, template, recipients_rule |
| `assign_task` | role, department, round_robin |
| `set_priority` | level |
| `webhook` | url, headers, payload_template |

## UI
`/settings/workflows` — list, create, edit, test (dry-run với sample payload).
Permission: `manage_workflows` (manager+).

## Memory
`automation-engine-spec`.

## Refactor cần thiết
- Hiện chưa có visual builder, chỉ JSON editor.
- Cần versioning workflow + rollback.
