import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'
import { navigateBack } from '@/lib/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { ImageUpload } from '@/components/shared/ImageUpload'
import { ReceiveItemsTable } from '@/components/laundry/ReceiveItemsTable'
import { StarRating } from '@/components/shared/StarRating'
import { useLaundryBatch, useReceiveLaundryBatch } from '@/hooks/useLaundryBatches'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import Confetti from 'react-confetti'
import { useWindowSize } from '@/hooks/useWindowSize'

const receiveSchema = z.object({
  actual_return_date: z.date(),
  delivery_person_name: z.string().min(2, 'Vui lòng nhập tên người giao'),
  quality_rating: z.number().min(1).max(5),
  timeliness_rating: z.number().min(1).max(5),
  actual_cost: z.number().min(0),
  return_notes: z.string().optional(),
  return_photos: z.array(z.string()).optional(),
  items: z.array(z.object({
    item_id: z.string(),
    quantity_returned: z.number().min(0),
    quantity_lost: z.number().min(0),
    quantity_damaged: z.number().min(0),
    return_condition: z.string(),
  })),
  confirmed: z.boolean().refine(val => val === true, {
    message: 'Vui lòng xác nhận đã kiểm tra',
  }),
})

type ReceiveFormData = z.infer<typeof receiveSchema>

export function ReceiveBatchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { width, height } = useWindowSize()
  const [showSuccess, setShowSuccess] = useState(false)
  
  const { data, isLoading } = useLaundryBatch(id)
  const { mutate: receiveBatch, isPending: isSubmitting } = useReceiveLaundryBatch()
  
  const batch = (data as any)?.batch
  const items = (data as any)?.items || []
  
  const form = useForm<ReceiveFormData>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      actual_return_date: new Date(),
      delivery_person_name: '',
      quality_rating: 5,
      timeliness_rating: 5,
      actual_cost: batch?.estimated_cost || 0,
      return_notes: '',
      return_photos: [],
      items: items.map(item => ({
        item_id: item.item_id,
        quantity_returned: item.quantity_delivered,
        quantity_lost: 0,
        quantity_damaged: 0,
        return_condition: 'Tốt',
      })),
      confirmed: false,
    },
  })
  
  const handleDateChange = (date: Date) => {
    if (!batch?.expected_return_date) return
    
    const expected = new Date(batch.expected_return_date)
    const diffHours = (date.getTime() - expected.getTime()) / (1000 * 60 * 60)
    
    let rating = 5
    if (diffHours > 24) rating = 1
    else if (diffHours > 5) rating = 2
    else if (diffHours > 2) rating = 3
    else if (diffHours > 0) rating = 4
    
    form.setValue('timeliness_rating', rating)
  }
  
  const handleFillAllReceived = () => {
    const currentItems = form.getValues('items')
    const updatedItems = currentItems.map((item, index) => ({
      ...item,
      quantity_returned: items[index].quantity_delivered,
      quantity_lost: 0,
      quantity_damaged: 0,
      return_condition: 'Tốt',
    }))
    form.setValue('items', updatedItems)
  }
  
  const onSubmit = (data: ReceiveFormData) => {
    if (!id) return
    
    receiveBatch(
      { batchId: id, data: data as any },
      {
        onSuccess: () => {
          setShowSuccess(true)
          setTimeout(() => {
            navigate(`/laundry/batches/${id}`)
          }, 3000)
        },
      }
    )
  }
  
  if (isLoading) {
    return <div>Loading...</div>
  }
  
  if (!batch || batch.status !== 'ready') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">
          {batch?.status === 'received' 
            ? 'Lô giặt này đã được nhận'
            : 'Lô giặt chưa sẵn sàng nhận'}
        </h3>
        <Button onClick={() => navigateBack(navigate, '/laundry')} className="mt-4">
          Quay lại danh sách
        </Button>
      </div>
    )
  }
  
  if (showSuccess) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Confetti width={width} height={height} recycle={false} />
        <CheckCircle className="h-20 w-20 text-green-600" />
        <h2 className="mt-4 text-2xl font-bold">Đã nhận đồ giặt thành công!</h2>
        <p className="mt-2 text-muted-foreground">Đang chuyển về trang chi tiết...</p>
      </div>
    )
  }
  
  const formItems = form.watch('items')
  const totalLost = formItems.reduce((sum, item) => sum + item.quantity_lost, 0)
  const totalDamaged = formItems.reduce((sum, item) => sum + item.quantity_damaged, 0)
  const hasIssues = totalLost > 0 || totalDamaged > 0
  
  const compensation = formItems.reduce((sum, item, index) => {
    const itemData = items[index]
    const unitPrice = (itemData as any).item?.unit_price || 0
    return sum + ((item.quantity_lost + item.quantity_damaged) * unitPrice)
  }, 0)
  
  const actualCost = form.watch('actual_cost')
  const finalCost = actualCost - compensation
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Nhận đồ giặt - ${batch.batch_code}`}
        description={`Giao ngày ${format(new Date(batch.delivery_date), 'dd/MM/yyyy', { locale: vi })}`}
      >
        <Button variant="outline" onClick={() => navigateBack(navigate, `/laundry/batches/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Quay lại
        </Button>
      </PageHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin nhận hàng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="actual_return_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ngày giờ nhận *</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          value={field.value ? format(field.value, "yyyy-MM-dd'T'HH:mm") : ''}
                          onChange={(e) => {
                            const date = new Date(e.target.value)
                            field.onChange(date)
                            handleDateChange(date)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="delivery_person_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Người giao (đơn vị giặt) *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Tên người giao hàng" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Kiểm tra đồ giặt</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFillAllReceived}
                >
                  Tất cả nhận đủ
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ReceiveItemsTable
                items={items}
                formItems={formItems}
                onUpdateItem={(index, field, value) => {
                  const currentItems = form.getValues('items')
                  currentItems[index] = { ...currentItems[index], [field]: value }
                  
                  const item = currentItems[index]
                  const delivered = items[index].quantity_delivered
                  
                  if (field === 'quantity_returned') {
                    const remaining = delivered - value
                    if (remaining > 0) {
                      item.quantity_lost = remaining
                    }
                  } else if (field === 'quantity_lost' || field === 'quantity_damaged') {
                    const total = item.quantity_lost + item.quantity_damaged
                    item.quantity_returned = Math.max(0, delivered - total)
                  }
                  
                  form.setValue('items', currentItems)
                }}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Đánh giá chất lượng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="quality_rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chất lượng giặt *</FormLabel>
                    <FormControl>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        size="lg"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value === 5 && 'Xuất sắc - Rất hài lòng'}
                      {field.value === 4 && 'Tốt - Hài lòng'}
                      {field.value === 3 && 'Trung bình - Chấp nhận được'}
                      {field.value === 2 && 'Kém - Không hài lòng'}
                      {field.value === 1 && 'Rất kém - Rất không hài lòng'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="timeliness_rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Đúng giờ *</FormLabel>
                    <FormControl>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        size="lg"
                      />
                    </FormControl>
                    <FormDescription>
                      Đánh giá về thời gian giao hàng
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="return_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nhận xét</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Nhận xét về chất lượng giặt, dịch vụ giao nhận..."
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          {hasIssues && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <AlertCircle className="h-5 w-5" />
                  Vấn đề phát hiện
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {totalLost > 0 && (
                  <div className="rounded-lg bg-red-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Items mất</span>
                      <span className="text-xl font-bold text-red-600">{totalLost}</span>
                    </div>
                  </div>
                )}
                
                {totalDamaged > 0 && (
                  <div className="rounded-lg bg-orange-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Items hư hỏng</span>
                      <span className="text-xl font-bold text-orange-600">{totalDamaged}</span>
                    </div>
                  </div>
                )}
                
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Tổng bồi thường</span>
                    <span className="text-xl font-bold">{formatCurrency(compensation)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Chi phí</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Chi phí ước tính:</span>
                <span className="font-medium">{formatCurrency(batch.estimated_cost)}</span>
              </div>
              
              <FormField
                control={form.control}
                name="actual_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chi phí thực tế *</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min={0}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Chênh lệch: {' '}
                      <span className={
                        field.value > batch.estimated_cost ? 'text-red-600' : 'text-green-600'
                      }>
                        {field.value > batch.estimated_cost ? '+' : ''}
                        {formatCurrency(field.value - batch.estimated_cost)}
                      </span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {compensation > 0 && (
                <>
                  <div className="flex justify-between text-sm border-t pt-4">
                    <span className="text-muted-foreground">Trừ bồi thường:</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(compensation)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-lg font-bold">
                    <span>Thành tiền:</span>
                    <span>{formatCurrency(finalCost)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Ảnh nhận hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="return_photos"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ImageUpload
                        images={field.value || []}
                        onChange={field.onChange}
                        maxImages={10}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="confirmed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Tôi xác nhận đã kiểm tra kỹ số lượng và chất lượng đồ giặt
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/laundry/batches/${id}`)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang xử lý...' : 'Hoàn tất nhận hàng'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
