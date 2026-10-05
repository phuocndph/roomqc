import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { formatCurrency } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

interface VendorSelectProps {
  value: string
  onChange: (value: string) => void
}

export function VendorSelect({ value, onChange }: VendorSelectProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: vendors } = useLaundryVendors({ status: 'active' })
  
  const selectedVendor = vendors?.find((v) => v.id === value)
  const selectedLogo = selectedVendor?.contract_info as any
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedVendor ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={selectedLogo?.logo_url} />
                <AvatarFallback>{selectedVendor.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span>{selectedVendor.name}</span>
            </div>
          ) : (
            'Chọn đơn vị giặt...'
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Tìm đơn vị giặt..." />
          <CommandEmpty>Không tìm thấy đơn vị giặt</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {vendors?.map((vendor) => {
              const contractInfo = vendor.contract_info as any
              const pricePerKg = contractInfo?.price_per_kg || 0
              const rating = vendor.rating || 0
              
              return (
                <CommandItem
                  key={vendor.id}
                  value={vendor.id}
                  onSelect={(currentValue) => {
                    onChange(currentValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === vendor.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={contractInfo?.logo_url} />
                        <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{vendor.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {vendor.type === 'external' ? 'Ngoài' : 'Nội bộ'}
                          </Badge>
                          <span>★ {rating.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold">{formatCurrency(pricePerKg)}</p>
                      <p className="text-xs text-muted-foreground">/kg</p>
                    </div>
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <div className="border-t p-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              size="sm"
              onClick={() => {
                setOpen(false)
                navigate('/laundry/vendors/new')
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Thêm đơn vị mới
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
