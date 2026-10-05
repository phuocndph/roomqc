import { useTranslation } from 'react-i18next';
import { exportToExcel } from '@/utils/exportUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  Download, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSuperAdminStats, useRevenueByPlan, useTenantGrowth, useChurnRate } from '@/hooks/useSuperAdminStats';
import { RevenueChart } from '../analytics/RevenueChart';
import { MRRChart } from '../analytics/MRRChart';
import { TenantGrowthChart } from '../analytics/TenantGrowthChart';
import { PlanDistributionChart } from '../analytics/PlanDistributionChart';
import { ChurnRateCard } from '../analytics/ChurnRateCard';
import { RecentActivityFeed } from './RecentActivityFeed';
import { QuickActions } from './QuickActions';
import { HealthIndicators } from './HealthIndicators';
import { PageHeader } from '../shared/PageHeader';

export function AdvancedDashboard() {
  const { t } = useTranslation('superAdmin');
  const { data: stats, isLoading, refetch } = useSuperAdminStats();
  const { data: revenueByPlan } = useRevenueByPlan();
  const { data: growth } = useTenantGrowth(30);
  const { data: churn } = useChurnRate(30);

  const totalRevenue = Number(stats?.revenue_this_month || 0);
  const lastMonthRevenue = Number(stats?.revenue_last_month || 0);
  const revenueChange = lastMonthRevenue > 0
    ? (((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
    : '0';
  const arpu = stats?.active_tenants 
    ? (Number(stats.mrr) / Number(stats.active_tenants)).toFixed(2) 
    : '0';
  const growthRate = growth && growth.length > 1
    ? (((Number(growth[growth.length - 1]?.newTenants) || 0) / (Number(growth[0]?.newTenants) || 1) - 1) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.subtitle')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t('dashboard.refresh')}
            </Button>
            <Button size="sm" onClick={() => {
              if (stats) {
                exportToExcel([{
                  'Doanh thu tháng này': stats.revenue_this_month,
                  'Doanh thu tháng trước': stats.revenue_last_month,
                  'MRR': stats.mrr,
                  'Khách hàng hoạt động': stats.active_tenants,
                  'Khách hàng dùng thử': stats.trial_tenants,
                  'Sắp hết hạn (7 ngày)': stats.expiring_7_days,
                  'Đăng ký mới tháng này': stats.new_signups_this_month,
                }], `super-admin-report-${new Date().toISOString().slice(0, 10)}`, 'Báo cáo');
              }
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {t('dashboard.exportReport')}
            </Button>
          </>
        }
      />

      {/* Quick Metrics */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t('dashboard.totalRevenue')}
          value={`${totalRevenue.toLocaleString('vi-VN')}đ`}
          change={`${Number(revenueChange) >= 0 ? '+' : ''}${revenueChange}%`}
          trend={Number(revenueChange) >= 0 ? 'up' : 'down'}
          icon={DollarSign}
          vsLastMonth={t('dashboard.vsLastMonth')}
        />
        <MetricCard
          title={t('dashboard.activeCustomers')}
          value={stats?.active_tenants || 0}
          subtitle={`${stats?.trial_tenants || 0} ${t('dashboard.onTrial')}`}
          icon={Users}
        />
        <MetricCard
          title={t('dashboard.recurringRevenue')}
          value={`${(stats?.mrr || 0).toLocaleString('vi-VN')}đ`}
          change={`+${growthRate}%`}
          trend={Number(growthRate) > 0 ? 'up' : 'down'}
          icon={TrendingUp}
          vsLastMonth={t('dashboard.vsLastMonth')}
        />
        <MetricCard
          title={t('dashboard.arpu')}
          value={`${Number(arpu).toLocaleString('vi-VN')}đ`}
          subtitle={t('dashboard.arpuDesc')}
          icon={DollarSign}
        />
      </div>

      {/* Health Indicators */}
      <HealthIndicators stats={stats} churn={churn} />

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('dashboard.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="revenue">{t('dashboard.tabs.revenue')}</TabsTrigger>
          <TabsTrigger value="tenants">{t('dashboard.tabs.tenants')}</TabsTrigger>
          <TabsTrigger value="activity">{t('dashboard.tabs.activity')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium mb-3">{t('dashboard.charts.revenueTrend')}</h3>
              <RevenueChart />
            </div>

            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium mb-3">{t('dashboard.charts.mrrGrowth')}</h3>
              <MRRChart />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium mb-3">{t('dashboard.charts.tenantGrowth')}</h3>
              <TenantGrowthChart />
            </div>

            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium mb-3">{t('dashboard.charts.planDistribution')}</h3>
              <PlanDistributionChart data={revenueByPlan} />
            </div>
          </div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="p-3 border rounded-lg">
              <span className="text-xs text-muted-foreground">{t('dashboard.revenue.thisMonth')}</span>
              <div className="text-xl font-semibold mt-1">
                {(stats?.revenue_this_month || 0).toLocaleString('vi-VN')}đ
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.revenue.fromMonthlySubscriptions')}
              </p>
            </div>

            <div className="p-3 border rounded-lg">
              <span className="text-xs text-muted-foreground">{t('dashboard.revenue.lastMonth')}</span>
              <div className="text-xl font-semibold mt-1">
                {(stats?.revenue_last_month || 0).toLocaleString('vi-VN')}đ
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.revenue.lastMonthRevenue')}
              </p>
            </div>

            <div className="p-3 border rounded-lg">
              <span className="text-xs text-muted-foreground">{t('dashboard.revenue.arr')}</span>
              <div className="text-xl font-semibold mt-1">
                {((stats?.mrr || 0) * 12).toLocaleString('vi-VN')}đ
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.revenue.annualRecurringRevenue')}
              </p>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="text-sm font-medium mb-3">{t('dashboard.revenue.byPlan')}</h3>
            <RevenueByPlanTable data={revenueByPlan} noDataText={t('dashboard.noData')} customersText={t('dashboard.revenue.customers')} />
          </div>
        </TabsContent>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusCard
              title={t('dashboard.tenants.active')}
              count={stats?.active_tenants || 0}
              status="good"
              icon={CheckCircle2}
            />
            <StatusCard
              title={t('dashboard.tenants.trial')}
              count={stats?.trial_tenants || 0}
              status="info"
              icon={Users}
            />
            <StatusCard
              title={t('dashboard.tenants.expiringSoon')}
              count={stats?.expiring_7_days || 0}
              status="warning"
              icon={AlertTriangle}
            />
            <StatusCard
              title={t('dashboard.tenants.gracePeriod')}
              count={stats?.in_grace_period || 0}
              status="critical"
              icon={AlertTriangle}
            />
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="text-sm font-medium mb-3">{t('dashboard.tenants.growthLast30Days')}</h3>
            <TenantGrowthChart />
          </div>

          <ChurnRateCard churn={churn} />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentActivityFeed />
            </div>
            <div>
              <QuickActions />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper Components
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down';
  subtitle?: string;
  icon: any;
  vsLastMonth?: string;
}

function MetricCard({ title, value, change, trend, subtitle, icon: Icon, vsLastMonth }: MetricCardProps) {
  return (
    <div className="p-3 border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-xl font-semibold">{value}</div>
      {change && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up' ? (
            <TrendingUp className="h-3 w-3 text-green-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600" />
          )}
          <span className={cn("text-xs", trend === 'up' ? 'text-green-600' : 'text-red-600')}>
            {change}
          </span>
          {vsLastMonth && <span className="text-xs text-muted-foreground ml-1">{vsLastMonth}</span>}
        </div>
      )}
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

interface StatusCardProps {
  title: string;
  count: number;
  status: 'good' | 'info' | 'warning' | 'critical';
  icon: any;
}

function StatusCard({ title, count, status, icon: Icon }: StatusCardProps) {
  const statusColors = {
    good: 'text-green-600',
    info: 'text-blue-600',
    warning: 'text-amber-600',
    critical: 'text-red-600',
  };

  return (
    <div className="p-3 border rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", statusColors[status])} />
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <div className={cn("text-xl font-semibold", statusColors[status])}>
        {count}
      </div>
    </div>
  );
}

function RevenueByPlanTable({ data, noDataText, customersText }: { data: any; noDataText: string; customersText: string }) {
  if (!data || data.length === 0) return <p className="text-center text-muted-foreground text-sm">{noDataText}</p>;

  return (
    <div className="space-y-2">
      {data.map((plan: any, index: number) => (
        <div key={index} className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
          <div className="flex-1">
            <div className="text-sm font-medium">{plan.planName}</div>
            <div className="text-xs text-muted-foreground">{plan.tenantCount} {customersText}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-green-600">
              {plan.totalRevenue.toLocaleString('vi-VN')}đ
            </div>
            <div className="text-xs text-muted-foreground">
              {plan.tenantCount > 0 ? (plan.totalRevenue / plan.tenantCount).toLocaleString('vi-VN') : 0}đ ARPU
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
