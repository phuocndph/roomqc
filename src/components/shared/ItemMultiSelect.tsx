import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useItems } from '@/hooks/useItems'
import { ItemStatus } from '@/types/items.types'

interface ItemMultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  filters?: {
    categoryId?: string
    hotelId?: string
    status?: ItemStatus
  }
}

export function ItemMultiSelect({
  value = [],
  onChange,
  placeholder = 'Chọn items...',
  filters,
}: ItemMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  
  const { data, isLoading } = useItems(
    {
      ...filters,
      search,
    },
    1,
    100
  )
  
  const items = data?.items || []
  const selectedItems = items.filter(i => value.includes(i.id))

  const toggleItem = (itemId: string) => {
    const newValue = value.includes(itemId)
      ? value.filter(id => id !== itemId)
      : [...value, itemId]
    onChange(newValue)
  }

  const removeItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter(id => id !== itemId))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
        >
          <div className="flex flex-wrap gap-1">
            {selectedItems.length > 0 ? (
              selectedItems.map(item => (
                <Badge
                  key={item.id}
                  variant="secondary"
                  className="gap-1"
                >
                  {item.name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => removeItem(item.id, e)}
                  />
                </Badge>
              ))
            ) : value.length > 0 ? (
              <span className="text-sm">{value.length} items đã chọn</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Tìm items..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandEmpty>
            {isLoading ? 'Đang tải...' : 'Không tìm thấy items'}
          </CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {items.map(item => (
              <CommandItem
                key={item.id}
                value={item.id}
                onSelect={() => toggleItem(item.id)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value.includes(item.id) ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {item.item_images?.[0]?.url && (
                  <img
                    src={item.item_images[0].url}
                    alt={item.name}
                    className="mr-2 h-8 w-8 rounded object-cover"
                  />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Tồn kho</p>
                  <p className="text-sm font-medium">{item.quantity_in_stock}</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
