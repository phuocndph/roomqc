import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useTenantSubscription } from '@/hooks/useSubscription';
import { useRoomSubscriptionLimit } from '@/hooks/useRoomSubscriptionLimit';
import { useGracePeriod } from '@/hooks/useGracePeriod';
import {
  Package,
  Calendar,
  Clock,
  AlertTriangle,
  Check,
  Building2,
  Users,
  HardDrive,
  Box,
  Home,
  Plus,
} from 'lucide-react';
import {
  PRICE_PER_ROOM_DAILY,
  formatVNCurrency,
  calculateRemainingDays,
} from '@/lib/pricing';
import { useState } from 'react';
import { PlanChangeDialog } from './PlanChangeDialog';
import { AddRoomsDialog } from './AddRoomsDialog';
import { GracePeriodAlert } from './GracePeriodAlert';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Đang hoạt động', variant: 'default' },
  trial: { label: 'Dùng thử', variant: 'secondary' },
  trialing: { label: 'Dùng thử', variant: 'secondary' },
  past_due: { label: 'Quá hạn', variant: 'destructive' },
  canceled: { label: 'Đã hủy', variant: 'outline' },
  inactive: { label: 'Không hoạt động', variant: 'outline' },
  grace_period: { label: 'Còn ân hạn', variant: 'destructive' },
  suspended: { label: 'Tạm ngưng', variant: 'outline' },
};

export function SubscriptionOverview() {
  const queryClient = useQueryClient();
  const { data: subscription, isLoading, error } = useTenantSubscription();
  const { registeredRooms, actualRooms, remainingSlots, canCreateRoom } = useRoomSubscriptionLimit();
  const { isInGracePeriod, isGracePeriodExpired, graceDaysRemaining } = useGracePeriod();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addRoomsDialogOpen, setAddRoomsDialogOpen] = useState(false);

  // Realtime subscription for tenant updates (room count, subscription dates)
  useEffect(() => {
    if (!subscription?.id) return;

    const channel = supabase
      .channel(`subscription-overview-${subscription.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tenants',
          filter: `id=eq.${subscription.id}`,
        },
        () => {
          // Invalidate subscription queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['tenant-subscription'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [subscription?.id, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[150px] w-full" />
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Không thể tải thông tin đăng ký. Vui lòng thử lại.</AlertDescription>
      </Alert>
    );
  }

  const remainingDays = calculateRemainingDays(subscription.subscription_end_date);
  const status = subscription.subscription_status || 'inactive';
  
  // Override status based on grace period state
  const effectiveStatus = isGracePeriodExpired ? 'suspended' : (isInGracePeriod ? 'grace_period' : status);
  const statusInfo = statusConfig[effectiveStatus] || statusConfig.inactive;

  const isExpiringSoon = remainingDays > 0 && remainingDays <= 7;
  const isExpired = remainingDays === 0 && subscription.subscription_end_date;
  
  // Room usage percentage
  const roomUsagePercent = registeredRooms > 0 ? Math.min(100, (actualRooms / registeredRooms) * 100) : 0;
  const isNearRoomLimit = remainingSlots <= 5 && remainingSlots > 0;
  const isAtRoomLimit = !canCreateRoom;

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Gói Tiêu Chuẩn</CardTitle>
                <CardDescription>Đầy đủ tính năng, không giới hạn</CardDescription>
              </div>
            </div>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subscription Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-primary">{registeredRooms}</div>
              <div className="text-sm text-muted-foreground">Phòng đăng ký</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{formatVNCurrency(PRICE_PER_ROOM_DAILY)}</div>
              <div className="text-sm text-muted-foreground">/phòng/ngày</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className={`text-2xl font-bold ${isExpiringSoon ? 'text-yellow-600' : isExpired ? 'text-destructive' : ''}`}>
                {remainingDays}
              </div>
              <div className="text-sm text-muted-foreground">Ngày còn lại</div>
            </div>
          </div>

          {/* Room Usage Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Sử dụng phòng</span>
              <span className={`font-medium ${isAtRoomLimit ? 'text-destructive' : isNearRoomLimit ? 'text-yellow-600' : ''}`}>
                {actualRooms} / {registeredRooms} phòng
              </span>
            </div>
            <Progress 
              value={roomUsagePercent} 
              className={`h-2 ${isAtRoomLimit ? '[&>div]:bg-destructive' : isNearRoomLimit ? '[&>div]:bg-yellow-500' : ''}`}
            />
            {isAtRoomLimit && (
              <p className="text-xs text-destructive">
                Đã đạt giới hạn! Mua thêm phòng để tiếp tục tạo mới.
              </p>
            )}
            {isNearRoomLimit && (
              <p className="text-xs text-yellow-600">
                Còn {remainingSlots} slot phòng. Cân nhắc mua thêm.
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="flex flex-wrap gap-4 text-sm">
            {subscription.subscription_start_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Bắt đầu:</span>
                <span>
                  {new Date(subscription.subscription_start_date).toLocaleDateString('vi-VN')}
                </span>
              </div>
            )}
            {subscription.subscription_end_date && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Hết hạn:</span>
                <span className={isExpiringSoon || isExpired ? 'text-destructive font-medium' : ''}>
                  {new Date(subscription.subscription_end_date).toLocaleDateString('vi-VN')}
                </span>
              </div>
            )}
          </div>

          {/* Grace Period Alert */}
          {(isInGracePeriod || isGracePeriodExpired) && (
            <GracePeriodAlert onExtendClick={() => setDialogOpen(true)} />
          )}

          {/* Warnings */}
          {!isInGracePeriod && !isGracePeriodExpired && isExpiringSoon && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700">
                Gói đăng ký sẽ hết hạn trong {remainingDays} ngày. Vui lòng gia hạn để tiếp tục sử dụng.
              </AlertDescription>
            </Alert>
          )}

          {!isInGracePeriod && !isGracePeriodExpired && isExpired && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Gói đăng ký đã hết hạn. Vui lòng gia hạn ngay để tiếp tục sử dụng dịch vụ.
              </AlertDescription>
            </Alert>
          )}

          {effectiveStatus === 'past_due' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Thanh toán của bạn đã quá hạn. Vui lòng cập nhật phương thức thanh toán.
              </AlertDescription>
            </Alert>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialogOpen(true)}>
              {isInGracePeriod || isGracePeriodExpired || isExpired || effectiveStatus === 'past_due' 
                ? 'Gia hạn ngay' 
                : 'Gia hạn gói'}
            </Button>
            {!isInGracePeriod && !isGracePeriodExpired && !isExpired && remainingDays > 0 && (
              <Button variant="outline" onClick={() => setAddRoomsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Mua thêm phòng
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Features Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tính năng không giới hạn</CardTitle>
          <CardDescription>Tất cả tính năng được bao gồm trong gói đăng ký</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-green-500" />
              <span>Khách sạn: ∞</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-green-500" />
              <span>Người dùng: ∞</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Home className="h-4 w-4 text-green-500" />
              <span>Phòng: ∞</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Box className="h-4 w-4 text-green-500" />
              <span>Sản phẩm: ∞</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4 text-green-500" />
              <span>Lưu trữ: ∞</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span>Hỗ trợ 24/7</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <PlanChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialRooms={registeredRooms || 50}
        initialDuration={subscription.subscription_duration_days || 365}
      />
      
      <AddRoomsDialog
        open={addRoomsDialogOpen}
        onOpenChange={setAddRoomsDialogOpen}
      />
    </div>
  );
}
