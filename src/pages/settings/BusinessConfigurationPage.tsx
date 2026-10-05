import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTenant } from '@/hooks/useTenant'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { getFriendlyError } from '@/lib/errorMessage'

const businessConfigSchema = z.object({
  inventory: z.object({
    default_unit: z.string().default('pieces'),
    auto_approve_adjustments: z.boolean().default(false),
    approval_threshold: z.number().min(0).default(100),
    enable_barcode: z.boolean().default(true),
    track_serial_numbers: z.boolean().default(false),
  }),
  laundry: z.object({
    default_weight_unit: z.enum(['kg', 'lbs']).default('kg'),
    track_individual_items: z.boolean().default(true),
    expected_turnaround_hours: z.number().min(1).default(48),
    auto_alert_overdue: z.boolean().default(true),
  }),
  rooms: z.object({
    default_checkout_time: z.string().default('12:00'),
    auto_reset_items: z.boolean().default(true),
    require_inspection: z.boolean().default(true),
  }),
  maintenance: z.object({
    auto_assign: z.boolean().default(false),
    require_completion_photos: z.boolean().default(true),
    default_priority: z.enum(['low', 'medium', 'high']).default('medium'),
    sla_hours: z.object({
      high: z.number().min(1).default(4),
      medium: z.number().min(1).default(24),
      low: z.number().min(1).default(72),
    }),
  }),
  purchase_orders: z.object({
    approval_threshold: z.number().min(0).default(5000000),
    auto_send_vendor_email: z.boolean().default(true),
    default_payment_terms: z.string().default('Net 30'),
  }),
})

type BusinessConfigForm = z.infer<typeof businessConfigSchema>

export function BusinessConfigurationPage() {
  const { tenant, isLoading } = useTenant()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BusinessConfigForm>({
    resolver: zodResolver(businessConfigSchema),
    values: tenant?.settings ? {
      inventory: (tenant.settings as any)?.inventory || {
        default_unit: 'pieces',
        auto_approve_adjustments: false,
        approval_threshold: 100,
        enable_barcode: true,
        track_serial_numbers: false,
      },
      laundry: (tenant.settings as any)?.laundry || {
        default_weight_unit: 'kg',
        track_individual_items: true,
        expected_turnaround_hours: 48,
        auto_alert_overdue: true,
      },
      rooms: (tenant.settings as any)?.rooms || {
        default_checkout_time: '12:00',
        auto_reset_items: true,
        require_inspection: true,
      },
      maintenance: (tenant.settings as any)?.maintenance || {
        auto_assign: false,
        require_completion_photos: true,
        default_priority: 'medium',
        sla_hours: { high: 4, medium: 24, low: 72 },
      },
      purchase_orders: (tenant.settings as any)?.purchase_orders || {
        approval_threshold: 5000000,
        auto_send_vendor_email: true,
        default_payment_terms: 'Net 30',
      },
    } : undefined,
  })

  const onSubmit = async (data: BusinessConfigForm) => {
    if (!tenant) return

    setIsSaving(true)
    try {
      const currentSettings = (tenant.settings as any) || {}
      const { error } = await supabase
        .from('tenants')
        .update({
          settings: {
            ...currentSettings,
            ...data,
          },
        })
        .eq('id', tenant.id)

      if (error) throw error

      toast({
        title: 'Đã lưu',
        description: 'Cấu hình nghiệp vụ đã được cập nhật',
      })
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cấu hình nghiệp vụ</h1>
        <p className="text-muted-foreground mt-2">
          Thiết lập các tham số và quy trình nghiệp vụ
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Inventory Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Cài đặt kho</CardTitle>
            <CardDescription>Cấu hình quản lý tồn kho và kiểm kê</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Đơn vị mặc định</Label>
                <Select
                  value={watch('inventory.default_unit')}
                  onValueChange={(value) => setValue('inventory.default_unit', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pieces">Cái</SelectItem>
                    <SelectItem value="sets">Bộ</SelectItem>
                    <SelectItem value="boxes">Hộp</SelectItem>
                    <SelectItem value="units">Đơn vị</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approval-threshold">Ngưỡng phê duyệt</Label>
                <Input
                  id="approval-threshold"
                  type="number" min={0}
                  {...register('inventory.approval_threshold', { valueAsNumber: true })}
                  placeholder="100"
                />
                <p className="text-xs text-muted-foreground">
                  Điều chỉnh &gt; ngưỡng này cần phê duyệt
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Tự động phê duyệt điều chỉnh</Label>
                  <p className="text-sm text-muted-foreground">
                    Phê duyệt tự động các điều chỉnh nhỏ
                  </p>
                </div>
                <Switch
                  checked={watch('inventory.auto_approve_adjustments')}
                  onCheckedChange={(checked) => setValue('inventory.auto_approve_adjustments', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Quét mã vạch</Label>
                  <p className="text-sm text-muted-foreground">
                    Kích hoạt tính năng quét barcode/QR
                  </p>
                </div>
                <Switch
                  checked={watch('inventory.enable_barcode')}
                  onCheckedChange={(checked) => setValue('inventory.enable_barcode', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Theo dõi số seri</Label>
                  <p className="text-sm text-muted-foreground">
                    Quản lý serial number cho từng sản phẩm
                  </p>
                </div>
                <Switch
                  checked={watch('inventory.track_serial_numbers')}
                  onCheckedChange={(checked) => setValue('inventory.track_serial_numbers', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Laundry Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Cài đặt giặt ủi</CardTitle>
            <CardDescription>Cấu hình quy trình giặt ủi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Đơn vị cân nặng</Label>
                <Select
                  value={watch('laundry.default_weight_unit')}
                  onValueChange={(value: 'kg' | 'lbs') => setValue('laundry.default_weight_unit', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kilogram (kg)</SelectItem>
                    <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="turnaround-hours">Thời gian dự kiến</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="turnaround-hours"
                    type="number" min={0}
                    {...register('laundry.expected_turnaround_hours', { valueAsNumber: true })}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">giờ</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Theo dõi từng món</Label>
                  <p className="text-sm text-muted-foreground">
                    Ghi nhận chi tiết từng món đồ giặt
                  </p>
                </div>
                <Switch
                  checked={watch('laundry.track_individual_items')}
                  onCheckedChange={(checked) => setValue('laundry.track_individual_items', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Cảnh báo quá hạn tự động</Label>
                  <p className="text-sm text-muted-foreground">
                    Gửi thông báo khi lô giặt trễ hạn
                  </p>
                </div>
                <Switch
                  checked={watch('laundry.auto_alert_overdue')}
                  onCheckedChange={(checked) => setValue('laundry.auto_alert_overdue', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Room Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Cài đặt phòng</CardTitle>
            <CardDescription>Cấu hình quản lý phòng và thiết bị</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkout-time">Giờ trả phòng mặc định</Label>
              <Input
                id="checkout-time"
                type="time"
                {...register('rooms.default_checkout_time')}
                className="w-40"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Tự động reset thiết bị</Label>
                  <p className="text-sm text-muted-foreground">
                    Reset danh sách thiết bị sau khi dọn phòng
                  </p>
                </div>
                <Switch
                  checked={watch('rooms.auto_reset_items')}
                  onCheckedChange={(checked) => setValue('rooms.auto_reset_items', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Yêu cầu checklist kiểm tra</Label>
                  <p className="text-sm text-muted-foreground">
                    Bắt buộc hoàn thành checklist khi kiểm tra phòng
                  </p>
                </div>
                <Switch
                  checked={watch('rooms.require_inspection')}
                  onCheckedChange={(checked) => setValue('rooms.require_inspection', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Cài đặt bảo trì</CardTitle>
            <CardDescription>Cấu hình quy trình bảo trì và sửa chữa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Độ ưu tiên mặc định</Label>
                <Select
                  value={watch('maintenance.default_priority')}
                  onValueChange={(value: 'low' | 'medium' | 'high') => setValue('maintenance.default_priority', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Thấp</SelectItem>
                    <SelectItem value="medium">Trung bình</SelectItem>
                    <SelectItem value="high">Cao</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>SLA (Service Level Agreement)</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Thời gian xử lý tối đa theo độ ưu tiên
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="sla-high" className="text-xs text-destructive">
                    Cao (giờ)
                  </Label>
                  <Input
                    id="sla-high"
                    type="number" min={0}
                    {...register('maintenance.sla_hours.high', { valueAsNumber: true })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sla-medium" className="text-xs text-yellow-600">
                    Trung bình (giờ)
                  </Label>
                  <Input
                    id="sla-medium"
                    type="number" min={0}
                    {...register('maintenance.sla_hours.medium', { valueAsNumber: true })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sla-low" className="text-xs text-green-600">
                    Thấp (giờ)
                  </Label>
                  <Input
                    id="sla-low"
                    type="number" min={0}
                    {...register('maintenance.sla_hours.low', { valueAsNumber: true })}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Tự động gán theo danh mục</Label>
                  <p className="text-sm text-muted-foreground">
                    Gán thợ dựa trên chuyên môn và khả năng
                  </p>
                </div>
                <Switch
                  checked={watch('maintenance.auto_assign')}
                  onCheckedChange={(checked) => setValue('maintenance.auto_assign', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Yêu cầu ảnh hoàn thành</Label>
                  <p className="text-sm text-muted-foreground">
                    Bắt buộc chụp ảnh khi hoàn thành công việc
                  </p>
                </div>
                <Switch
                  checked={watch('maintenance.require_completion_photos')}
                  onCheckedChange={(checked) => setValue('maintenance.require_completion_photos', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Order Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Cài đặt đơn đặt hàng</CardTitle>
            <CardDescription>Cấu hình quy trình mua hàng</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="po-threshold">Ngưỡng phê duyệt</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="po-threshold"
                    type="number" min={0}
                    {...register('purchase_orders.approval_threshold', { valueAsNumber: true })}
                  />
                  <span className="text-sm text-muted-foreground">₫</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Đơn hàng &gt; giá trị này cần phê duyệt
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-terms">Điều khoản thanh toán</Label>
                <Select
                  value={watch('purchase_orders.default_payment_terms')}
                  onValueChange={(value) => setValue('purchase_orders.default_payment_terms', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Net 7">Net 7 (7 ngày)</SelectItem>
                    <SelectItem value="Net 15">Net 15 (15 ngày)</SelectItem>
                    <SelectItem value="Net 30">Net 30 (30 ngày)</SelectItem>
                    <SelectItem value="Net 60">Net 60 (60 ngày)</SelectItem>
                    <SelectItem value="COD">COD (Trả khi nhận)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tự động gửi email cho vendor</Label>
                <p className="text-sm text-muted-foreground">
                  Gửi email thông báo khi đơn hàng được tạo
                </p>
              </div>
              <Switch
                checked={watch('purchase_orders.auto_send_vendor_email')}
                onCheckedChange={(checked) => setValue('purchase_orders.auto_send_vendor_email', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline">
            Hủy
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu cấu hình
          </Button>
        </div>
      </form>
    </div>
  )
}
