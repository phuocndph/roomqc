import { useState } from 'react'
import { Check, ChevronsUpDown, Building2, Star } from 'lucide-react'
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
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { useTranslation } from 'react-i18next'

interface LaundryVendorSelectProps {
  value: string
  onChange: (value: string, vendor?: any) => void
  placeholder?: string
  disabled?: boolean
}

export function LaundryVendorSelect({ value, onChange, placeholder, disabled }: LaundryVendorSelectProps) {
  const { t } = useTranslation(['laundry', 'common'])
  const [open, setOpen] = useState(false)
  const { data: vendors = [] } = useLaundryVendors({ status: 'active' })
  
  const selectedVendor = vendors.find(vendor => vendor.id === value)
  
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
          {selectedVendor ? (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{selectedVendor.name}</span>
              {selectedVendor.rating && (
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="h-3 w-3 fill-current" />
                  <span className="text-xs">{selectedVendor.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">
              {placeholder || t('laundry:vendor.selectPlaceholder')}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder={t('laundry:vendor.search')} />
          <CommandList>
            <CommandEmpty>{t('laundry:vendor.empty')}</CommandEmpty>
            <CommandGroup>
              {vendors.map((vendor) => (
                <CommandItem
                  key={vendor.id}
                  value={vendor.name}
                  onSelect={() => {
                    onChange(vendor.id, vendor)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === vendor.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{vendor.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {vendor.type === 'external' ? 'Bên ngoài' : 'Nội bộ'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{vendor.code}</span>
                        {vendor.phone && <span>• {vendor.phone}</span>}
                      </div>
                    </div>
                    {vendor.rating && (
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="text-sm font-medium">{vendor.rating.toFixed(1)}</span>
                      </div>
                    )}
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
