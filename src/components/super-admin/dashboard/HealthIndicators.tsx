import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthIndicatorsProps {
  stats: any;
  churn: any;
}

export function HealthIndicators({ stats, churn }: HealthIndicatorsProps) {
  const { t } = useTranslation('superAdmin');

  const indicators = [
    {
      name: t('health.expiringSoon'),
      value: stats?.expiring_7_days || 0,
      threshold: 10,
      status: (stats?.expiring_7_days || 0) < 10 ? 'good' : 'warning',
      message: t('health.tenantsExpire7Days', { count: stats?.expiring_7_days || 0 }),
    },
    {
      name: t('health.gracePeriod'),
      value: stats?.in_grace_period || 0,
      threshold: 5,
      status: (stats?.in_grace_period || 0) === 0 ? 'good' : 'critical',
      message: t('health.tenantsInGracePeriod', { count: stats?.in_grace_period || 0 }),
    },
    {
      name: t('health.churnRate'),
      value: parseFloat(churn?.churnRate || '0'),
      threshold: 5,
      status: parseFloat(churn?.churnRate || '0') < 5 ? 'good' : 'warning',
      message: t('health.churnLast30Days', { rate: churn?.churnRate || 0 }),
    },
    {
      name: t('health.newSignups'),
      value: stats?.new_signups_this_month || 0,
      threshold: 10,
      status: 'good',
      message: t('health.newSignupsThisMonth', { count: stats?.new_signups_this_month || 0 }),
    },
  ];

  const statusColors = {
    good: 'text-green-600',
    warning: 'text-amber-600',
    critical: 'text-red-600',
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'good') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t('health.title')}</h3>
      
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {indicators.map((indicator) => (
          <div
            key={indicator.name}
            className="p-3 border rounded-lg"
          >
            <div className="flex items-center gap-2 mb-2">
              <StatusIcon status={indicator.status} />
              <span className="text-xs text-muted-foreground">
                {indicator.name}
              </span>
            </div>
            <div className={cn(
              "text-lg font-semibold",
              statusColors[indicator.status as keyof typeof statusColors]
            )}>
              {indicator.value}
              {indicator.name === t('health.churnRate') && '%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{indicator.message}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(stats?.expiring_7_days || 0) >= 10 && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {t('health.expiringAlert', { count: stats.expiring_7_days })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
