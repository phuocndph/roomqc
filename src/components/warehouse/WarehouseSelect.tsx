import { forwardRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWarehouses } from '@/hooks/useWarehouses'
import { Warehouse, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WarehouseSelectProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  excludeId?: string // Exclude a specific warehouse (e.g., for transfer)
  showStock?: boolean // Show stock info if available
  showAllOption?: boolean // Show "Tất cả" option for filtering
  className?: string
  error?: boolean
}

export const WarehouseSelect = forwardRef<HTMLButtonElement, WarehouseSelectProps>(
  ({ value, onValueChange, placeholder = 'Chọn kho', disabled, excludeId, showAllOption, className, error }, ref) => {
    const { data: warehouses, isLoading } = useWarehouses()

    const filteredWarehouses = warehouses?.filter(w => w.id !== excludeId) || []
    const selectedWarehouse = warehouses?.find(w => w.id === value)

    // Handle value change - convert 'all' back to empty string for parent
    const handleChange = (newValue: string) => {
      onValueChange(newValue === 'all' ? '' : newValue)
    }

    // Display value - show 'all' when value is empty and showAllOption is true
    const displayValue = showAllOption && !value ? 'all' : value

    return (
      <Select value={displayValue} onValueChange={handleChange} disabled={disabled || isLoading}>
        <SelectTrigger 
          ref={ref} 
          className={cn(
            'h-9',
            error && 'border-destructive',
            className
          )}
        >
          <SelectValue placeholder={isLoading ? 'Đang tải...' : placeholder}>
            {displayValue === 'all' ? (
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" />
                <span>Tất cả kho</span>
              </div>
            ) : selectedWarehouse ? (
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" />
                <span>{selectedWarehouse.name}</span>
                {selectedWarehouse.is_default && (
                  <span className="text-xs text-muted-foreground">(Mặc định)</span>
                )}
              </div>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {showAllOption && (
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" />
                <span>Tất cả kho</span>
              </div>
            </SelectItem>
          )}
          {filteredWarehouses.length === 0 && !showAllOption ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>Chưa có kho nào</p>
            </div>
          ) : (
            filteredWarehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={warehouse.id}>
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <span>{warehouse.name}</span>
                  <span className="text-xs text-muted-foreground">({warehouse.code})</span>
                  {warehouse.is_default && (
                    <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      Mặc định
                    </span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    )
  }
)

WarehouseSelect.displayName = 'WarehouseSelect'
