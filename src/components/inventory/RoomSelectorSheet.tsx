import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, DoorOpen, AlertCircle, Check, ChevronRight } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useRooms } from '@/hooks/useRooms'
import { cn } from '@/lib/utils'
import type { RoomWithStats } from '@/types/rooms.types'

interface RoomSelectorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (room: RoomWithStats) => void
  selectedRoomId?: string
}

export function RoomSelectorSheet({
  open,
  onOpenChange,
  onSelect,
  selectedRoomId,
}: RoomSelectorSheetProps) {
  const { t } = useTranslation(['inventory', 'rooms'])
  const [search, setSearch] = useState('')
  const { data: rooms, isLoading } = useRooms({ search })

  const handleSelect = (room: RoomWithStats) => {
    onSelect(room)
    onOpenChange(false)
  }

  // Group rooms by floor
  const roomsByFloor = (rooms || []).reduce((acc, room) => {
    const floor = room.floor || 1
    if (!acc[floor]) acc[floor] = []
    acc[floor].push(room)
    return acc
  }, {} as Record<number, RoomWithStats[]>)

  const floors = Object.keys(roomsByFloor)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5 text-primary" />
            {t('inventory:outbound.selectRoom')}
          </SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('rooms:filters.searchRoomNumber')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </div>

        {/* Room List */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : floors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <DoorOpen className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{t('rooms:messages.noRooms')}</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {floors.map((floor) => (
                <div key={floor}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                    {t('rooms:filters.floorN', { number: floor })}
                  </h3>
                  <div className="space-y-2">
                    {roomsByFloor[floor].map((room) => {
                      const isSelected = selectedRoomId === room.id
                      const hasMissing = room.missing_items > 0

                      return (
                        <button
                          key={room.id}
                          onClick={() => handleSelect(room)}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50",
                            hasMissing && !isSelected && "border-amber-200 bg-amber-50/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                              {isSelected ? (
                                <Check className="h-5 w-5" />
                              ) : (
                                <DoorOpen className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold">{t('rooms:detail.title', { number: room.room_number })}</p>
                                <Badge variant="outline" className="text-[10px] h-5">
                                  {t(`rooms:roomTypes.${room.room_type}`, { defaultValue: room.room_type })}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span>{t(`rooms:status.${room.status}`)}</span>
                                {hasMissing && (
                                  <>
                                    <span>•</span>
                                    <span className="text-amber-600 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      {t('rooms:itemStatus.missing', { missing: room.missing_items, total: room.total_items })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
