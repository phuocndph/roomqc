import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateWarehouse, useUpdateWarehouse } from '@/hooks/useWarehouses'
import { WAREHOUSE_LOCATION_TYPE_OPTIONS } from '@/types/warehouse.types'
import type { Warehouse, WarehouseFormData, WarehouseLocationType } from '@/types/warehouse.types'

const warehouseSchema = z.object({
  code: z.string().min(1, 'Mã kho là bắt buộc').max(20, 'Mã kho tối đa 20 ký tự'),
  name: z.string().min(1, 'Tên kho là bắt buộc').max(100, 'Tên kho tối đa 100 ký tự'),
  location_type: z.enum(['warehouse', 'room', 'floor', 'external'] as const),
  address: z.string().optional(),
  description: z.string().optional(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().optional(),
})

interface WarehouseFormProps {
  warehouse?: Warehouse | null
  onSuccess: () => void
  onCancel: () => void
}

export function WarehouseForm({ warehouse, onSuccess, onCancel }: WarehouseFormProps) {
  const createWarehouse = useCreateWarehouse()
  const updateWarehouse = useUpdateWarehouse()

  const form = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      code: warehouse?.code || '',
      name: warehouse?.name || '',
      location_type: (warehouse?.location_type as WarehouseLocationType) || 'warehouse',
      address: warehouse?.address || '',
      description: warehouse?.description || '',
      is_default: warehouse?.is_default || false,
      is_active: warehouse?.is_active ?? true,
      sort_order: warehouse?.sort_order || 0,
    },
  })

  const isLoading = createWarehouse.isPending || updateWarehouse.isPending

  const onSubmit = async (data: WarehouseFormData) => {
    if (warehouse) {
      await updateWarehouse.mutateAsync({ id: warehouse.id, data })
    } else {
      await createWarehouse.mutateAsync(data)
    }
    onSuccess()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mã kho</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="KHO-T1" className="h-9 font-mono" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Loại vị trí</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Chọn loại" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {WAREHOUSE_LOCATION_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên kho</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Kho tầng 1" className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Địa chỉ (tùy chọn)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Dùng cho kho bên ngoài" className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mô tả (tùy chọn)</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Ghi chú về kho..." rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-6 pt-2">
          <FormField
            control={form.control}
            name="is_default"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={warehouse?.is_default}
                  />
                </FormControl>
                <div>
                  <FormLabel className="text-sm">Kho mặc định</FormLabel>
                  <FormDescription className="text-xs">
                    Dùng cho nhập/xuất kho mới
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={warehouse?.is_default}
                  />
                </FormControl>
                <div>
                  <FormLabel className="text-sm">Hoạt động</FormLabel>
                  <FormDescription className="text-xs">
                    Cho phép sử dụng kho
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Hủy
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Đang lưu...' : warehouse ? 'Cập nhật' : 'Tạo kho'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
