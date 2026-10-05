import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { RoomFilters as IRoomFilters } from '@/types/rooms.types'

interface RoomFiltersProps {
  filters: IRoomFilters
  onFilterChange: (filters: Partial<IRoomFilters>) => void
}

export function RoomFilters({ filters, onFilterChange }: RoomFiltersProps) {
  const { t } = useTranslation('rooms')

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('filters.searchRoomNumber')}
          value={filters.search || ''}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          className="pl-10"
          maxLength={50}
        />
      </div>
      
      {/* Floor Filter */}
      <Select
        value={filters.floor?.toString() || 'all'}
        onValueChange={(value) => 
          onFilterChange({ floor: value === 'all' ? undefined : parseInt(value) })
        }
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder={t('filters.floorPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allFloors')}</SelectItem>
          {[...Array(10)].map((_, i) => (
            <SelectItem key={i + 1} value={(i + 1).toString()}>
              {t('filters.floorN', { number: i + 1 })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Room Type Filter */}
      <Select
        value={filters.roomType || 'all'}
        onValueChange={(value) => 
          onFilterChange({ roomType: value === 'all' ? undefined : value as any })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('filters.roomTypePlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
          <SelectItem value="standard">{t('roomTypes.standard')}</SelectItem>
          <SelectItem value="deluxe">{t('roomTypes.deluxe')}</SelectItem>
          <SelectItem value="suite">{t('roomTypes.suite')}</SelectItem>
          <SelectItem value="vip">{t('roomTypes.vip')}</SelectItem>
        </SelectContent>
      </Select>
      
      {/* Status Filter */}
      <Select
        value={filters.status || 'all'}
        onValueChange={(value) => 
          onFilterChange({ status: value === 'all' ? undefined : value as any })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('filters.statusPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          <SelectItem value="vacant_clean">Trống – đã dọn</SelectItem>
          <SelectItem value="vacant_inspected">Trống – đã QC</SelectItem>
          <SelectItem value="vacant_dirty">Trống – chưa dọn</SelectItem>
          <SelectItem value="occupied_clean">Đang ở – đã dọn</SelectItem>
          <SelectItem value="occupied_dirty">Đang ở – cần dọn</SelectItem>
          <SelectItem value="dnd">Không làm phiền</SelectItem>
          <SelectItem value="out_of_service">Tạm ngừng</SelectItem>
          <SelectItem value="out_of_order">Phòng hỏng</SelectItem>
        </SelectContent>
      </Select>
      
      {/* Missing Items Filter */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="missing-items"
          checked={filters.missingItemsOnly || false}
          onCheckedChange={(checked) => 
            onFilterChange({ missingItemsOnly: checked as boolean })
          }
        />
        <Label htmlFor="missing-items" className="text-sm cursor-pointer">
          {t('filters.missingItemsOnly')}
        </Label>
      </div>
    </div>
  )
}
