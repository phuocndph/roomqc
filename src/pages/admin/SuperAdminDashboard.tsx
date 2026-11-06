import { SuperAdminDashboard as SuperAdminDashboardComponent } from '@/components/super-admin/SuperAdminDashboard'
import { SubscriptionJobMonitor } from '@/components/super-admin/SubscriptionJobMonitor'

export function SuperAdminDashboard() {
  return <div className="space-y-6"><SubscriptionJobMonitor /><SuperAdminDashboardComponent /></div>
}
