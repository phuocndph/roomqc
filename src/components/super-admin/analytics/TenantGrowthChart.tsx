import { useTenantGrowth } from '@/hooks/useSuperAdminStats';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TenantGrowthChartProps {
  days?: number;
}

export function TenantGrowthChart({ days = 30 }: TenantGrowthChartProps) {
  const { t } = useTranslation('superAdmin');
  const { data, isLoading, error } = useTenantGrowth(days);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('analytics.errors.loadGrowth', 'Không thể tải dữ liệu tăng trưởng')}</AlertDescription>
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t('analytics.empty.growth', 'Chưa có dữ liệu tăng trưởng')}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="date" 
          className="text-xs text-muted-foreground"
          tickFormatter={(value) => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }}
        />
        <YAxis 
          className="text-xs text-muted-foreground"
          allowDecimals={false}
        />
        <Tooltip 
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
          }}
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('vi-VN');
          }}
        />
        <Bar 
          dataKey="newTenants" 
          fill="hsl(var(--primary))" 
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
