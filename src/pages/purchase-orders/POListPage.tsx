import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePurchaseOrders, usePOStats } from '@/hooks/usePurchaseOrders';
import { POFilters as POFiltersType } from '@/types/purchase-order.types';
import POTable from '@/components/purchase-orders/POTable';
import POFilters from '@/components/purchase-orders/POFilters';
import POStatsCards from '@/components/purchase-orders/POStatsCards';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useBreakpoint } from '@/lib/breakpoints';
import { MobilePOListPage } from '@/components/purchase-orders/MobilePOListPage';

const POListPage: React.FC = () => {
  const { t } = useTranslation('purchaseOrders');
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [filters, setFilters] = useState<POFiltersType>({
    status: 'all',
    sort_by: 'date',
    sort_order: 'desc'
  });
  const [selectedPOs, setSelectedPOs] = useState<string[]>([]);
  
  const { data: stats } = usePOStats();
  const { data: purchaseOrders, isLoading } = usePurchaseOrders(filters);

  if (isMobile) {
    return <MobilePOListPage />;
  }

  const handleFilterChange = (newFilters: Partial<POFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleTabChange = (value: string) => {
    setSelectedTab(value);
    if (value === 'all') {
      handleFilterChange({ status: 'all' });
    } else {
      handleFilterChange({ status: value as any });
    }
  };

  const getTabCount = (status: string) => {
    if (!purchaseOrders) return 0;
    if (status === 'all') return purchaseOrders.length;
    return purchaseOrders.filter(po => po.status === status).length;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('page.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="hover:bg-muted hover:text-foreground">
            <FileDown className="w-4 h-4 mr-2" />
            {t('page.exportExcel')}
          </Button>
          <Button onClick={() => navigate('/purchase-orders/new')}>
            <Plus className="w-4 h-4 mr-2" />
            {t('page.createNew')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="all">
            {t('tabs.all')} ({getTabCount('all')})
          </TabsTrigger>
          <TabsTrigger value="draft">
            {t('tabs.draft')} ({getTabCount('draft')})
          </TabsTrigger>
          <TabsTrigger value="submitted">
            {t('tabs.submitted')} ({getTabCount('submitted')})
          </TabsTrigger>
          <TabsTrigger value="approved">
            {t('tabs.approved')} ({getTabCount('approved')})
          </TabsTrigger>
          <TabsTrigger value="ordered">
            {t('tabs.ordered')} ({getTabCount('ordered')})
          </TabsTrigger>
          <TabsTrigger value="partial">
            {t('tabs.partial')} ({getTabCount('partial')})
          </TabsTrigger>
          <TabsTrigger value="received">
            {t('tabs.received')} ({getTabCount('received')})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            {t('tabs.cancelled')} ({getTabCount('cancelled')})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Cards */}
      <POStatsCards stats={stats} />

      {/* Filters */}
      <POFilters filters={filters} onChange={handleFilterChange} />

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-muted hover:text-foreground"
          onClick={() => handleFilterChange({ created_by: 'me' })}
        >
          {t('quickFilters.createdByMe')}
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-muted hover:text-foreground"
          onClick={() => handleFilterChange({ status: 'submitted' })}
        >
          {t('quickFilters.pendingMyApproval')}
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-muted hover:text-foreground"
          onClick={() => handleFilterChange({ min_amount: 10000000 })}
        >
          {t('quickFilters.highValue')}
        </Badge>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <POTable
          purchaseOrders={purchaseOrders || []}
          selectedPOs={selectedPOs}
          onSelectionChange={setSelectedPOs}
        />
      )}
    </div>
  );
};

export default POListPage;
