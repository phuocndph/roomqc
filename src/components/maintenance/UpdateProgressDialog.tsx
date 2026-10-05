import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useUpdateMaintenanceRequest } from '@/hooks/useMaintenanceRequests'
import { toast } from '@/hooks/use-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

interface UpdateProgressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
}

const updateSchema = z.object({
  notes: z.string().min(10, 'Ghi chú phải có ít nhất 10 ký tự'),
  expected_completion_date: z.string().optional(),
  estimated_cost: z.number().optional(),
})

type UpdateFormData = z.infer<typeof updateSchema>

export const UpdateProgressDialog = ({
  open,
  onOpenChange,
  requestId,
}: UpdateProgressDialogProps) => {
  const updateRequest = useUpdateMaintenanceRequest()

  const form = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      notes: '',
      expected_completion_date: '',
      estimated_cost: undefined,
    },
  })

  const onSubmit = async (data: UpdateFormData) => {
    try {
      await updateRequest.mutateAsync({
        id: requestId,
        data: {
          notes: data.notes,
          expected_completion_date: data.expected_completion_date || undefined,
          estimated_cost: data.estimated_cost,
        },
      })
      
      toast({
        title: 'Đã cập nhật',
        description: 'Tiến độ yêu cầu đã được cập nhật',
      })
      
      onOpenChange(false)
      form.reset()
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật tiến độ',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cập nhật tiến độ</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin tiến độ xử lý yêu cầu
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tiến độ hiện tại *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Mô tả tình trạng và tiến độ hiện tại..."
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expected_completion_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ngày hoàn thành dự kiến</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimated_cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chi phí phát sinh (VNĐ)</FormLabel>
                  <FormControl>
                    <Input
                      type="number" min={0}
                      {...field}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      value={field.value || ''}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={updateRequest.isPending}>
                {updateRequest.isPending ? 'Đang cập nhật...' : 'Cập nhật'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
