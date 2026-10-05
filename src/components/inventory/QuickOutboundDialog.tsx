import { useEffect } from 'react'
import { Plus, X, AlertTriangle, Package, Home, Wrench, TruckIcon } from 'lucide-react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ItemSelect } from '@/components/shared/ItemSelect'
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect'
import { useDefaultWarehouse } from '@/hooks/useWarehouses'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/lib/breakpoints'
import {
  OutboundCategoryGrid,
  type OutboundCategoryOption,
} from './outbound/shared/OutboundCategoryGrid'
import { useOutboundSubmit } from './outbound/shared/useOutboundSubmit'
import { useStockValidation } from './outbound/shared/useStockValidation'
import type { OutboundCategory } from './outbound/shared/types'

const quickOutboundSchema = z
  .object({
    transaction_category: z.enum(['room_assign', 'laundry', 'maintenance', 'other']),
    from_warehouse_id: z.string().uuid('Vui lòng chọn kho'),
    to_location: z.string().min(1, 'Vui lòng nhập đích đến'),
    items: z
      .array(
        z.object({
          item_id: z.string().uuid('Vui lòng chọn đồ dùng'),
          quantity: z.number().min(1, 'Số lượng phải > 0'),
          available_quantity: z.number(),
        }),
      )
      .min(1, 'Phải có ít nhất 1 đồ dùng'),
  })
  .refine(data => data.items.every(item => item.quantity <= item.available_quantity), {
    message: 'Số lượng xuất không được vượt quá tồn kho',
    path: ['items'],
  })

type QuickOutboundFormData = z.infer<typeof quickOutboundSchema>

interface QuickOutboundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const categoryOptions: OutboundCategoryOption[] = [
  { value: 'room_assign', label: 'Phòng', icon: Home, description: 'Cấp phát cho phòng' },
  { value: 'laundry', label: 'Giặt là', icon: Package, description: 'Gửi giặt là' },
  { value: 'maintenance', label: 'Bảo trì', icon: Wrench, description: 'Sửa chữa, bảo trì' },
  { value: 'other', label: 'Khác', icon: TruckIcon, description: 'Lý do khác' },
]

export function QuickOutboundDialog({ open, onOpenChange }: QuickOutboundDialogProps) {
  const { isMobile } = useBreakpoint()
  const { submit, isPending: isLoading } = useOutboundSubmit()
  const { data: defaultWarehouse } = useDefaultWarehouse()

  const form = useForm<QuickOutboundFormData>({
    resolver: zodResolver(quickOutboundSchema),
    defaultValues: {
      transaction_category: 'other',
      from_warehouse_id: '',
      to_location: '',
      items: [{ item_id: '', quantity: 1, available_quantity: 0 }],
    },
  })

  // Set default warehouse when loaded (effect avoids render-phase setValue)
  const fromWarehouseId = form.watch('from_warehouse_id')
  useEffect(() => {
    if (defaultWarehouse && !fromWarehouseId) {
      form.setValue('from_warehouse_id', defaultWarehouse.id)
    }
  }, [defaultWarehouse, fromWarehouseId, form])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const items = form.watch('items')
  const { hasStockError, lowStockWarnings } = useStockValidation(items as any)
  const selectedCategory = form.watch('transaction_category') as OutboundCategory

  const onSubmit = (data: QuickOutboundFormData) => {
    submit(
      {
        transaction_category: data.transaction_category as OutboundCategory,
        from_warehouse_id: data.from_warehouse_id,
        to_location: data.to_location,
        items: data.items as any,
      },
      {},
      {
        onSuccess: () => {
          form.reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Xuất kho nhanh"
      description={isMobile ? undefined : 'Ghi nhận xuất kho đơn giản'}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Category Selection */}
          <FormField
            control={form.control}
            name="transaction_category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Loại xuất *</FormLabel>
                <FormControl>
                  <OutboundCategoryGrid
                    value={field.value as OutboundCategory}
                    onChange={field.onChange}
                    options={categoryOptions}
                    variant="compact"
                  />
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
              name="from_warehouse_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Xuất từ kho *</FormLabel>
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

            <FormField
              control={form.control}
              name="to_location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Đến đâu *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Phòng, vị trí..."
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
                onClick={() => append({ item_id: '', quantity: 1, available_quantity: 0 })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Thêm
              </Button>
            </div>

            {fields.map((field, index) => {
              const item = items[index]
              const isOverstock =
                item.available_quantity > 0 && item.quantity > item.available_quantity

              return (
                <div
                  key={field.id}
                  className={cn(
                    'space-y-2 p-3 border rounded-lg',
                    isOverstock ? 'bg-destructive/5 border-destructive' : 'bg-muted/30',
                  )}
                >
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
                            onChange={(value, itemData) => {
                              field.onChange(value)
                              if (itemData) {
                                form.setValue(
                                  `items.${index}.available_quantity`,
                                  itemData.quantity_in_stock || 0,
                                )
                              }
                            }}
                            placeholder="Chọn đồ dùng"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {item.available_quantity > 0 && (
                    <div
                      className={cn(
                        'flex items-center justify-between p-2 rounded text-sm',
                        isOverstock ? 'bg-destructive/10 text-destructive' : 'bg-muted',
                      )}
                    >
                      <span>Tồn kho:</span>
                      <span className="font-bold">{item.available_quantity}</span>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            placeholder="Số lượng xuất"
                            className={cn(
                              isMobile && 'min-h-[48px]',
                              isOverstock && 'border-destructive',
                            )}
                            {...field}
                            onChange={e => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isOverstock && (
                    <p className="text-xs text-destructive font-medium">
                      Vượt quá tồn kho!
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Warnings */}
          {lowStockWarnings.length > 0 && !hasStockError && (
            <Alert>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-600">
                <strong>Cảnh báo:</strong> {lowStockWarnings.length} item sẽ còn dưới 10 sau
                khi xuất
              </AlertDescription>
            </Alert>
          )}

          {hasStockError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm font-medium">
                Không thể xuất vượt quá số lượng tồn kho!
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <TouchButton
              type="submit"
              disabled={isLoading || hasStockError}
              className={cn('w-full', isMobile && 'min-h-[48px]')}
            >
              {isLoading ? 'Đang xử lý...' : 'Xuất kho'}
            </TouchButton>

            {(selectedCategory === 'room_assign' || selectedCategory === 'laundry') && (
              <p className="text-xs text-muted-foreground text-center">
                Mẹo: dùng form đầy đủ ở mobile để chọn phòng/nhà cung cấp giặt là.
              </p>
            )}
          </div>
        </form>
      </Form>
    </ResponsiveDialog>
  )
}
