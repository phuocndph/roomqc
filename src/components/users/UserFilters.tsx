import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHotels } from '@/hooks/useHotels'
import { usePositions } from '@/hooks/usePositions'

interface UserFiltersProps {
  filters: {
    search: string
    userLevel: string
    status: string
    hotelId: string
    positionId: string
    department: string
    createdByMe: boolean
  }
  onFiltersChange: (filters: any) => void
}

export function UserFilters({ filters, onFiltersChange }: UserFiltersProps) {
  const { data: hotels } = useHotels()
  const { data: positions } = usePositions()

  const activeFilterCount = [
    filters.userLevel !== 'all',
    filters.status !== 'all',
    filters.hotelId !== 'all',
    filters.positionId !== 'all',
    filters.department !== 'all',
    filters.createdByMe,
  ].filter(Boolean).length

  const handleReset = () => {
    onFiltersChange({
      search: '',
      userLevel: 'all',
      status: 'all',
      hotelId: 'all',
      positionId: 'all',
      department: 'all',
      createdByMe: false,
    })
  }

  return (
    <div className="space-y-3">
      {/* Primary Filters Row */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm theo tên, email..."
            value={filters.search}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value })
            }
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* User Level */}
        <Select
          value={filters.userLevel}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, userLevel: value })
          }
        >
          <SelectTrigger className="h-8 text-xs w-full lg:w-[140px]">
            <SelectValue placeholder="Cấp bậc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả cấp bậc</SelectItem>
            <SelectItem value="tenant_owner">👑 Chủ sở hữu</SelectItem>
            <SelectItem value="manager">👥 Quản lý</SelectItem>
            <SelectItem value="department_manager">🧭 Quản lý bộ phận</SelectItem>
            <SelectItem value="staff">👤 Nhân viên</SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, status: value })
          }
        >
          <SelectTrigger className="h-8 text-xs w-full lg:w-[130px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="active">Hoạt động</SelectItem>
            <SelectItem value="inactive">Không hoạt động</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Secondary Filters Row */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {/* Hotel Filter */}
        <Select
          value={filters.hotelId}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, hotelId: value })
          }
        >
          <SelectTrigger className="h-8 text-xs w-full lg:w-[160px]">
            <SelectValue placeholder="Khách sạn" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả khách sạn</SelectItem>
            {hotels?.map((hotel) => (
              <SelectItem key={hotel.id} value={hotel.id}>
                {hotel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Position Filter */}
        <Select
          value={filters.positionId}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, positionId: value })
          }
        >
          <SelectTrigger className="h-8 text-xs w-full lg:w-[160px]">
            <SelectValue placeholder="Chức vụ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả chức vụ</SelectItem>
            {positions?.map((position) => (
              <SelectItem key={position.id} value={position.id}>
                {position.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Department Filter */}
        <Select
          value={filters.department}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, department: value })
          }
        >
          <SelectTrigger className="h-8 text-xs w-full lg:w-[160px]">
            <SelectValue placeholder="Phòng ban" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả phòng ban</SelectItem>
            <SelectItem value="housekeeping">Buồng phòng</SelectItem>
            <SelectItem value="laundry">Giặt là</SelectItem>
            <SelectItem value="inventory">Kho</SelectItem>
            <SelectItem value="maintenance">Bảo trì</SelectItem>
            <SelectItem value="accounting">Kế toán</SelectItem>
            <SelectItem value="other">Khác</SelectItem>
          </SelectContent>
        </Select>

        {/* Created By Me Toggle */}
        <Button
          type="button"
          variant={filters.createdByMe ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            onFiltersChange({ ...filters, createdByMe: !filters.createdByMe })
          }
          className="h-8 text-xs w-full lg:w-auto"
        >
          <Filter className="h-3 w-3 mr-1.5" />
          Người tôi tạo
        </Button>

        {/* Reset Button */}
        {activeFilterCount > 0 && (
          <Button 
            type="button"
            variant="ghost" 
            size="sm"
            onClick={handleReset} 
            className="h-8 text-xs w-full lg:w-auto"
          >
            <X className="h-3 w-3 mr-1" />
            Xóa ({activeFilterCount})
          </Button>
        )}
      </div>
    </div>
  )
}
