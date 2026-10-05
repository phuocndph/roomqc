import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Plus, X, Package, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect'
import { WarehouseStockBadge } from '@/components/warehouse/WarehouseStockBadge'
import { ItemSelect } from '@/components/shared/ItemSelect'
import { useCreateWarehouseTransfer } from '@/hooks/useWarehouseTransfer'
import { useMultipleWarehouseStock } from '@/hooks/useWarehouseStock'
import { cn } from '@/lib/utils'

const transferSchema = z.object({
  from_warehouse_id: z.string().uuid('Vui lòng chọn kho nguồn'),
  to_warehouse_id: z.string().uuid('Vui lòng chọn kho đích'),
  items: z.array(z.object({
    item_id: z.string().uuid('Vui lòng chọn đồ dùng'),
    quantity: z.number().min(1, 'Số lượng phải > 0'),
    notes: z.string().optional(),
  })).min(1, 'Phải có ít nhất 1 đồ dùng'),
  notes: z.string().optional(),
}).refine(
  (data) => data.from_warehouse_id !== data.to_warehouse_id,
  {
    message: 'Kho nguồn và kho đích phải khác nhau',
    path: ['to_warehouse_id'],
  }
)

type TransferFormData = z.infer<typeof transferSchema>

export default function TransferPage() {
  const navigate = useNavigate()
  const { mutate: createTransfer, isPending: isLoading } = useCreateWarehouseTransfer()
  
  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_warehouse_id: '',
      to_warehouse_id: '',
      items: [{ item_id: '', quantity: 1, notes: '' }],
      notes: '',
    },
  })
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })
  
  const fromWarehouseId = form.watch('from_warehouse_id')
  const items = form.watch('items')
  const itemIds = items.map(i => i.item_id).filter(Boolean)
  
  // Get stock for selected items in source warehouse
  const { data: stockMap } = useMultipleWarehouseStock(fromWarehouseId, itemIds)
  
  // Check for overstock
  const hasOverstock = items.some(item => {
    if (!item.item_id || !stockMap) return false
    const stock = stockMap[item.item_id]
    return stock && item.quantity > stock.quantity
  })
  
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  
  const onSubmit = (data: TransferFormData) => {
    createTransfer({
      from_warehouse_id: data.from_warehouse_id,
      to_warehouse_id: data.to_warehouse_id,
      items: data.items.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity,
        notes: item.notes,
      })),
      notes: data.notes,
    }, {
      onSuccess: () => {
        navigate('/inventory?tab=operations&sub=transactions')
      },
    })
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="Chuyển kho"
        description="Di chuyển hàng hóa giữa các kho trong khách sạn"
      >
        <Button variant="outline" onClick={() => navigateBack(navigate, '/inventory')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Quay lại
        </Button>
      </PageHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Warehouse Selection */}
          <div className="border rounded-lg p-4 space-y-4">
            <p className="text-sm font-medium">Chọn kho</p>
            
            <div className="grid gap-4 md:grid-cols-[1fr,auto,1fr]">
              <FormField
                control={form.control}
                name="from_warehouse_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Kho nguồn *</FormLabel>
                    <FormControl>
                      <WarehouseSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Chọn kho xuất"
                        excludeId={form.watch('to_warehouse_id')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="hidden md:flex items-center justify-center pt-6">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              
              <FormField
                control={form.control}
                name="to_warehouse_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Kho đích *</FormLabel>
                    <FormControl>
                      <WarehouseSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Chọn kho nhập"
                        excludeId={fromWarehouseId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          
          {/* Items */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Đồ dùng chuyển</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => append({ item_id: '', quantity: 1, notes: '' })}
              >
                <Plus className="mr-1 h-3 w-3" />
                Thêm
              </Button>
            </div>
            
            {!fromWarehouseId && (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Vui lòng chọn kho nguồn trước</p>
              </div>
            )}
            
            {fromWarehouseId && (
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const item = items[index]
                  const stock = stockMap?.[item.item_id]
                  const isOverstock = stock && item.quantity > stock.quantity
                  
                  return (
                    <div 
                      key={field.id} 
                      className={cn(
                        'relative p-3 border rounded-lg',
                        isOverstock ? 'bg-destructive/5 border-destructive' : 'bg-muted/20'
                      )}
                    >
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-6 w-6"
                          onClick={() => remove(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                      
                      <div className="grid gap-2 md:grid-cols-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.item_id`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Đồ dùng *</FormLabel>
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
                        
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel className="text-xs">Số lượng *</FormLabel>
                                {item.item_id && (
                                  <WarehouseStockBadge 
                                    warehouseId={fromWarehouseId} 
                                    itemId={item.item_id}
                                  />
                                )}
                              </div>
                              <FormControl>
                                <Input
                                  type="number" min={0}
                                  placeholder="0"
                                  className={cn('h-9', isOverstock && 'border-destructive')}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              {isOverstock && (
                                <p className="text-xs text-destructive">
                                  Vượt quá tồn kho (còn {stock?.quantity || 0})
                                </p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name={`items.${index}.notes`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Ghi chú</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ghi chú..." className="h-9" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          
          {/* Notes */}
          <div className="border rounded-lg p-4 space-y-3">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Ghi chú chung</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Lý do chuyển kho, ghi chú..." rows={2} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          
          {/* Warning */}
          {hasOverstock && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Không thể chuyển vượt quá số lượng tồn kho tại kho nguồn!
              </AlertDescription>
            </Alert>
          )}
          
          {/* Summary & Actions */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div className="flex gap-4 text-sm">
              <span>{items.filter(i => i.item_id).length} loại</span>
              <span className="text-blue-600 font-medium">↔ {totalQuantity} đơn vị</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => navigateBack(navigate, '/inventory')}>
                Hủy
              </Button>
              <Button type="submit" size="sm" disabled={isLoading || hasOverstock || !fromWarehouseId}>
                {isLoading ? 'Đang xử lý...' : 'Xác nhận chuyển kho'}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}
