import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { 
  Search, 
  DoorOpen, 
  Check, 
  AlertTriangle,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useRooms } from '@/hooks/useRooms'
import { cn } from '@/lib/utils'
import { triggerHaptic } from '@/lib/haptics'

interface MobileRoomSelectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRoomIds: string[]
  onSelect: (roomIds: string[]) => void
  multiSelect?: boolean
}

export function MobileRoomSelectSheet({
  open,
  onOpenChange,
  selectedRoomIds,
  onSelect,
  multiSelect = true
}: MobileRoomSelectSheetProps) {
  const { t } = useTranslation(['inventory', 'rooms', 'common'])
  const [searchQuery, setSearchQuery] = useState('')
  const [localSelection, setLocalSelection] = useState<string[]>(selectedRoomIds)
  const [expandedFloors, setExpandedFloors] = useState<number[]>([])
  
  const { data: rooms = [], isLoading } = useRooms({})
  
  // Group rooms by floor
  const roomsByFloor = useMemo(() => {
    const filtered = rooms.filter(r => 
      r.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.room_type?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    
    const grouped: Record<number, typeof rooms> = {}
    filtered.forEach(room => {
      const floor = room.floor || 0
      if (!grouped[floor]) grouped[floor] = []
      grouped[floor].push(room)
    })
    
    return Object.entries(grouped)
      .map(([floor, roomsInFloor]) => ({
        floor: parseInt(floor),
        rooms: roomsInFloor.sort((a, b) => a.room_number.localeCompare(b.room_number))
      }))
      .sort((a, b) => a.floor - b.floor)
  }, [rooms, searchQuery])
  
  const toggleRoom = (roomId: string) => {
    triggerHaptic('light')
    if (multiSelect) {
      setLocalSelection(prev => 
        prev.includes(roomId)
          ? prev.filter(id => id !== roomId)
          : [...prev, roomId]
      )
    } else {
      setLocalSelection([roomId])
    }
  }
  
  const toggleFloor = (floor: number) => {
    setExpandedFloors(prev => 
      prev.includes(floor)
        ? prev.filter(f => f !== floor)
        : [...prev, floor]
    )
  }
  
  const handleConfirm = () => {
    triggerHaptic('success')
    onSelect(localSelection)
    onOpenChange(false)
  }
  
  // Reset local selection when sheet opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalSelection(selectedRoomIds)
      // Expand all floors by default
      setExpandedFloors(roomsByFloor.map(f => f.floor))
    }
    onOpenChange(open)
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'vacant': return 'bg-green-100 text-green-700'
      case 'occupied': return 'bg-blue-100 text-blue-700'
      case 'cleaning': return 'bg-yellow-100 text-yellow-700'
      case 'maintenance': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'vacant': return t('rooms:status.vacant')
      case 'occupied': return t('rooms:status.occupied')
      case 'cleaning': return t('rooms:status.cleaning')
      case 'maintenance': return t('rooms:status.maintenance')
      case 'check_in': return t('rooms:status.check_in')
      case 'check_out': return t('rooms:status.check_out')
      default: return status
    }
  }
  
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5" />
            {t('inventory:outbound.selectRoom')}
            {localSelection.length > 0 && (
              <Badge variant="secondary">{localSelection.length}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>
        
        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t('rooms:searchPlaceholder')}
            className="pl-10 h-11"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Room List */}
        <ScrollArea className="flex-1 mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('common:loading')}
            </div>
          ) : roomsByFloor.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('rooms:noRoomsFound')}
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {roomsByFloor.map(({ floor, rooms: floorRooms }) => {
                const isExpanded = expandedFloors.includes(floor)
                const selectedInFloor = floorRooms.filter(r => localSelection.includes(r.id)).length
                
                return (
                  <Collapsible 
                    key={floor} 
                    open={isExpanded}
                    onOpenChange={() => toggleFloor(floor)}
                  >
                    <CollapsibleTrigger asChild>
                      <TouchButton 
                        variant="ghost" 
                        className="w-full justify-between h-10 px-2"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="font-medium">
                            {t('rooms:floor')} {floor}
                          </span>
                          <Badge variant="outline" className="ml-2">
                            {floorRooms.length} {t('rooms:rooms')}
                          </Badge>
                        </div>
                        {selectedInFloor > 0 && (
                          <Badge>{selectedInFloor} {t('inventory:mobileForm.selected')}</Badge>
                        )}
                      </TouchButton>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="grid grid-cols-2 gap-2 mt-2 px-1">
                        {floorRooms.map((room) => {
                          const isSelected = localSelection.includes(room.id)
                          const hasMissingItems = (room as any).missing_items_count > 0
                          
                          return (
                            <Card
                              key={room.id}
                              className={cn(
                                "p-3 cursor-pointer transition-all",
                                isSelected && "ring-2 ring-primary bg-primary/5"
                              )}
                              onClick={() => toggleRoom(room.id)}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold">{room.room_number}</span>
                                    {isSelected && (
                                      <Check className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {room.room_type}
                                  </p>
                                </div>
                                <Badge 
                                  variant="secondary" 
                                  className={cn("text-[10px] px-1.5 py-0", getStatusColor(room.status))}
                                >
                                  {getStatusLabel(room.status)}
                                </Badge>
                              </div>
                              
                              {hasMissingItems && (
                                <div className="flex items-center gap-1 mt-2 text-amber-600">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span className="text-xs">
                                    {(room as any).missing_items_count} {t('rooms:missingItems')}
                                  </span>
                                </div>
                              )}
                            </Card>
                          )
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          )}
        </ScrollArea>
        
        {/* Footer Actions */}
        <SheetFooter className="flex-row gap-2 mt-2 pt-4 border-t">
          <TouchButton 
            variant="outline" 
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </TouchButton>
          <TouchButton 
            className="flex-1"
            onClick={handleConfirm}
            disabled={localSelection.length === 0}
          >
            {t('common:confirm')} ({localSelection.length})
          </TouchButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
