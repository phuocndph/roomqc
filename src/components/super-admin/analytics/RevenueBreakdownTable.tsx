import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface RevenueByPlan {
  planName: string;
  totalRevenue: number;
  tenantCount: number;
}

interface RevenueBreakdownTableProps {
  data: RevenueByPlan[];
  isLoading?: boolean;
}

export function RevenueBreakdownTable({ data, isLoading }: RevenueBreakdownTableProps) {
  const { t } = useTranslation('superAdmin');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const totalRevenue = data.reduce((sum, plan) => sum + plan.totalRevenue, 0);
  const totalCustomers = data.reduce((sum, plan) => sum + plan.tenantCount, 0);

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium text-xs">{t('analytics.revenue.planColumn')}</th>
            <th className="text-right py-2 px-3 font-medium text-xs">{t('analytics.revenue.customersColumn')}</th>
            <th className="text-right py-2 px-3 font-medium text-xs">{t('analytics.revenue.revenueColumn')}</th>
            <th className="text-right py-2 px-3 font-medium text-xs">ARPU</th>
            <th className="text-right py-2 px-3 font-medium text-xs">%</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground text-xs">
                {t('dashboard.noData')}
              </td>
            </tr>
          ) : (
            <>
              {data.map((plan, idx) => {
                const arpu = plan.tenantCount > 0 ? plan.totalRevenue / plan.tenantCount : 0;
                const percentage = totalRevenue > 0 ? (plan.totalRevenue / totalRevenue) * 100 : 0;

                return (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium">{plan.planName || 'N/A'}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{plan.tenantCount}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(plan.totalRevenue)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(arpu)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                      {percentage.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              <tr className="bg-muted/30 font-medium">
                <td className="py-2 px-3">{t('analytics.revenue.total')}</td>
                <td className="py-2 px-3 text-right tabular-nums">{totalCustomers}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(totalRevenue)}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {formatCurrency(totalCustomers > 0 ? totalRevenue / totalCustomers : 0)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">100%</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
