import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface ChurnRateCardProps {
  churn: any;
}

export function ChurnRateCard({ churn }: ChurnRateCardProps) {
  const { t } = useTranslation('superAdmin');
  const churnRate = parseFloat(churn?.churnRate || '0');
  const isHealthy = churnRate < 5;

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-medium mb-3">
        {t('analytics.churn.title', 'Phân tích Churn')}
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-xs text-muted-foreground">
              {t('analytics.churn.rate', 'Tỷ lệ Churn')}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold">{churnRate}%</span>
              {isHealthy ? (
                <TrendingDown className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-red-600" />
              )}
            </div>
          </div>
          <span className={isHealthy ? 'text-xs font-medium text-green-600' : 'text-xs font-medium text-red-600'}>
            {isHealthy 
              ? t('analytics.churn.healthy', 'Ổn định') 
              : t('analytics.churn.atRisk', 'Cần chú ý')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground">
              {t('analytics.churn.churnedTenants', 'Tenant đã rời')}
            </p>
            <p className="text-xl font-semibold mt-1">{churn?.churnedTenants || 0}</p>
          </div>
          <div className="p-3 rounded-lg border">
            <p className="text-xs text-muted-foreground">
              {t('analytics.churn.period', 'Khoảng thời gian')}
            </p>
            <p className="text-xl font-semibold mt-1">
              {t('analytics.churn.days', '30 ngày')}
            </p>
          </div>
        </div>

        {!isHealthy && (
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-600">
              {t('analytics.churn.warning', 'Tỷ lệ churn vượt ngưỡng an toàn. Cần xem xét chiến lược giữ chân khách hàng.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
