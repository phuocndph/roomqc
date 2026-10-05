import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { SlidersHorizontal, X } from 'lucide-react'
import type { RoomType } from '@/types/rooms.types'

interface MobileRoomFiltersProps {
  floor: number | undefined
  roomType: RoomType | undefined
  missingItemsOnly: boolean
  availableFloors: number[]
  onFloorChange: (floor: number | undefined) => void
  onRoomTypeChange: (type: RoomType | undefined) => void
  onMissingItemsOnlyChange: (value: boolean) => void
  onClear: () => void
}

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'suite', label: 'Suite' },
  { value: 'vip', label: 'VIP' },
]

export function MobileRoomFilters({
  floor,
  roomType,
  missingItemsOnly,
  availableFloors,
  onFloorChange,
  onRoomTypeChange,
  onMissingItemsOnlyChange,
  onClear,
}: MobileRoomFiltersProps) {
  const [open, setOpen] = useState(false)

  const activeFiltersCount = [
    floor !== undefined,
    roomType !== undefined,
    missingItemsOnly,
  ].filter(Boolean).length

  const handleClear = () => {
    onClear()
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Lọc
          {activeFiltersCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-auto max-h-[70vh]">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center justify-between">
            Bộ lọc nâng cao
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="h-4 w-4 mr-1" />
                Xóa lọc
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 pb-6">
          {/* Floor Filter */}
          <div className="space-y-2">
            <Label>Tầng</Label>
            <Select
              value={floor?.toString() || 'all'}
              onValueChange={(value) => onFloorChange(value === 'all' ? undefined : parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn tầng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tầng</SelectItem>
                {availableFloors.map((f) => (
                  <SelectItem key={f} value={f.toString()}>
                    Tầng {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Room Type Filter */}
          <div className="space-y-2">
            <Label>Loại phòng</Label>
            <Select
              value={roomType || 'all'}
              onValueChange={(value) => onRoomTypeChange(value === 'all' ? undefined : value as RoomType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn loại phòng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại</SelectItem>
                {ROOM_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Missing Items Only */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Chỉ phòng thiếu đồ</Label>
              <p className="text-sm text-muted-foreground">
                Chỉ hiển thị phòng có đồ dùng còn thiếu
              </p>
            </div>
            <Switch
              checked={missingItemsOnly}
              onCheckedChange={onMissingItemsOnlyChange}
            />
          </div>
        </div>

        <Button className="w-full" onClick={() => setOpen(false)}>
          Áp dụng
        </Button>
      </SheetContent>
    </Sheet>
  )
}
