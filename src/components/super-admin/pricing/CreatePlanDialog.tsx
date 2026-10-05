import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreatePlan } from '@/hooks/super-admin/usePricingManagement';
import { Settings, DollarSign, Database, Sparkles, Building2, Calendar } from 'lucide-react';

const planSchema = z.object({
  name: z.string().min(1, 'Tên gói là bắt buộc'),
  code: z.string().min(1, 'Mã gói là bắt buộc'),
  description: z.string().optional(),
  price_per_room_daily: z.number().min(1, 'Giá phải lớn hơn 0'),
  min_subscription_days: z.number().min(1, 'Số ngày tối thiểu phải lớn hơn 0'),
  max_hotels: z.number().min(-1),
  max_users: z.number().min(-1),
  max_storage_gb: z.number().min(0),
  display_order: z.number().min(0),
  is_active: z.boolean(),
  features: z.object({
    advanced_reporting: z.boolean(),
    api_access: z.boolean(),
    priority_support: z.boolean(),
    custom_branding: z.boolean(),
    sso: z.boolean(),
    audit_logs: z.boolean(),
  }),
});

type PlanFormValues = z.infer<typeof planSchema>;

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePlanDialog({ open, onOpenChange }: CreatePlanDialogProps) {
  const createPlan = useCreatePlan();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      price_per_room_daily: 1000,
      min_subscription_days: 30,
      max_hotels: -1,
      max_users: -1,
      max_storage_gb: 10,
      display_order: 0,
      is_active: true,
      features: {
        advanced_reporting: true,
        api_access: true,
        priority_support: true,
        custom_branding: true,
        sso: false,
        audit_logs: true,
      },
    },
  });

  const onSubmit = async (data: PlanFormValues) => {
    // Calculate monthly/yearly prices for compatibility
    const monthlyPrice = 50 * data.price_per_room_daily * 30; // Sample: 50 rooms
    const yearlyPrice = 50 * data.price_per_room_daily * 365 * 0.9; // 10% discount

    await createPlan.mutateAsync({
      name: data.name,
      code: data.code,
      description: data.description,
      pricing_model: 'room_based',
      price_per_room_daily: data.price_per_room_daily,
      min_subscription_days: data.min_subscription_days,
      price_monthly: monthlyPrice,
      price_yearly: yearlyPrice,
      max_hotels: data.max_hotels,
      max_users: data.max_users,
      max_storage_gb: data.max_storage_gb,
      display_order: data.display_order,
      is_active: data.is_active,
      features: data.features,
    });
    onOpenChange(false);
    form.reset();
  };

  const pricePerDay = form.watch('price_per_room_daily');
  const minDays = form.watch('min_subscription_days');
  const samplePrice50Rooms = 50 * pricePerDay * minDays;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo gói mới</DialogTitle>
          <DialogDescription>
            Thiết lập gói đăng ký mới với giá theo số phòng
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">
                  <Settings className="h-4 w-4 mr-2" />
                  Thông tin & Giá
                </TabsTrigger>
                <TabsTrigger value="limits">
                  <Database className="h-4 w-4 mr-2" />
                  Giới hạn
                </TabsTrigger>
                <TabsTrigger value="features">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Tính năng
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tên gói</FormLabel>
                      <FormControl>
                        <Input placeholder="VD: Gói Tiêu chuẩn" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mã gói</FormLabel>
                      <FormControl>
                        <Input placeholder="VD: standard" {...field} />
                      </FormControl>
                      <FormDescription>Mã định danh duy nhất cho gói này</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mô tả</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Mô tả những gì có trong gói này..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Room-based pricing */}
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Mô hình giá theo phòng
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price_per_room_daily"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Giá mỗi phòng/ngày (VNĐ)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              placeholder="1000"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="min_subscription_days"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Đăng ký tối thiểu (ngày)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              placeholder="30"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Price preview */}
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground mb-2">Ví dụ tính giá (50 phòng):</p>
                    <div className="text-lg font-bold text-primary">
                      {samplePrice50Rooms.toLocaleString('vi-VN')}đ
                    </div>
                    <p className="text-xs text-muted-foreground">
                      50 phòng × {pricePerDay.toLocaleString('vi-VN')}đ × {minDays} ngày
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="display_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thứ tự hiển thị</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>Số nhỏ hơn hiển thị trước</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Kích hoạt</FormLabel>
                          <FormDescription>
                            Cho phép đăng ký mới
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Nhập -1 để không giới hạn
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="max_hotels"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số khách sạn tối đa</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={-1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_users"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số người dùng tối đa</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={-1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_storage_gb"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dung lượng (GB)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step="0.1"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="features.advanced_reporting"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Báo cáo nâng cao</FormLabel>
                          <FormDescription>
                            Truy cập phân tích chi tiết và báo cáo tùy chỉnh
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="features.api_access"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Truy cập API</FormLabel>
                          <FormDescription>
                            RESTful API để tích hợp hệ thống
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="features.priority_support"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Hỗ trợ ưu tiên</FormLabel>
                          <FormDescription>
                            Hỗ trợ khách hàng ưu tiên 24/7
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="features.custom_branding"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Thương hiệu riêng</FormLabel>
                          <FormDescription>
                            Tùy chỉnh logo và màu sắc
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="features.sso"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Đăng nhập một lần (SSO)</FormLabel>
                          <FormDescription>
                            Tích hợp SAML 2.0 / OAuth
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="features.audit_logs"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Nhật ký hoạt động</FormLabel>
                          <FormDescription>
                            Theo dõi hoạt động và tuân thủ
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                }}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={createPlan.isPending}>
                {createPlan.isPending ? 'Đang tạo...' : 'Tạo gói'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}