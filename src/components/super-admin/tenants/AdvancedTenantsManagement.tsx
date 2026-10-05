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
import { Plus, Download, Search } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader';

export function AdvancedTenantsManagement() {
  const { t } = useTranslation('superAdmin');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);

  const { data: tenants } = useTenants();

  const handleExport = () => {
    if (tenants && tenants.length > 0) {
      const exportData = tenants.map((t: any) => ({
        'Tên': t.name,
        'Email': t.primary_contact_email || '',
        'Gói': t.subscription_tier || '',
        'Trạng thái': t.subscription_status || '',
        'Số phòng': t.registered_rooms || 0,
        'Ngày tạo': t.created_at,
        'Hết hạn': t.subscription_end_date || '',
      }));
      exportToExcel(exportData, `tenants-${new Date().toISOString().slice(0, 10)}`, 'Khách hàng');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title={t('tenants.title')}
        description={t('tenants.subtitle')}
        actions={
          <Button size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t('tenants.addTenant')}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 pb-4 border-b">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('tenants.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
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

        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder={t('tenants.filterByPlan')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tenants.allPlans')}</SelectItem>
            <SelectItem value="basic">{t('tenants.plans.basic')}</SelectItem>
            <SelectItem value="premium">{t('tenants.plans.premium')}</SelectItem>
            <SelectItem value="enterprise">{t('tenants.plans.enterprise')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder={t('tenants.filterByApproval')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tenants.allApproval')}</SelectItem>
            <SelectItem value="approved">{t('tenants.approval.approved')}</SelectItem>
            <SelectItem value="pending">{t('tenants.approval.pending')}</SelectItem>
            <SelectItem value="rejected">{t('tenants.approval.rejected')}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={handleExport} className="h-8">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {t('tenants.exportData')}
        </Button>
      </div>

      {/* Bulk Actions */}
      {selectedTenants.length > 0 && (
        <BulkActions
          selectedTenants={selectedTenants}
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
            statusFilter={statusFilter}
            planFilter={planFilter}
            approvalFilter={approvalFilter}
            searchQuery={searchQuery}
            selectedTenants={selectedTenants}
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
