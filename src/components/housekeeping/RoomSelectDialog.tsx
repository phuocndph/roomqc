import { useState } from 'react'
import { Search, Building2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRooms } from '@/hooks/useRooms'
import { useHotelContext } from '@/contexts/HotelContext'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  vacant: 'text-green-600',
  occupied: 'text-blue-600',
  checkout: 'text-amber-600',
  checkin: 'text-purple-600',
  cleaning: 'text-orange-600',
  maintenance: 'text-red-600',
}

const STATUS_LABELS: Record<string, string> = {
  vacant: 'Trống',
  occupied: 'Có khách',
  checkout: 'Checkout',
  checkin: 'Check-in',
  cleaning: 'Dọn phòng',
  maintenance: 'Bảo trì',
}

interface RoomSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectRoom: (room: {
    id: string
    room_number: string
    floor: number
    hotel_id: string
  }) => void
}

export function RoomSelectDialog({
  open,
  onOpenChange,
  onSelectRoom,
}: RoomSelectDialogProps) {
  const { selectedHotel } = useHotelContext()
  const [search, setSearch] = useState('')
  const [floorFilter, setFloorFilter] = useState<string>('all')

  const { data: rooms, isLoading } = useRooms({
    search: search || undefined,
    floor: floorFilter !== 'all' ? parseInt(floorFilter) : undefined,
  })

  // Get unique floors from rooms
  const floors = rooms
    ? [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b)
    : []

  const handleSelectRoom = (room: typeof rooms extends (infer T)[] ? T : never) => {
    onSelectRoom({
      id: room.id,
      room_number: room.room_number,
      floor: room.floor,
      hotel_id: room.hotel_id,
    })
    onOpenChange(false)
    setSearch('')
    setFloorFilter('all')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Chọn phòng
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="px-4 py-2 space-y-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm số phòng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={floorFilter} onValueChange={setFloorFilter}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Tầng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tầng</SelectItem>
                {floors.map((floor) => (
                  <SelectItem key={floor} value={floor.toString()}>
                    Tầng {floor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Room List */}
        <ScrollArea className="h-[50vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rooms?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Không tìm thấy phòng</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {rooms?.map((room) => (
                <Button
                  key={room.id}
                  variant="ghost"
                  className="w-full justify-start h-auto py-3 px-3"
                  onClick={() => handleSelectRoom(room)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-10 rounded-md bg-muted flex items-center justify-center font-mono font-medium">
                        {room.room_number}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium">
                          {room.room_type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tầng {room.floor}
                        </div>
                      </div>
                    </div>
                    <span className={cn(
                      'text-xs font-medium',
                      STATUS_COLORS[room.status] || 'text-muted-foreground'
                    )}>
                      {STATUS_LABELS[room.status] || room.status}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full h-9"
          >
            Hủy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
