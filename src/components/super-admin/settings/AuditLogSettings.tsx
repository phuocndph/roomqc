import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Download, Search, Loader2, FileJson } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminActivities } from '@/hooks/super-admin/usePlatformSettings';
import { Badge } from '@/components/ui/badge';

const getActionBadgeVariant = (action: string) => {
  switch (action.toLowerCase()) {
    case 'create':
    case 'insert':
      return 'default';
    case 'update':
    case 'edit':
      return 'secondary';
    case 'delete':
    case 'remove':
      return 'destructive';
    default:
      return 'outline';
  }
};

export function AuditLogSettings() {
  const { t } = useTranslation('superAdmin');
  const { data: activities, isLoading } = useAdminActivities(100);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredActivities = activities?.filter(activity => 
    activity.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    activity.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    activity.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    activity.action?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCSV = () => {
    if (!activities?.length) return;

    const headers = ['Thời gian', 'Admin', 'Hành động', 'Đối tượng', 'Chi tiết'];
    const rows = activities.map(activity => [
      format(new Date(activity.created_at), 'dd/MM/yyyy HH:mm'),
      activity.user_name || 'N/A',
      activity.action || '',
      activity.entity_name || '',
      activity.description || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Export */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder={t('settings.audit.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          {t('settings.audit.export')}
        </Button>
      </div>

      {/* Activities Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[150px]">{t('settings.audit.time')}</TableHead>
                <TableHead className="text-xs w-[150px]">{t('settings.audit.admin')}</TableHead>
                <TableHead className="text-xs w-[100px]">{t('settings.audit.action')}</TableHead>
                <TableHead className="text-xs w-[150px]">{t('settings.audit.entity')}</TableHead>
                <TableHead className="text-xs">{t('settings.audit.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <FileJson className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Không có hoạt động nào</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredActivities?.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(activity.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>
                        <span className="font-medium">{activity.user_name || 'N/A'}</span>
                        {activity.user_role && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({activity.user_role})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(activity.action)} className="text-xs">
                        {activity.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{activity.entity_type}:</span>
                        <span className="font-mono text-xs">{activity.entity_name || activity.entity_id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {activity.description}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {filteredActivities && filteredActivities.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Hiển thị {filteredActivities.length} hoạt động gần nhất
        </p>
      )}
    </div>
  );
}
