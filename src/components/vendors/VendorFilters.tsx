import { useTranslation } from 'react-i18next'
import { VendorFilters as VendorFiltersType } from '@/types/vendor.types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface VendorFiltersProps {
  filters: VendorFiltersType;
  onChange: (filters: Partial<VendorFiltersType>) => void;
}

export function VendorFilters({ filters, onChange }: VendorFiltersProps) {
  const { t } = useTranslation(['vendors'])
  
  return (
    <div className="flex gap-4 flex-wrap">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('filters.search')}
          value={filters.search || ''}
          onChange={(e) => onChange({ search: e.target.value })}
          className="pl-9"
        />
      </div>

      <Select
        value={filters.status || 'all'}
        onValueChange={(value) => onChange({ status: value as any })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('fields.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          <SelectItem value="active">{t('status.active')}</SelectItem>
          <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
          <SelectItem value="suspended">{t('status.suspended')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.sort_by || 'name'}
        onValueChange={(value) => onChange({ sort_by: value as any })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('filters.sortBy')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{t('sort.name')}</SelectItem>
          <SelectItem value="rating">{t('sort.rating')}</SelectItem>
          <SelectItem value="orders">{t('sort.orders')}</SelectItem>
          <SelectItem value="value">{t('sort.value')}</SelectItem>
          <SelectItem value="recent">{t('sort.recent')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}