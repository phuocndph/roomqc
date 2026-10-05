import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVendors, useVendorStats } from '@/hooks/useVendors';
import { VendorFilters as VendorFiltersType } from '@/types/vendor.types';
import { VendorCard } from '@/components/vendors/VendorCard';
import { VendorTable } from '@/components/vendors/VendorTable';
import { VendorFilters } from '@/components/vendors/VendorFilters';
import { StatsCards } from '@/components/vendors/StatsCards';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { Grid, List, Plus } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

type ViewMode = 'grid' | 'list';

export function VendorListPage() {
  const { t } = useTranslation('vendors');
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [filters, setFilters] = useState<VendorFiltersType>({
    category: 'all',
    status: 'all',
    sort_by: 'name',
    sort_order: 'asc'
  });
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);

  const { data: stats } = useVendorStats();
  const { data: vendors, isLoading } = useVendors(filters);

  const handleFilterChange = (newFilters: Partial<VendorFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleTabChange = (value: string) => {
    setSelectedTab(value);
    if (value === 'all') {
      handleFilterChange({ category: 'all' });
    } else {
      handleFilterChange({ category: value as any });
    }
  };

  const handleBulkCompare = () => {
    if (selectedVendors.length >= 2 && selectedVendors.length <= 5) {
      navigate(`/vendors/compare?ids=${selectedVendors.join(',')}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description', 'Quản lý thông tin và hiệu suất nhà cung cấp')}
      >
        <Button onClick={() => navigate('/vendors/new')}>
          <Plus className="w-4 h-4 mr-2" />
          {t('addNew')}
        </Button>
      </PageHeader>

      <Tabs value={selectedTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">
            {t('filters.all')} ({stats?.total_vendors || 0})
          </TabsTrigger>
          <TabsTrigger value="supplier">
            {t('category.supplier')} ({vendors?.filter(v => v.category === 'supplier').length || 0})
          </TabsTrigger>
          <TabsTrigger value="service_provider">
            {t('category.serviceProvider')} ({vendors?.filter(v => v.category === 'service_provider').length || 0})
          </TabsTrigger>
          <TabsTrigger value="contractor">
            {t('category.contractor')} ({vendors?.filter(v => v.category === 'contractor').length || 0})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <StatsCards stats={stats} />

      <div className="flex items-center justify-between">
        <VendorFilters 
          filters={filters} 
          onChange={handleFilterChange}
        />
        
        <div className="flex items-center gap-2">
          {selectedVendors.length > 0 && (
            <Button 
              variant="outline"
              onClick={handleBulkCompare}
              disabled={selectedVendors.length < 2 || selectedVendors.length > 5}
            >
              {t('actions.compare')} ({selectedVendors.length})
            </Button>
          )}
          
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors?.map(vendor => (
            <VendorCard 
              key={vendor.id} 
              vendor={vendor}
              onSelect={(id) => {
                setSelectedVendors(prev => 
                  prev.includes(id) 
                    ? prev.filter(v => v !== id)
                    : [...prev, id]
                );
              }}
              isSelected={selectedVendors.includes(vendor.id)}
            />
          ))}
        </div>
      ) : (
        <VendorTable 
          vendors={vendors || []}
          selectedVendors={selectedVendors}
          onSelectionChange={setSelectedVendors}
        />
      )}
    </div>
  );
}
