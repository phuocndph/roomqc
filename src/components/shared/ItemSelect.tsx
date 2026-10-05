import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { useItems } from '@/hooks/useItems'

interface ItemSelectProps {
  value: string
  onChange: (value: string, item?: any) => void
  placeholder?: string
  filters?: any
}

export function ItemSelect({ value, onChange, placeholder = "Chọn đồ dùng", filters }: ItemSelectProps) {
  const [open, setOpen] = useState(false)
  const { data } = useItems(filters || {}, 1, 100)
  
  const items = data?.items || []
  const selectedItem = items.find(item => item.id === value)
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedItem ? (
            <div className="flex items-center gap-2">
              {selectedItem.item_images?.[0]?.url && (
                <img 
                  src={selectedItem.item_images[0].url} 
                  alt={selectedItem.name}
                  className="h-4 w-4 rounded object-cover"
                />
              )}
              <span className="truncate">{selectedItem.name}</span>
            </div>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Tìm kiếm..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy đồ dùng</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onChange(item.id, item)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    {item.item_images?.[0]?.url && (
                      <img 
                        src={item.item_images[0].url} 
                        alt={item.name}
                        className="h-6 w-6 rounded object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.code} • Tồn: {item.quantity_in_stock}
                      </p>
                    </div>
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
