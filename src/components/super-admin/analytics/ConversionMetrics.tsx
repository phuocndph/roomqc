import { useTranslation } from 'react-i18next';
import { useSuperAdminStats, useConversionMetrics } from '@/hooks/useSuperAdminStats';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Users, UserCheck, Percent } from 'lucide-react';

interface ConversionMetricsProps {
  days?: number;
}

export function ConversionMetrics({ days = 30 }: ConversionMetricsProps) {
  const { t } = useTranslation('superAdmin');
  const { data: stats, isLoading: statsLoading } = useSuperAdminStats();
  const { data: conversionData, isLoading: conversionLoading } = useConversionMetrics(days);

  const isLoading = statsLoading || conversionLoading;

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 border rounded-lg">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const trialCount = stats?.trial_tenants || 0;
  const activeCount = stats?.active_tenants || 0;
  const totalTrials = conversionData?.totalTrials || 0;
  const converted = conversionData?.converted || 0;
  const conversionRate = conversionData?.conversionRate || '0';

  return (
    <div className="space-y-4">
      {/* Conversion Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Users className="h-3.5 w-3.5" />
            <span>{t('analytics.conversion.trialUsers')}</span>
          </div>
          <div className="text-xl font-semibold">{trialCount}</div>
          <p className="text-xs text-muted-foreground">{t('analytics.conversion.currentTrials')}</p>
        </div>

        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <UserCheck className="h-3.5 w-3.5" />
            <span>{t('analytics.conversion.converted')}</span>
          </div>
          <div className="text-xl font-semibold text-green-600">{converted}</div>
          <p className="text-xs text-muted-foreground">
            {t('analytics.conversion.fromTrials', { count: totalTrials })}
          </p>
        </div>

        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Percent className="h-3.5 w-3.5" />
            <span>{t('analytics.conversion.rate')}</span>
          </div>
          <div className="text-xl font-semibold text-green-600">{conversionRate}%</div>
          <p className="text-xs text-muted-foreground">{t('analytics.conversion.trialToPaid')}</p>
        </div>
      </div>

      {/* Conversion Funnel Visualization */}
      <div className="p-4 border rounded-lg">
        <h4 className="text-sm font-medium mb-3">{t('analytics.conversion.funnel')}</h4>
        <div className="space-y-2">
          {/* Total Trials */}
          <div className="flex items-center gap-3">
            <div className="w-20 text-xs text-muted-foreground">{t('analytics.conversion.trials')}</div>
            <div className="flex-1 h-6 bg-muted rounded-sm relative overflow-hidden">
              <div
                className="h-full bg-primary/30 rounded-sm transition-all"
                style={{ width: '100%' }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {totalTrials}
              </span>
            </div>
          </div>

          {/* Converted */}
          <div className="flex items-center gap-3">
            <div className="w-20 text-xs text-muted-foreground">{t('analytics.conversion.paid')}</div>
            <div className="flex-1 h-6 bg-muted rounded-sm relative overflow-hidden">
              <div
                className="h-full bg-primary/50 rounded-sm transition-all"
                style={{ width: totalTrials > 0 ? `${(converted / totalTrials) * 100}%` : '0%' }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {converted}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
