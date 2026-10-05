import { useState } from 'react'
import { Check, ChevronsUpDown, DoorOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useRooms } from '@/hooks/useRooms'
import { useTranslation } from 'react-i18next'
import { getRoomStatusMeta } from '@/lib/roomStatus'

interface RoomSelectProps {
  value: string
  onChange: (value: string, room?: any) => void
  placeholder?: string
  disabled?: boolean
}


export function RoomSelect({ value, onChange, placeholder, disabled }: RoomSelectProps) {
  const { t } = useTranslation(['rooms', 'common'])
  const [open, setOpen] = useState(false)
  const { data: rooms = [] } = useRooms()
  
  const selectedRoom = rooms.find(room => room.id === value)
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedRoom ? (
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{selectedRoom.room_number}</span>
              <span className="text-muted-foreground">- Tầng {selectedRoom.floor}</span>
              <Badge variant="outline" className={cn("ml-auto", getRoomStatusMeta(selectedRoom.status).text)}>
                {getRoomStatusMeta(selectedRoom.status).short}
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {placeholder || t('rooms:select.placeholder')}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder={t('rooms:select.search')} />
          <CommandList>
            <CommandEmpty>{t('rooms:select.empty')}</CommandEmpty>
            <CommandGroup>
              {rooms.map((room) => (
                <CommandItem
                  key={room.id}
                  value={`${room.room_number}-${room.floor}`}
                  onSelect={() => {
                    onChange(room.id, room)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === room.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <DoorOpen className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{room.room_number}</span>
                        <span className="text-xs text-muted-foreground">
                          Tầng {room.floor}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{room.room_type || 'N/A'}</span>
                        {room.total_items > 0 && (
                          <span>• {room.total_items} items</span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("ml-auto", getRoomStatusMeta(room.status).text)}>
                      {getRoomStatusMeta(room.status).short}
                    </Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
