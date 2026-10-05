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
import { Label } from '@/components/ui/label'
import { useCancelRequest } from '@/hooks/useMaintenanceRequests'
import { toast } from '@/hooks/use-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

interface CancelRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
}

const cancelSchema = z.object({
  reason: z.string().min(10, 'Lý do hủy phải có ít nhất 10 ký tự'),
})

type CancelFormData = z.infer<typeof cancelSchema>

export const CancelRequestDialog = ({
  open,
  onOpenChange,
  requestId,
}: CancelRequestDialogProps) => {
  const cancelRequest = useCancelRequest()

  const form = useForm<CancelFormData>({
    resolver: zodResolver(cancelSchema),
    defaultValues: {
      reason: '',
    },
  })

  const onSubmit = async (data: CancelFormData) => {
    try {
      await cancelRequest.mutateAsync({
        id: requestId,
        reason: data.reason,
      })
      
      toast({
        title: 'Đã hủy yêu cầu',
        description: 'Yêu cầu bảo trì đã được hủy',
      })
      
      onOpenChange(false)
      form.reset()
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể hủy yêu cầu',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy yêu cầu bảo trì</DialogTitle>
          <DialogDescription>
            Vui lòng nhập lý do hủy yêu cầu bảo trì này
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do hủy *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Nhập lý do hủy yêu cầu..."
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
              <Button 
                type="submit" 
                variant="destructive"
                disabled={cancelRequest.isPending}
              >
                {cancelRequest.isPending ? 'Đang hủy...' : 'Xác nhận hủy'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
