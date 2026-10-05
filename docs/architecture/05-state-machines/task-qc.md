# State Machine: Task & QC Lifecycle

## Task statuses
- `pending` — chờ assign
- `assigned` — đã giao
- `in_progress` — đang làm
- `submitted_for_qc` — staff submit chờ QC
- `qc_passed` — QC duyệt
- `qc_rejected` — QC từ chối, quay lại staff
- `completed` — hoàn tất (= qc_passed final)
- `cancelled` — hủy

## Diagram

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> assigned: Round-robin / manual
    assigned --> in_progress: Staff bắt đầu
    in_progress --> submitted_for_qc: Submit
    submitted_for_qc --> qc_passed: QC pass
    submitted_for_qc --> qc_rejected: QC reject (kèm lý do + ảnh)
    qc_rejected --> in_progress: Staff làm lại
    qc_passed --> completed
    completed --> [*]
    pending --> cancelled
    assigned --> cancelled
    cancelled --> [*]
```

## RPC: `transition_task_status`
- Validate transition matrix
- QC reject phải có `reason` + ≥1 photo
- Notify multi-channel khi reject (in-app + push + telegram)

## QC Dashboard
- `/housekeeping/qc` — chart trend pass/reject + drill-down + Export CSV
- Memory `qc-dashboard-and-notifications-v1`

## Memory
`state-machine/v2-phase2-tasks-bookings`, `qc-dashboard-and-notifications-v1`.
