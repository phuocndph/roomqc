import { controlCluster } from './control-admin-fixture'
import type { ControlClusterRequest } from '@/lib/control-admin'
type ClusterOperation = Exclude<ControlClusterRequest['operation'], 'register_cluster'>

export function controlClusterRequest(operation: ClusterOperation = 'close_admission'): ControlClusterRequest {
  return { key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', target: 'local-a', expectedVersion: 1, operation,
    reason: 'Tạm đóng cụm để kiểm tra', payload: operation === 'update_policy' ? { tenantLimit: 15 } : {} } as ControlClusterRequest
}
export function controlClusterReceipt(operation: ControlClusterRequest['operation'] = 'close_admission') {
  const open = operation === 'open_admission'
  const maintenance = operation === 'set_host_maintenance'
  return { commandId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'succeeded', targetVersion: 2,
    result: controlCluster({ rowVersion: 2, status: operation === 'set_draining' || maintenance ? 'draining' : 'active',
      hostStatus: maintenance ? 'maintenance' : 'active',
      tenantLimit: operation === 'update_policy' ? 15 : 20,
      admission: { decision: open ? 'open' : 'manual_closed', reasonCodes: open ? [] : ['MANUAL_CLOSED'],
        policyVersion: 1, evaluatedAt: '2026-10-28T00:01:00Z', healthGeneration: null } }) }
}
export function freshControlCluster() {
  const now = Date.now()
  return controlCluster({ health: { status: 'healthy', observedAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(),
    validUntil: new Date(now + 60000).toISOString(), generation: 1, schemaVersion: 2, measurementScope: 'docker-desktop-vm', dataDisks: null, reasonCodes: [],
    metrics: { cpuUsedPercent: 20, memoryAvailableBytes: 8000000000, memoryTotalBytes: 16000000000, dataDiskFreeBytes: 100000000000,
      dataDiskTotalBytes: 200000000000, dataDiskInodeFreePercent: 90, dbConnectionsUsed: 10, dbConnectionBudget: 100 } } })
}
