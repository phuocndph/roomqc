import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useCompleteRequest } from '@/hooks/useMaintenanceRequests'
import { toast } from '@/hooks/use-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Plus, X } from 'lucide-react'

interface CompleteRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
}

const completeSchema = z.object({
  solution: z.string().min(10, 'Giải pháp phải có ít nhất 10 ký tự'),
  actual_cost: z.number().optional(),
  completion_notes: z.string().optional(),
})

type CompleteFormData = z.infer<typeof completeSchema>

export const CompleteRequestDialog = ({
  open,
  onOpenChange,
  requestId,
}: CompleteRequestDialogProps) => {
  const completeRequest = useCompleteRequest()
  const [partsUsed, setPartsUsed] = useState<string[]>([''])

  const form = useForm<CompleteFormData>({
    resolver: zodResolver(completeSchema),
    defaultValues: {
      solution: '',
      actual_cost: undefined,
      completion_notes: '',
    },
  })

  const handleAddPart = () => {
    setPartsUsed([...partsUsed, ''])
  }

  const handleRemovePart = (index: number) => {
    setPartsUsed(partsUsed.filter((_, i) => i !== index))
  }

  const handlePartChange = (index: number, value: string) => {
    const newParts = [...partsUsed]
    newParts[index] = value
    setPartsUsed(newParts)
  }

  const onSubmit = async (data: CompleteFormData) => {
    try {
      const filteredParts = partsUsed.filter(p => p.trim() !== '')
      
      await completeRequest.mutateAsync({
        id: requestId,
        data: {
          solution: data.solution,
          actual_cost: data.actual_cost,
          completion_notes: data.completion_notes,
          parts_used: filteredParts.length > 0 ? filteredParts : undefined,
        },
      })
      
      toast({
        title: 'Đã hoàn thành',
        description: 'Yêu cầu bảo trì đã được hoàn thành',
      })
      
      onOpenChange(false)
      form.reset()
      setPartsUsed([''])
    } catch (error) {
      console.error('Complete request error:', error)
      toast({
        title: 'Lỗi',
        description: error?.message || 'Không thể hoàn thành yêu cầu',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hoàn thành yêu cầu bảo trì</DialogTitle>
          <DialogDescription>
            Nhập thông tin chi tiết về việc hoàn thành yêu cầu
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="solution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Giải pháp đã áp dụng *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Mô tả giải pháp và cách thức xử lý..."
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="actual_cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chi phí thực tế (VNĐ)</FormLabel>
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

            <div className="space-y-2">
              <Label>Phụ tùng đã sử dụng</Label>
              {partsUsed.map((part, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={part}
                    onChange={(e) => handlePartChange(index, e.target.value)}
                    placeholder="Tên phụ tùng"
                  />
                  {partsUsed.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemovePart(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPart}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Thêm phụ tùng
              </Button>
            </div>

            <FormField
              control={form.control}
              name="completion_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú hoàn thành</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Ghi chú bổ sung..."
                      rows={3}
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
              <Button type="submit" disabled={completeRequest.isPending}>
                {completeRequest.isPending ? 'Đang xử lý...' : 'Hoàn thành'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
