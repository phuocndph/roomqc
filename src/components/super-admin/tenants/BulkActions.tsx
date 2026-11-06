import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface BulkActionsProps {
  selectedTenants: string[];
  onClearSelection: () => void;
}

// Bulk mutations remain unavailable until they have a server-side workflow.
export function BulkActions({ selectedTenants, onClearSelection }: BulkActionsProps) {
  const { t } = useTranslation('superAdmin');
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <Badge variant="secondary">{t('tenants.bulk.selected', { count: selectedTenants.length })}</Badge>
        <p className="text-sm text-muted-foreground">
          Thao tác hàng loạt chưa khả dụng. Hãy mở từng khách hàng để xử lý.
        </p>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          {t('tenants.bulk.clear')}
        </Button>
      </CardContent>
    </Card>
  );
}
