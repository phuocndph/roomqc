import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportToExcel } from '@/utils/exportUtils';
import { useTenants } from '@/hooks/super-admin/useTenants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TenantsTable } from './TenantsTable';
import { TenantAnalytics } from './TenantAnalytics';
import { BulkActions } from './BulkActions';
import { Download, Search } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';
import { defaultTenantDirectoryRequest, type TenantDirectoryRequest } from '@/lib/admin-tenant-directory';

export function AdvancedTenantsManagement() {
  const { t } = useTranslation('superAdmin');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TenantDirectoryRequest['sort']>('created_at');
  const [descending, setDescending] = useState(true);

  const request = { ...defaultTenantDirectoryRequest, statusFilter, planFilter, approvalFilter, searchQuery, page, sort, descending };
  const directory = useTenants(request);
  const { data, isError, isLoading, isFetching } = directory;
  const filteredTenants = isError ? [] : data?.items || [];
  const visibleSelectedTenants = selectedTenants.filter(id => filteredTenants.some(tenant => tenant.id === id));
  const planOptions = isError ? [] : data?.plans || [];
  const changePage = (value: number) => { setPage(value); setSelectedTenants([]); };
  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
    setSelectedTenants([]);
  };

  const handleExport = () => {
    if (!isError && !isLoading && !isFetching && filteredTenants.length > 0) {
      const exportData = filteredTenants.map((t) => ({
        'Tên': t.name,
        'Email': t.email || '',
        'Gói': t.subscription_plan?.name || '',
        'Trạng thái': t.actual_status,
        'Số phòng': t.registered_rooms || 0,
        'Ngày tạo': t.created_at,
        'Hết hạn': t.subscription_end_date || '',
      }));
      exportToExcel(exportData, `tenants-page-${(data?.page || 0) + 1}-${new Date().toISOString().slice(0, 10)}`, 'Khách hàng');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title={t('tenants.title')}
        description={t('tenants.subtitle')}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 pb-4 border-b">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            aria-label={t('tenants.searchPlaceholder')}
            placeholder={t('tenants.searchPlaceholder')}
            value={searchQuery}
            maxLength={200}
            onChange={(e) => changeFilter(setSearchQuery)(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={changeFilter(setStatusFilter)}>
          <SelectTrigger aria-label={t('tenants.filterByStatus')} className="w-[160px] h-8 text-sm">
            <SelectValue placeholder={t('tenants.filterByStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tenants.allStatus')}</SelectItem>
            <SelectItem value="active">{t('tenants.status.active')}</SelectItem>
            <SelectItem value="trial">{t('tenants.status.trial')}</SelectItem>
            <SelectItem value="expired">{t('tenants.status.expired')}</SelectItem>
            <SelectItem value="not_registered">{t('tenants.status.notRegistered')}</SelectItem>
            <SelectItem value="expiring_soon">{t('tenants.status.expiringSoon')}</SelectItem>
            <SelectItem value="cancelled">{t('tenants.status.cancelled')}</SelectItem>
            <SelectItem value="suspended">{t('tenants.status.suspended')}</SelectItem>
            <SelectItem value="grace_period">{t('tenants.status.gracePeriod')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={planFilter} onValueChange={changeFilter(setPlanFilter)}>
          <SelectTrigger aria-label={t('tenants.filterByPlan')} className="w-[160px] h-8 text-sm">
            <SelectValue placeholder={t('tenants.filterByPlan')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tenants.allPlans')}</SelectItem>
            {planOptions.map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={approvalFilter} onValueChange={changeFilter(setApprovalFilter)}>
          <SelectTrigger aria-label={t('tenants.filterByApproval')} className="w-[160px] h-8 text-sm">
            <SelectValue placeholder={t('tenants.filterByApproval')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tenants.allApproval')}</SelectItem>
            <SelectItem value="approved">{t('tenants.approval.approved')}</SelectItem>
            <SelectItem value="pending">{t('tenants.approval.pending')}</SelectItem>
            <SelectItem value="rejected">{t('tenants.approval.rejected')}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={handleExport} className="h-8" disabled={isError || isLoading || isFetching || !filteredTenants.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Xuất trang hiện tại
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Bộ lọc và số kết quả áp dụng toàn bộ khách hàng. File xuất chỉ gồm trang hiện tại.
        Tab phân tích dùng nguồn thống kê riêng, không thay đổi theo bộ lọc này.
      </p>

      {/* Bulk Actions */}
      {!isError && !isFetching && visibleSelectedTenants.length > 0 && (
        <BulkActions
          selectedTenants={visibleSelectedTenants}
          onClearSelection={() => setSelectedTenants([])}
        />
      )}

      {/* Content Tabs */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">{t('tenants.listTab')}</TabsTrigger>
          <TabsTrigger value="analytics">{t('tenants.analyticsTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <TenantsTable
            directory={directory}
            onPageChange={changePage}
            sort={sort}
            descending={descending}
            onSortChange={(value, desc) => { setSort(value); setDescending(desc); changePage(0); }}
            selectedTenants={visibleSelectedTenants}
            onSelectionChange={setSelectedTenants}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <TenantAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
