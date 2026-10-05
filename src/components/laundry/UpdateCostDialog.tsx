import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency } from '@/lib/utils'
import { DollarSign } from 'lucide-react'

interface UpdateCostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  batch: {
    id: string
    batch_code: string
    total_weight_kg: number
    estimated_cost: number
    actual_cost?: number
  }
  onUpdate: (data: {
    total_weight_kg: number
    estimated_cost: number
    actual_cost?: number
  }) => void
  isPending?: boolean
}

const formSchema = z.object({
  weight_kg: z.number().min(0, 'Cân nặng phải >= 0 kg'),
  unit_price: z.number().min(0, 'Đơn giá phải >= 0'),
  is_actual_cost: z.boolean().default(false),
})

export function UpdateCostDialog({
  open,
  onOpenChange,
  batch,
  onUpdate,
  isPending,
}: UpdateCostDialogProps) {
  const [calculatedCost, setCalculatedCost] = useState(0)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      weight_kg: batch.total_weight_kg || 0,
      unit_price: batch.estimated_cost && batch.total_weight_kg 
        ? Math.round(batch.estimated_cost / batch.total_weight_kg)
        : 0,
      is_actual_cost: false,
    },
  })

  const weight = form.watch('weight_kg')
  const unitPrice = form.watch('unit_price')
  const isActualCost = form.watch('is_actual_cost')

  useEffect(() => {
    const cost = Math.round(weight * unitPrice)
    setCalculatedCost(cost)
  }, [weight, unitPrice])

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    onUpdate({
      total_weight_kg: values.weight_kg,
      estimated_cost: calculatedCost,
      ...(values.is_actual_cost && { actual_cost: calculatedCost }),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cập nhật chi phí</DialogTitle>
          <DialogDescription>
            Lô {batch.batch_code}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="weight_kg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cân nặng thực tế (kg)</FormLabel>
                  <FormControl>
                    <Input
                      type="number" min={0}
                      step="0.1"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unit_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Đơn giá (VND/kg)</FormLabel>
                  <FormControl>
                    <Input
                      type="number" min={0}
                      step="1000"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Chi phí tính toán</span>
                <span className="text-lg font-bold">{formatCurrency(calculatedCost)}</span>
              </div>
              
              {batch.estimated_cost > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Chi phí cũ</span>
                  <span>{formatCurrency(batch.estimated_cost)}</span>
                </div>
              )}
              
              {calculatedCost !== batch.estimated_cost && (
                <div className="flex justify-between items-center text-sm font-medium">
                  <span>Chênh lệch</span>
                  <span className={calculatedCost > batch.estimated_cost ? 'text-red-600' : 'text-green-600'}>
                    {calculatedCost > batch.estimated_cost ? '+' : ''}
                    {formatCurrency(calculatedCost - batch.estimated_cost)}
                  </span>
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="is_actual_cost"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">
                      Đây là chi phí thực tế
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Đánh dấu nếu đây là chi phí cuối cùng sau khi đã thanh toán
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                <DollarSign className="mr-2 h-4 w-4" />
                {isPending ? 'Đang lưu...' : 'Cập nhật chi phí'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
