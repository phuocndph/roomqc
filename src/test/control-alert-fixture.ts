import { controlActor } from './control-admin-fixture'
import type { ControlAlert, ControlAlertReceipt } from '@/lib/control-admin'
export function controlAlert(overrides: Partial<ControlAlert> = {}): ControlAlert {
  return { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', resourceId: 'cluster-a', type: 'DISK_CRITICAL', severity: 'critical',
    openedAt: '2026-10-28T00:00:00Z', lastSeenAt: '2026-10-28T00:01:00Z', acknowledgedAt: null, acknowledgedBy: null,
    resolvedAt: null, rowVersion: 1, ...overrides }
}
export function controlAlertReceipt(): ControlAlertReceipt {
  return { commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'succeeded', targetVersion: 2,
    result: controlAlert({ rowVersion: 2, acknowledgedAt: '2026-10-28T00:02:00Z', acknowledgedBy: controlActor.actorId }) }
}
