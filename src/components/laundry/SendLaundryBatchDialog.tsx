import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, addDays } from 'date-fns'
import { vi } from 'date-fns/locale'
import { CalendarIcon, Package, Loader2, Truck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { useHotelStaffList } from '@/hooks/useHotelStaffList'
import { useSendDraftBatch } from '@/hooks/useSendDraftBatch'
import { useHotelContext } from '@/contexts/HotelContext'

interface DraftBatch {
  id: string
  batch_code: string
  total_items: number | null
  total_weight_kg?: number | null
}

interface SendLaundryBatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  batch: DraftBatch | null
  onSuccess: () => void
}

const sendBatchSchema = z.object({
  vendor_id: z.string().min(1, 'Vui lòng chọn đơn vị giặt'),
  delivery_date: z.date({ required_error: 'Vui lòng chọn ngày giao' }),
  expected_return_date: z.date({ required_error: 'Vui lòng chọn ngày dự kiến nhận' }),
  delivery_staff_id: z.string().min(1, 'Vui lòng chọn người giao'),
  receiver_name: z.string().min(2, 'Vui lòng nhập tên người nhận'),
  notes: z.string().optional(),
})

type SendBatchFormData = z.infer<typeof sendBatchSchema>

export function SendLaundryBatchDialog({
  open,
  onOpenChange,
  batch,
  onSuccess,
}: SendLaundryBatchDialogProps) {
  const { selectedHotel } = useHotelContext()
  const { data: vendors, isLoading: vendorsLoading } = useLaundryVendors({ status: 'active' })
  const { data: staffList, isLoading: staffLoading } = useHotelStaffList(selectedHotel?.id)
  const sendBatch = useSendDraftBatch()

  const form = useForm<SendBatchFormData>({
    resolver: zodResolver(sendBatchSchema),
    defaultValues: {
      vendor_id: '',
      delivery_date: new Date(),
      expected_return_date: addDays(new Date(), 2),
      delivery_staff_id: '',
      receiver_name: '',
      notes: '',
    },
  })

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        vendor_id: '',
        delivery_date: new Date(),
        expected_return_date: addDays(new Date(), 2),
        delivery_staff_id: '',
        receiver_name: '',
        notes: '',
      })
    }
  }, [open, form])

  const onSubmit = (data: SendBatchFormData) => {
    if (!batch) return

    sendBatch.mutate(
      {
        batchId: batch.id,
        vendorId: data.vendor_id,
        deliveryDate: data.delivery_date,
        expectedReturnDate: data.expected_return_date,
        deliveryStaffId: data.delivery_staff_id,
        receiverName: data.receiver_name,
        notes: data.notes,
      },
      {
        onSuccess: () => {
          onSuccess()
          onOpenChange(false)
        },
      }
    )
  }

  if (!batch) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Gửi lô giặt
          </DialogTitle>
          <DialogDescription>
            Điền thông tin để gửi lô giặt đến đơn vị giặt
          </DialogDescription>
        </DialogHeader>

        {/* Batch info */}
        <div className="p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium font-mono text-sm">{batch.batch_code}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {batch.total_items || 0} món
            {batch.total_weight_kg ? ` • ${batch.total_weight_kg.toFixed(1)} kg` : ''}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Vendor */}
            <FormField
              control={form.control}
              name="vendor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Đơn vị giặt *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={vendorsLoading ? 'Đang tải...' : 'Chọn đơn vị giặt'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vendors?.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="delivery_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Ngày giao *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal h-9',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd/MM/yyyy', { locale: vi })
                            ) : (
                              <span>Chọn ngày</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expected_return_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Dự kiến nhận *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal h-9',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd/MM/yyyy', { locale: vi })
                            ) : (
                              <span>Chọn ngày</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < form.getValues('delivery_date')}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Staff */}
            <FormField
              control={form.control}
              name="delivery_staff_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Người giao *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={staffLoading ? 'Đang tải...' : 'Chọn nhân viên'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {staffList?.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.full_name}
                          {staff.position_name && (
                            <span className="text-muted-foreground ml-1">
                              ({staff.position_name})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Receiver name */}
            <FormField
              control={form.control}
              name="receiver_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên người nhận tại đơn vị giặt *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nhập tên người nhận" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ghi chú thêm (tùy chọn)"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sendBatch.isPending}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={sendBatch.isPending}>
                {sendBatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gửi đi giặt
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
