import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuperAdminStats, useTenantGrowth, useChurnRate } from '@/hooks/useSuperAdminStats';
import { 
  Users, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { TenantGrowthChart } from '../analytics/TenantGrowthChart';
import { ChurnRateCard } from '../analytics/ChurnRateCard';

export function TenantAnalytics() {
  const { t } = useTranslation('superAdmin');
  const { data: stats } = useSuperAdminStats();
  const { data: growth } = useTenantGrowth(30);
  const { data: churn } = useChurnRate(30);

  const growthRate = growth && growth.length > 1
    ? ((Number(growth[growth.length - 1]?.newTenants || 0) / Number(growth[0]?.newTenants || 1) - 1) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('tenants.analytics.totalTenants')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.total_tenants || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.active_tenants || 0} {t('tenants.analytics.active')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('tenants.analytics.growthRate')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">+{growthRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('tenants.analytics.last30Days')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('tenants.analytics.churnRate')}
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {churn?.churnRate || '0'}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {churn?.churnedTenants || 0} {t('tenants.analytics.churned')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('tenants.analytics.atRisk')}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {(stats?.expiring_7_days || 0) + (stats?.in_grace_period || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('tenants.analytics.needAttention')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('tenants.analytics.growthTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantGrowthChart />
        </CardContent>
      </Card>

      {/* Churn Analysis */}
      <ChurnRateCard churn={churn} />

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{t('tenants.analytics.statusDistribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <StatusBar
              label={t('tenants.status.active')}
              count={stats?.active_tenants || 0}
              total={stats?.total_tenants || 1}
              color="bg-green-500"
            />
            <StatusBar
              label={t('tenants.status.trial')}
              count={stats?.trial_tenants || 0}
              total={stats?.total_tenants || 1}
              color="bg-blue-500"
            />
            <StatusBar
              label={t('tenants.status.gracePeriod')}
              count={stats?.in_grace_period || 0}
              total={stats?.total_tenants || 1}
              color="bg-yellow-500"
            />
            <StatusBar
              label={t('tenants.status.suspended')}
              count={stats?.suspended_tenants || 0}
              total={stats?.total_tenants || 1}
              color="bg-red-500"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StatusBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

function StatusBar({ label, count, total, color }: StatusBarProps) {
  const percentage = ((count / total) * 100).toFixed(1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {count} ({percentage}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
