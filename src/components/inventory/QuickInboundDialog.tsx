import { Plus, X, ShoppingCart, Undo2, Package2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ResponsiveDialog } from '@/components/mobile/ResponsiveDialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { ItemSelect } from '@/components/shared/ItemSelect'
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect'
import { useCreateInboundTransaction } from '@/hooks/useInventoryTransactions'
import { useDefaultWarehouse } from '@/hooks/useWarehouses'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/lib/breakpoints'

const quickInboundSchema = z.object({
  transaction_category: z.enum(['purchase', 'return', 'other']),
  from_location: z.string().min(1, 'Vui lòng nhập nguồn'),
  to_warehouse_id: z.string().uuid('Vui lòng chọn kho'),
  items: z.array(z.object({
    item_id: z.string().uuid('Vui lòng chọn đồ dùng'),
    quantity: z.number().min(1, 'Số lượng phải > 0'),
    unit_price: z.number().min(0, 'Đơn giá phải >= 0'),
  })).min(1, 'Phải có ít nhất 1 đồ dùng'),
})

type QuickInboundFormData = z.infer<typeof quickInboundSchema>

interface QuickInboundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const categoryOptions = [
  { value: 'purchase', label: 'Mua mới', icon: ShoppingCart, description: 'Mua từ nhà cung cấp' },
  { value: 'return', label: 'Trả về', icon: Undo2, description: 'Hàng hoàn trả' },
  { value: 'other', label: 'Khác', icon: Package2, description: 'Lý do khác' },
]

export function QuickInboundDialog({ open, onOpenChange }: QuickInboundDialogProps) {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { mutate: createInbound, isPending: isLoading } = useCreateInboundTransaction()
  const { data: defaultWarehouse } = useDefaultWarehouse()
  
  const form = useForm<QuickInboundFormData>({
    resolver: zodResolver(quickInboundSchema),
    defaultValues: {
      transaction_category: 'purchase',
      from_location: '',
      to_warehouse_id: '',
      items: [{ item_id: '', quantity: 1, unit_price: 0 }],
    },
  })

  // Set default warehouse when loaded
  const toWarehouseId = form.watch('to_warehouse_id')
  if (defaultWarehouse && !toWarehouseId) {
    form.setValue('to_warehouse_id', defaultWarehouse.id)
  }
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })
  
  const onSubmit = (data: QuickInboundFormData) => {
    // Transform to match expected API format
    const submitData = {
      ...data,
      to_location: '', // Will be set by warehouse name in backend
    }
    createInbound(submitData as any, {
      onSuccess: () => {
        form.reset()
        onOpenChange(false)
      },
    })
  }
  
  const totalValue = form.watch('items').reduce(
    (sum, item) => sum + (item.quantity * item.unit_price),
    0
  )
  
  const selectedCategory = form.watch('transaction_category')
  
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nhập kho nhanh"
      description={isMobile ? undefined : "Ghi nhận nhập kho đơn giản"}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Category Selection */}
          <FormField
            control={form.control}
            name="transaction_category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Loại nhập *</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-3 gap-2">
                    {categoryOptions.map((option) => {
                      const Icon = option.icon
                      return (
                        <TouchButton
                          key={option.value}
                          type="button"
                          variant={field.value === option.value ? 'default' : 'outline'}
                          className={cn(
                            'h-auto py-3 flex-col gap-1.5',
                            isMobile && 'min-h-[72px]'
                          )}
                          onClick={() => field.onChange(option.value)}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-medium">{option.label}</span>
                        </TouchButton>
                      )
                    })}
                  </div>
                </FormControl>
                {isMobile && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {categoryOptions.find(o => o.value === selectedCategory)?.description}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Locations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="from_location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Từ đâu *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Nhà cung cấp, kho..."
                      className={isMobile ? 'min-h-[48px]' : ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="to_warehouse_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nhập vào kho *</FormLabel>
                  <FormControl>
                    <WarehouseSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Chọn kho"
                      className={isMobile ? 'min-h-[48px]' : ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <FormLabel>Đồ dùng *</FormLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => append({ item_id: '', quantity: 1, unit_price: 0 })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Thêm
              </Button>
            </div>
            
            {fields.map((field, index) => (
              <div key={field.id} className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Item {index + 1}</span>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => remove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                <FormField
                  control={form.control}
                  name={`items.${index}.item_id`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ItemSelect
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Chọn đồ dùng"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            placeholder="Số lượng"
                            className={isMobile ? 'min-h-[48px]' : ''}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name={`items.${index}.unit_price`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            placeholder="Đơn giá"
                            className={isMobile ? 'min-h-[48px]' : ''}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
          
          {/* Summary */}
          <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Tổng giá trị:</span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <TouchButton
              type="submit"
              disabled={isLoading}
              className={cn('w-full', isMobile && 'min-h-[48px]')}
            >
              {isLoading ? 'Đang xử lý...' : 'Nhập kho'}
            </TouchButton>
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                navigate('/inventory/inbound/new')
              }}
            >
              Dùng form đầy đủ →
            </Button>
          </div>
        </form>
      </Form>
    </ResponsiveDialog>
  )
}
