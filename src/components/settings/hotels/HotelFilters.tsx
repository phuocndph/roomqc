import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'

export interface HotelFiltersState {
  status: string
  type: string
  city: string
  manager_id: string
  search: string
}

interface HotelFiltersProps {
  filters: HotelFiltersState
  onFiltersChange: (filters: Partial<HotelFiltersState>) => void
  cities: string[]
  managers: Array<{ id: string; name: string }>
}

export function HotelFilters({ filters, onFiltersChange, cities, managers }: HotelFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên, mã, địa chỉ..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ search: e.target.value })}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Status Filter */}
      <Select value={filters.status} onValueChange={(value) => onFiltersChange({ status: value })}>
        <SelectTrigger className="w-full sm:w-[130px] h-8 text-xs">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả TT</SelectItem>
          <SelectItem value="active">Hoạt động</SelectItem>
          <SelectItem value="inactive">Tạm ngưng</SelectItem>
          <SelectItem value="maintenance">Bảo trì</SelectItem>
        </SelectContent>
      </Select>

      {/* Type Filter */}
      <Select value={filters.type} onValueChange={(value) => onFiltersChange({ type: value })}>
        <SelectTrigger className="w-full sm:w-[130px] h-8 text-xs">
          <SelectValue placeholder="Loại hình" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả loại</SelectItem>
          <SelectItem value="hotel">Khách sạn</SelectItem>
          <SelectItem value="resort">Resort</SelectItem>
          <SelectItem value="apartment">Căn hộ</SelectItem>
          <SelectItem value="hostel">Hostel</SelectItem>
          <SelectItem value="other">Khác</SelectItem>
        </SelectContent>
      </Select>

      {/* City Filter */}
      {cities.length > 0 && (
        <Select value={filters.city} onValueChange={(value) => onFiltersChange({ city: value })}>
          <SelectTrigger className="w-full sm:w-[130px] h-8 text-xs">
            <SelectValue placeholder="Thành phố" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả TP</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Manager Filter */}
      {managers.length > 0 && (
        <Select value={filters.manager_id} onValueChange={(value) => onFiltersChange({ manager_id: value })}>
          <SelectTrigger className="w-full sm:w-[150px] h-8 text-xs">
            <SelectValue placeholder="Quản lý" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả QL</SelectItem>
            {managers.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {manager.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
