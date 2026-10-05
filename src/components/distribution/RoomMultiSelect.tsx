import { useState, useMemo } from 'react'
import { Check, Search, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRooms } from '@/hooks/useRooms'

interface RoomMultiSelectProps {
  selectedRoomIds: string[]
  onSelectionChange: (roomIds: string[]) => void
  maxHeight?: string
}

export function RoomMultiSelect({ 
  selectedRoomIds, 
  onSelectionChange,
  maxHeight = '300px'
}: RoomMultiSelectProps) {
  const [search, setSearch] = useState('')
  const { data: rooms = [] } = useRooms()

  const filteredRooms = useMemo(() => {
    if (!search) return rooms
    // Fuzzy search: split query into words, all words must match somewhere
    const searchWords = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (searchWords.length === 0) return rooms
    
    return rooms.filter(room => {
      const roomText = `${room.room_number} ${room.room_type || ''}`.toLowerCase()
      // All search words must be found in room text
      return searchWords.every(word => roomText.includes(word))
    })
  }, [rooms, search])

  const roomsByFloor = useMemo(() => {
    const grouped: Record<number, typeof rooms> = {}
    filteredRooms.forEach(room => {
      const floor = room.floor || 0
      if (!grouped[floor]) grouped[floor] = []
      grouped[floor].push(room)
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([floor, rooms]) => ({
        floor: Number(floor),
        rooms: rooms.sort((a, b) => a.room_number.localeCompare(b.room_number))
      }))
  }, [filteredRooms])

  const toggleRoom = (roomId: string) => {
    if (selectedRoomIds.includes(roomId)) {
      onSelectionChange(selectedRoomIds.filter(id => id !== roomId))
    } else {
      onSelectionChange([...selectedRoomIds, roomId])
    }
  }

  const toggleFloor = (floorRooms: typeof rooms) => {
    const floorRoomIds = floorRooms.map(r => r.id)
    const allSelected = floorRoomIds.every(id => selectedRoomIds.includes(id))
    
    if (allSelected) {
      onSelectionChange(selectedRoomIds.filter(id => !floorRoomIds.includes(id)))
    } else {
      const newSelection = [...selectedRoomIds]
      floorRoomIds.forEach(id => {
        if (!newSelection.includes(id)) newSelection.push(id)
      })
      onSelectionChange(newSelection)
    }
  }

  const selectAll = () => {
    // Select ALL rooms, not just filtered
    onSelectionChange(rooms.map(r => r.id))
  }

  const selectFiltered = () => {
    // Select only filtered/search results
    onSelectionChange(filteredRooms.map(r => r.id))
  }

  const clearAll = () => {
    onSelectionChange([])
  }

  const FloorCheckbox = ({ checked }: { checked: boolean }) => (
    <div
      aria-hidden="true"
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center pointer-events-none",
        checked
          ? "bg-primary border-primary text-primary-foreground"
          : "border-input bg-background",
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm phòng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={selectAll}>
          Chọn tất cả ({rooms.length})
        </Button>
        {search && filteredRooms.length !== rooms.length && (
          <Button variant="outline" size="sm" onClick={selectFiltered}>
            Chọn kết quả ({filteredRooms.length})
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Bỏ chọn
        </Button>
      </div>

      {selectedRoomIds.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Đã chọn:</span>
          <Badge variant="secondary">{selectedRoomIds.length} phòng</Badge>
        </div>
      )}

      <div className="border rounded-lg overflow-y-auto" style={{ maxHeight }}>
        <div className="p-2 space-y-4">
          {roomsByFloor.map(({ floor, rooms: floorRooms }) => {
            const floorRoomIds = floorRooms.map(r => r.id)
            const selectedCount = floorRoomIds.filter(id => selectedRoomIds.includes(id)).length
            const allSelected = selectedCount === floorRooms.length

            return (
              <div key={floor} className="space-y-2">
                <div 
                  className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                  onClick={() => toggleFloor(floorRooms)}
                >
                  <FloorCheckbox checked={allSelected} />
                  <Building2 className="h-4 w-4" />
                  <span className="font-medium text-sm">Tầng {floor}</span>
                  <Badge variant="outline" className="ml-auto">
                    {selectedCount}/{floorRooms.length}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-1.5 pl-4">
                  {floorRooms.map(room => {
                    const isSelected = selectedRoomIds.includes(room.id)
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => toggleRoom(room.id)}
                        className={cn(
                          "relative px-1.5 py-1.5 text-xs rounded border transition-all text-center min-w-[52px]",
                          "hover:border-primary/50 hover:bg-primary/5",
                          isSelected 
                            ? "border-primary bg-primary/10 text-primary font-medium" 
                            : "border-border bg-background"
                        )}
                      >
                        {room.room_number}
                        {isSelected && (
                          <Check className="absolute -top-1 -right-1 h-3 w-3 text-primary bg-background rounded-full" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {roomsByFloor.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Không tìm thấy phòng nào
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
