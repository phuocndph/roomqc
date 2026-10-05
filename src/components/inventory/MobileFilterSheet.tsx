import React, { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { Filter, X, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { InventoryFilters } from '@/types/inventory.types'

interface MobileFilterSheetProps {
  filters: InventoryFilters
  onFiltersChange: (filters: InventoryFilters) => void
}

export function MobileFilterSheet({ filters, onFiltersChange }: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<InventoryFilters>(filters)

  const activeFiltersCount = [
    localFilters.search,
    localFilters.transaction_type,
    localFilters.category_id,
    localFilters.created_by,
    localFilters.date_from,
    localFilters.date_to
  ].filter(Boolean).length

  const handleApply = () => {
    onFiltersChange(localFilters)
    setOpen(false)
  }

  const handleReset = () => {
    const resetFilters: InventoryFilters = {
      search: '',
      transaction_type: undefined,
      category_id: '',
      created_by: '',
      date_from: undefined,
      date_to: undefined
    }
    setLocalFilters(resetFilters)
    onFiltersChange(resetFilters)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="lg" className="w-full justify-between h-14">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>Bộ lọc</span>
            {activeFiltersCount > 0 && (
              <Badge variant="default" className="ml-1 h-5 min-w-5 flex items-center justify-center">
                {activeFiltersCount}
              </Badge>
            )}
          </div>
          <Search className="h-4 w-4 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>Bộ lọc giao dịch</SheetTitle>
          <SheetDescription>
            Tìm kiếm và lọc giao dịch theo tiêu chí
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Tìm kiếm</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Mã giao dịch, tên đồ dùng..."
                value={localFilters.search || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, search: e.target.value })}
                className="pl-9 h-12"
              />
            </div>
          </div>

          {/* Transaction Type */}
          <div className="space-y-2">
            <Label htmlFor="transactionType">Loại giao dịch</Label>
            <Select
              value={localFilters.transaction_type || ''}
              onValueChange={(value) => setLocalFilters({ ...localFilters, transaction_type: value as any || undefined })}
            >
              <SelectTrigger id="transactionType" className="h-12">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tất cả</SelectItem>
                <SelectItem value="in">Nhập kho</SelectItem>
                <SelectItem value="out">Xuất kho</SelectItem>
                <SelectItem value="adjustment">Điều chỉnh</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Danh mục</Label>
            <Select
              value={localFilters.category_id || ''}
              onValueChange={(value) => setLocalFilters({ ...localFilters, category_id: value })}
            >
              <SelectTrigger id="category" className="h-12">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tất cả</SelectItem>
                <SelectItem value="purchase">Mua hàng</SelectItem>
                <SelectItem value="sale">Bán hàng</SelectItem>
                <SelectItem value="transfer_in">Chuyển kho nhập</SelectItem>
                <SelectItem value="transfer_out">Chuyển kho xuất</SelectItem>
                <SelectItem value="internal_use">Sử dụng nội bộ</SelectItem>
                <SelectItem value="loss">Hao hụt</SelectItem>
                <SelectItem value="damaged">Hư hỏng</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Khoảng thời gian</Label>
            <DateRangePicker
              value={{
                from: localFilters.date_from,
                to: localFilters.date_to,
              }}
              onChange={(range) => {
                setLocalFilters({
                  ...localFilters,
                  date_from: range?.from || undefined,
                  date_to: range?.to || undefined
                })
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="border-t pt-4 space-y-2">
          <Button onClick={handleApply} className="w-full h-12" size="lg">
            Áp dụng
          </Button>
          <Button 
            onClick={handleReset} 
            variant="outline" 
            className="w-full h-12"
            size="lg"
          >
            <X className="h-4 w-4 mr-2" />
            Xóa bộ lọc
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
