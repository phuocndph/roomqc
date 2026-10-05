import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportToCSV } from '@/utils/exportUtils';
import { DollarSign, TrendingUp, TrendingDown, Users, Download, FileText } from 'lucide-react';
import { PageHeader } from '@/components/super-admin/shared/PageHeader';
import { StatCard } from '@/components/super-admin/shared/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DateRangePicker, DateRange } from './DateRangePicker';
import { RevenueChart } from './RevenueChart';
import { TenantGrowthChart } from './TenantGrowthChart';
import { PlanDistributionChart } from './PlanDistributionChart';
import { ChurnRateCard } from './ChurnRateCard';
import { RevenueBreakdownTable } from './RevenueBreakdownTable';
import { ConversionMetrics } from './ConversionMetrics';
import { TenantStatusBreakdown } from './TenantStatusBreakdown';
import {
  useSuperAdminStats,
  useRevenueByMonth,
  useRevenueByPlan,
  useTenantGrowth,
  useChurnRate,
} from '@/hooks/useSuperAdminStats';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export function AdvancedAnalytics() {
  const { t } = useTranslation('superAdmin');
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  // Calculate days from date range
  const getDaysFromRange = (range: DateRange): number => {
    switch (range) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      default:
        return 30;
    }
  };

  const getMonthsFromRange = (range: DateRange): number => {
    switch (range) {
      case '7d':
        return 1;
      case '30d':
        return 3;
      case '90d':
        return 6;
      default:
        return 3;
    }
  };

  const days = getDaysFromRange(dateRange);
  const months = getMonthsFromRange(dateRange);

  // Fetch data
  const { data: stats, isLoading: statsLoading } = useSuperAdminStats();
  const { data: revenueByMonth, isLoading: revenueLoading } = useRevenueByMonth(months);
  const { data: revenueByPlan, isLoading: planRevenueLoading } = useRevenueByPlan();
  const { data: tenantGrowth, isLoading: growthLoading } = useTenantGrowth(days);
  const { data: churnData, isLoading: churnLoading } = useChurnRate(days);

  const isLoading = statsLoading || revenueLoading || planRevenueLoading || growthLoading || churnLoading;

  // Calculate growth rate
  const growthRate = tenantGrowth && tenantGrowth.length > 0
    ? tenantGrowth.reduce((sum, d) => sum + (d.newTenants as number), 0)
    : 0;

  // Calculate ARR from MRR
  const mrr = stats?.mrr || 0;
  const arr = mrr * 12;

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title={t('analytics.title')}
        description={t('analytics.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <Button variant="outline" size="sm" className="h-8" onClick={() => {
              const exportData = [
                { 'MRR': mrr, 'ARR': arr, 'Growth': growthRate, 'Churn Rate': churnData?.churnRate || 0 },
              ];
              if (revenueByPlan) {
                (revenueByPlan as any[]).forEach((p: any) => {
                  exportData.push({ 'MRR': p.planName, 'ARR': p.totalRevenue, 'Growth': p.tenantCount, 'Churn Rate': 0 });
                });
              }
              exportToCSV(exportData, `analytics-${new Date().toISOString().slice(0, 10)}`);
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">{t('analytics.export.csv')}</span>
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 border rounded-lg">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title={t('analytics.kpi.mrr')}
              value={formatCurrency(mrr)}
              icon={DollarSign}
              description={t('analytics.kpi.mrrDesc')}
            />
            <StatCard
              title={t('analytics.kpi.arr')}
              value={formatCurrency(arr)}
              icon={TrendingUp}
              description={t('analytics.kpi.arrDesc')}
            />
            <StatCard
              title={t('analytics.kpi.growth')}
              value={`+${growthRate}`}
              icon={Users}
              description={t('analytics.kpi.newCustomers', { days })}
            />
            <StatCard
              title={t('analytics.kpi.churnRate')}
              value={`${churnData?.churnRate || '0'}%`}
              icon={TrendingDown}
              description={t('analytics.kpi.churnDesc', { count: churnData?.churnedTenants || 0 })}
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="revenue" className="text-xs">{t('analytics.tabs.revenue')}</TabsTrigger>
          <TabsTrigger value="tenants" className="text-xs">{t('analytics.tabs.tenants')}</TabsTrigger>
          <TabsTrigger value="plans" className="text-xs">{t('analytics.tabs.plans')}</TabsTrigger>
          <TabsTrigger value="conversion" className="text-xs">{t('analytics.tabs.conversion')}</TabsTrigger>
        </TabsList>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">{t('analytics.revenue.trend')}</h3>
              <RevenueChart months={months} />
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">{t('analytics.revenue.byPlan')}</h3>
              <PlanDistributionChart data={(revenueByPlan as any[]) || []} />
            </div>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">{t('analytics.revenue.breakdown')}</h3>
            <RevenueBreakdownTable
              data={(revenueByPlan as any[]) || []}
              isLoading={planRevenueLoading}
            />
          </div>
        </TabsContent>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">{t('analytics.tenants.growth')}</h3>
              <TenantGrowthChart days={days} />
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">{t('analytics.tenants.statusBreakdown')}</h3>
              <TenantStatusBreakdown />
            </div>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">{t('analytics.tenants.churnAnalysis')}</h3>
            <ChurnRateCard churn={churnData} />
          </div>
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">{t('analytics.plans.distribution')}</h3>
              <PlanDistributionChart data={(revenueByPlan as any[]) || []} />
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">{t('analytics.plans.arpuByPlan')}</h3>
              <RevenueBreakdownTable
                data={(revenueByPlan as any[]) || []}
                isLoading={planRevenueLoading}
              />
            </div>
          </div>
        </TabsContent>

        {/* Conversion Tab */}
        <TabsContent value="conversion" className="space-y-4">
          <ConversionMetrics days={days} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
