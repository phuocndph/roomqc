import { useTranslation } from 'react-i18next';
import { useSuperAdminStats } from '@/hooks/useSuperAdminStats';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export function TenantStatusBreakdown() {
  const { t } = useTranslation('superAdmin');
  const { data: stats, isLoading } = useSuperAdminStats();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  const total = stats?.total_tenants || 1;
  const statuses = [
    {
      label: t('tenants.status.active'),
      value: stats?.active_tenants || 0,
      color: 'bg-green-500',
    },
    {
      label: t('tenants.status.trial'),
      value: stats?.trial_tenants || 0,
      color: 'bg-blue-500',
    },
    {
      label: t('tenants.status.expiringSoon'),
      value: stats?.expiring_7_days || 0,
      color: 'bg-amber-500',
    },
    {
      label: t('tenants.status.gracePeriod'),
      value: stats?.in_grace_period || 0,
      color: 'bg-red-500',
    },
    {
      label: t('tenants.status.suspended'),
      value: stats?.suspended_tenants || 0,
      color: 'bg-gray-500',
    },
  ];

  return (
    <div className="space-y-3">
      {statuses.map((status) => {
        const percentage = total > 0 ? (status.value / total) * 100 : 0;
        return (
          <div key={status.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{status.label}</span>
              <span className="font-medium tabular-nums">
                {status.value} ({percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${status.color} rounded-full transition-all`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
