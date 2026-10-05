import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Grid3x3, List, Search, Star } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileVendorListPage } from '@/components/vendors/MobileVendorListPage'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VendorCard } from '@/components/laundry/VendorCard'
import { VendorTable } from '@/components/laundry/VendorTable'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { Skeleton } from '@/components/ui/skeleton'

export function VendorListPage() {
  const { t } = useTranslation('laundry')
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    status: 'active',
  })
  
  const { data: vendors, isLoading } = useLaundryVendors({ status: filters.status === 'all' ? undefined : filters.status })

  if (isMobile) {
    return <MobileVendorListPage />
  }
  
  const filteredVendors = vendors?.filter(v => {
    const searchMatch = !filters.search || 
      v.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      v.address?.toLowerCase().includes(filters.search.toLowerCase())
    const typeMatch = filters.type === 'all' || v.type === filters.type
    return searchMatch && typeMatch
  })
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('vendorList.title')}
        description={t('vendorList.description')}
        action={{
          label: t('vendorList.addVendor'),
          icon: Plus,
          onClick: () => navigate('/laundry/vendors/new'),
        }}
      />
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('vendorList.searchPlaceholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
          
          <Select
            value={filters.type}
            onValueChange={(value) => setFilters({ ...filters, type: value })}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('vendorList.typePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('vendorList.typeAll')}</SelectItem>
              <SelectItem value="external">{t('vendorList.typeExternal')}</SelectItem>
              <SelectItem value="in_house">{t('vendorList.typeInHouse')}</SelectItem>
            </SelectContent>
          </Select>
          
          <Select
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value })}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('vendorList.statusPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('vendorList.statusAll')}</SelectItem>
              <SelectItem value="active">{t('vendorList.statusActive')}</SelectItem>
              <SelectItem value="inactive">{t('vendorList.statusInactive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={view === 'grid' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setView('grid')}
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className={view === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredVendors && filteredVendors.length > 0 ? (
        view === 'grid' ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredVendors.map((vendor) => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                onClick={() => navigate(`/laundry/vendors/${vendor.id}`)}
              />
            ))}
          </div>
        ) : (
          <VendorTable
            vendors={filteredVendors}
            onRowClick={(vendor) => navigate(`/laundry/vendors/${vendor.id}`)}
          />
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Star className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">{t('vendorList.emptyTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('vendorList.emptyDescription')}
          </p>
          <Button onClick={() => navigate('/laundry/vendors/new')} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            {t('vendorList.addVendor')}
          </Button>
        </div>
      )}
    </div>
  )
}
