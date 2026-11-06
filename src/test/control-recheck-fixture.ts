import { registrationId, controlWorkspaceDetail } from './control-admin-fixture'
import { workspaceDetailsSchema, type ControlWorkspaceRecheckReceipt, type ControlWorkspaceRecheckRequest } from '@/lib/control-admin'
export const recheckKey = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export function controlRecheckRequest(): ControlWorkspaceRecheckRequest {
  return { target: registrationId, key: recheckKey, expectedVersion: 1, expectedSnapshotSha256: 'a'.repeat(64), reason: 'Inspect existing registration' }
}
export function controlRecheckReceipt(): ControlWorkspaceRecheckReceipt {
  return { commandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requestKey: recheckKey, status: 'succeeded', workspaceId: registrationId,
    clusterId: 'local-a', routingVersion: 1, outcome: 'reused_job', reasonCode: 'SETUP_JOB_REUSED', jobId: null, recordedAt: '2026-10-28T00:02:00Z' }
}
export function controlRecheckDetail() {
  return workspaceDetailsSchema.parse({ ...controlWorkspaceDetail(), recheck: { routingVersion: 1, snapshotSha256: 'a'.repeat(64) } })
}
