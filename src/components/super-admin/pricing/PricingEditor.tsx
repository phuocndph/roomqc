import { useState, useEffect } from 'react';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpdatePlanPricing } from '@/hooks/super-admin/usePricingManagement';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Building2, Calendar, DollarSign } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const pricingSchema = z.object({
  price_per_room_daily: z.number().min(1, 'Giá phải lớn hơn 0'),
  min_subscription_days: z.number().min(1, 'Số ngày tối thiểu phải lớn hơn 0'),
  change_reason: z.string().min(10, 'Lý do phải có ít nhất 10 ký tự'),
});

type PricingFormValues = z.infer<typeof pricingSchema>;

interface PricingEditorProps {
  plan: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PricingEditor({ plan, open, onOpenChange }: PricingEditorProps) {
  const { user } = useAuth();
  const updatePricing = useUpdatePlanPricing();
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<PricingFormValues>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      price_per_room_daily: plan?.price_per_room_daily || 1000,
      min_subscription_days: plan?.min_subscription_days || 30,
      change_reason: '',
    },
  });

  // Reset form when plan changes
  useEffect(() => {
    if (plan) {
      form.reset({
        price_per_room_daily: plan.price_per_room_daily || 1000,
        min_subscription_days: plan.min_subscription_days || 30,
        change_reason: '',
      });
    }
  }, [plan, form]);

  const onSubmit = async (data: PricingFormValues) => {
    if (!plan || !user) return;

    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    // Calculate new monthly/yearly prices for compatibility
    const newMonthlyPrice = 50 * data.price_per_room_daily * 30;
    const newYearlyPrice = 50 * data.price_per_room_daily * 365 * 0.9;

    await updatePricing.mutateAsync({
      planId: plan.id,
      newMonthlyPrice,
      newYearlyPrice,
      pricePerRoomDaily: data.price_per_room_daily,
      minSubscriptionDays: data.min_subscription_days,
      changedBy: user.id,
      reason: data.change_reason,
    });

    onOpenChange(false);
    setShowConfirm(false);
    form.reset();
  };

  const currentPricePerDay = plan?.price_per_room_daily || 1000;
  const newPricePerDay = form.watch('price_per_room_daily');
  const priceChange = currentPricePerDay
    ? ((newPricePerDay - currentPricePerDay) / currentPricePerDay) * 100
    : 0;

  const minDays = form.watch('min_subscription_days');
  const samplePrice50Rooms = 50 * newPricePerDay * minDays;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa giá - {plan?.name}</DialogTitle>
          <DialogDescription>
            Cập nhật giá theo phòng cho gói đăng ký này. Thay đổi sẽ được lưu vào lịch sử giá.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Current pricing info */}
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">Giá hiện tại</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Giá/phòng/ngày</p>
                  <p className="text-lg font-bold text-foreground">
                    {(plan?.price_per_room_daily || 1000).toLocaleString('vi-VN')}đ
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Đăng ký tối thiểu</p>
                  <p className="text-lg font-bold text-foreground">
                    {plan?.min_subscription_days || 30} ngày
                  </p>
                </div>
              </div>
            </div>

            {/* New pricing form */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price_per_room_daily"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Giá mới/phòng/ngày
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
                    {priceChange !== 0 && (
                      <p className={`text-xs ${priceChange > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}% thay đổi
                      </p>
                    )}
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
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Ví dụ tính giá (50 phòng)</span>
              </div>
              <div className="text-xl font-bold text-primary">
                {samplePrice50Rooms.toLocaleString('vi-VN')}đ
              </div>
              <p className="text-xs text-muted-foreground">
                50 phòng × {newPricePerDay.toLocaleString('vi-VN')}đ × {minDays} ngày
              </p>
            </div>

            <FormField
              control={form.control}
              name="change_reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do thay đổi</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="VD: Điều chỉnh giá theo thị trường, cập nhật tính năng..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showConfirm && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Xác nhận thay đổi giá</AlertTitle>
                <AlertDescription>
                  Thay đổi này sẽ áp dụng cho tất cả đăng ký MỚI. Các đăng ký hiện tại sẽ KHÔNG bị ảnh hưởng. Nhấn Xác nhận để tiếp tục.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setShowConfirm(false);
                }}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={updatePricing.isPending}
                variant={showConfirm ? 'destructive' : 'default'}
              >
                {showConfirm ? 'Xác nhận cập nhật' : 'Cập nhật giá'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}