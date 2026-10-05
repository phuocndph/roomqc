import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar as CalendarIcon, Search, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { RouteFilters, ShiftCode, RouteStatus } from '@/types/route-batch.types'
import { SHIFT_LABELS } from '@/types/route-batch.types'

interface RouteFiltersCardProps {
  filters: RouteFilters
  onFiltersChange: (filters: RouteFilters) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  floors?: number[]
  onRefresh?: () => void
  isRefreshing?: boolean
  isMobile?: boolean
}

const STATUS_OPTIONS: { value: RouteStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xuất kho' },
  { value: 'released', label: 'Đã xuất kho' },
  { value: 'in_progress', label: 'Đang giao' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'closed', label: 'Đã đóng' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const SHIFT_OPTIONS: { value: ShiftCode | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả ca' },
  { value: 'morning', label: SHIFT_LABELS.morning },
  { value: 'afternoon', label: SHIFT_LABELS.afternoon },
  { value: 'night', label: SHIFT_LABELS.night },
]

export function RouteFiltersCard({
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  floors = [],
  isMobile = false,
}: RouteFiltersCardProps) {
  const { t } = useTranslation('distribution')
  const [isExpanded, setIsExpanded] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const activeFiltersCount = [
    filters.status,
    filters.shift_code,
    filters.shift_date,
    filters.floor,
  ].filter(Boolean).length

  const handleStatusChange = (value: string) => {
    onFiltersChange({
      ...filters,
      status: value === 'all' ? undefined : value as RouteStatus,
    })
  }

  const handleShiftChange = (value: string) => {
    onFiltersChange({
      ...filters,
      shift_code: value === 'all' ? undefined : value as ShiftCode,
    })
  }

  const handleFloorChange = (value: string) => {
    onFiltersChange({
      ...filters,
      floor: value === 'all' ? undefined : parseInt(value),
    })
  }

  const handleDateSelect = (date: Date | undefined) => {
    onFiltersChange({
      ...filters,
      shift_date: date ? format(date, 'yyyy-MM-dd') : undefined,
    })
    setCalendarOpen(false)
  }

  const handleClearDate = () => {
    onFiltersChange({
      ...filters,
      shift_date: undefined,
    })
  }

  const handleClearAll = () => {
    onFiltersChange({})
    onSearchChange('')
  }

  // Mobile: Collapsible filters
  if (isMobile) {
    return (
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm mã phiếu..."
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 relative">
                <Filter className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <Badge 
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                    variant="destructive"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="space-y-2">
            <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.shift_code || 'all'} onValueChange={handleShiftChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Ca" />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full h-8 justify-start text-left text-xs',
                    !filters.shift_date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {filters.shift_date 
                    ? format(new Date(filters.shift_date), 'dd/MM/yyyy', { locale: vi })
                    : 'Chọn ngày'}
                  {filters.shift_date && (
                    <X 
                      className="ml-auto h-3.5 w-3.5 hover:text-destructive" 
                      onClick={(e) => { e.stopPropagation(); handleClearDate() }}
                    />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.shift_date ? new Date(filters.shift_date) : undefined}
                  onSelect={handleDateSelect}
                  initialFocus
                  locale={vi}
                />
              </PopoverContent>
            </Popover>

            {floors.length > 0 && (
              <Select value={filters.floor?.toString() || 'all'} onValueChange={handleFloorChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tầng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Tất cả tầng</SelectItem>
                  {floors.map(floor => (
                    <SelectItem key={floor} value={floor.toString()} className="text-xs">
                      Tầng {floor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(activeFiltersCount > 0 || searchQuery) && (
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={handleClearAll}>
                <X className="h-3.5 w-3.5 mr-1" />
                Xóa bộ lọc
              </Button>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    )
  }

  // Desktop view
  return (
    <div className="flex flex-wrap items-center gap-3 border rounded-lg p-3">
      <div className="relative flex-1 min-w-[160px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm mã phiếu..."
          className="pl-8 h-8 text-sm"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.shift_code || 'all'} onValueChange={handleShiftChange}>
        <SelectTrigger className="w-[110px] h-8 text-xs">
          <SelectValue placeholder="Ca" />
        </SelectTrigger>
        <SelectContent>
          {SHIFT_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-[120px] h-8 justify-start text-left text-xs',
              !filters.shift_date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {filters.shift_date 
              ? format(new Date(filters.shift_date), 'dd/MM', { locale: vi })
              : 'Ngày'}
            {filters.shift_date && (
              <X 
                className="ml-auto h-3.5 w-3.5 hover:text-destructive" 
                onClick={(e) => { e.stopPropagation(); handleClearDate() }}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.shift_date ? new Date(filters.shift_date) : undefined}
            onSelect={handleDateSelect}
            initialFocus
            locale={vi}
          />
        </PopoverContent>
      </Popover>

      {floors.length > 0 && (
        <Select value={filters.floor?.toString() || 'all'} onValueChange={handleFloorChange}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue placeholder="Tầng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Tất cả</SelectItem>
            {floors.map(floor => (
              <SelectItem key={floor} value={floor.toString()} className="text-xs">
                Tầng {floor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(activeFiltersCount > 0 || searchQuery) && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearAll}>
          <X className="h-3.5 w-3.5 mr-1" />
          Xóa
        </Button>
      )}
    </div>
  )
}