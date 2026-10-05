import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search } from 'lucide-react'

interface MaintenanceFiltersProps {
  filters: any
  onFiltersChange: (filters: any) => void
}

export const MaintenanceFilters = ({ filters, onFiltersChange }: MaintenanceFiltersProps) => {
  return (
    <div className="border rounded-lg p-3">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm mã, mô tả, phòng..."
            className="pl-10 h-9"
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          />
        </div>

        <Select
          value={filters.priority || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, priority: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Độ ưu tiên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả độ ưu tiên</SelectItem>
            <SelectItem value="urgent">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Khẩn cấp
              </span>
            </SelectItem>
            <SelectItem value="high">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                Cao
              </span>
            </SelectItem>
            <SelectItem value="medium">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Trung bình
              </span>
            </SelectItem>
            <SelectItem value="low">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Thấp
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.issue_type || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, issue_type: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="repair">Sửa chữa</SelectItem>
            <SelectItem value="replace">Thay thế</SelectItem>
            <SelectItem value="inspection">Kiểm tra</SelectItem>
            <SelectItem value="cleaning">Vệ sinh</SelectItem>
            <SelectItem value="other">Khác</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, status: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="waiting">Chờ tiếp nhận</SelectItem>
            <SelectItem value="pending">Đã tiếp nhận</SelectItem>
            <SelectItem value="in_progress">Đang xử lý</SelectItem>
            <SelectItem value="completed">Hoàn thành</SelectItem>
            <SelectItem value="cancelled">Đã hủy</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
