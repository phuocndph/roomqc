import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, Building2 } from 'lucide-react';
import {
  PRICE_PER_ROOM_DAILY,
  DURATION_OPTIONS,
  calculateSubscriptionPrice,
  formatVNCurrency,
  calculateEndDate,
} from '@/lib/pricing';
import { getFriendlyError } from '@/lib/errorMessage'

interface ChangePlanDialogProps {
  tenant: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePlanDialog({
  tenant,
  open,
  onOpenChange,
}: ChangePlanDialogProps) {
  const [rooms, setRooms] = useState(50);
  const [selectedDuration, setSelectedDuration] = useState(365);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actualRoomCount, setActualRoomCount] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch actual room count for tenant
  useEffect(() => {
    if (!tenant?.id || !open) return;

    const fetchRoomCount = async () => {
      const { count } = await supabase
        .from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', tenant.id);
      
      // This won't work directly, we need to count rooms via hotels
      const { data: hotels } = await supabase
        .from('hotels')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active');

      if (hotels && hotels.length > 0) {
        const hotelIds = hotels.map((h) => h.id);
        const { count: roomCount } = await supabase
          .from('rooms')
          .select('id', { count: 'exact', head: true })
          .in('hotel_id', hotelIds);
        
        setActualRoomCount(roomCount || 0);
      } else {
        setActualRoomCount(0);
      }
    };

    fetchRoomCount();
    
    // Set initial values from tenant
    setRooms(tenant.registered_rooms || 50);
    setSelectedDuration(tenant.subscription_duration_days || 365);
  }, [tenant?.id, tenant?.registered_rooms, tenant?.subscription_duration_days, open]);

  const pricing = useMemo(
    () => calculateSubscriptionPrice(rooms, selectedDuration),
    [rooms, selectedDuration]
  );

  const endDate = calculateEndDate(new Date(), selectedDuration);

  const handleChangePlan = async () => {
    if (!tenant) return;

    setIsUpdating(true);
    try {
      const now = new Date();

      // Get standard plan ID
      const { data: standardPlan } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('code', 'standard')
        .eq('is_active', true)
        .single();

      if (!standardPlan) {
        throw new Error('Không tìm thấy gói tiêu chuẩn');
      }

      // Update tenant subscription
      const { error } = await supabase
        .from('tenants')
        .update({
          subscription_plan_id: standardPlan.id,
          registered_rooms: rooms,
          subscription_duration_days: selectedDuration,
          subscription_start_date: now.toISOString().split('T')[0],
          subscription_end_date: endDate.toISOString().split('T')[0],
          subscription_current_period_start: now.toISOString(),
          subscription_current_period_end: endDate.toISOString(),
          subscription_status: 'active',
          updated_at: now.toISOString(),
        })
        .eq('id', tenant.id);

      if (error) throw error;

      // Bỏ chế độ chỉ-đọc nếu trước đó đã bị bật do hết hạn
      const { error: clearRoErr } = await supabase.rpc('clear_tenant_read_only', {
        p_tenant_id: tenant.id,
        p_reason: 'super_admin_manual_extend',
      });
      if (clearRoErr) {
        console.warn('clear_tenant_read_only failed:', clearRoErr.message);
      }

      // Reset grace period vì subscription đã được gia hạn
      await supabase
        .from('tenants')
        .update({ grace_period_ends_at: null })
        .eq('id', tenant.id);

      // Recalculate tenant usage
      const { error: usageError } = await supabase.rpc('update_tenant_usage', {
        p_tenant_id: tenant.id,
      });

      if (usageError) {
        console.error('Failed to update tenant usage:', usageError);
      }

      toast({
        title: 'Cập nhật thành công',
        description: `Đã cập nhật gói cho ${tenant.name}: ${rooms} phòng, ${selectedDuration} ngày`,
      });

      queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-usage', tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-subscription', tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['check-quota', tenant.id] });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!tenant) return null;

  const currentRooms = tenant.registered_rooms || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Điều chỉnh đăng ký</DialogTitle>
          <DialogDescription>
            Cập nhật gói dịch vụ cho <strong>{tenant.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current Info */}
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertDescription className="space-y-1">
              <div>
                Đăng ký hiện tại: <strong>{currentRooms} phòng</strong>
              </div>
              {actualRoomCount !== null && (
                <div className="text-muted-foreground">
                  Số phòng thực tế: <strong>{actualRoomCount} phòng</strong>
                </div>
              )}
              {tenant.subscription_end_date && (
                <div>
                  Hết hạn:{' '}
                  <strong>
                    {new Date(tenant.subscription_end_date).toLocaleDateString('vi-VN')}
                  </strong>
                </div>
              )}
            </AlertDescription>
          </Alert>

          {/* Room Input */}
          <div className="space-y-2">
            <Label htmlFor="sa-rooms">Số phòng đăng ký</Label>
            <div className="flex items-center gap-3">
              <Input
                id="sa-rooms"
                type="number"
                min={1}
                value={rooms}
                onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-32"
              />
              <span className="text-muted-foreground">phòng</span>
              {actualRoomCount !== null && actualRoomCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRooms(actualRoomCount)}
                >
                  Dùng thực tế ({actualRoomCount})
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Giá: {formatVNCurrency(PRICE_PER_ROOM_DAILY)}/phòng/ngày
            </p>
          </div>

          {/* Duration Selection */}
          <div className="space-y-3">
            <Label>Thời hạn đăng ký</Label>
            <RadioGroup
              value={selectedDuration.toString()}
              onValueChange={(v) => setSelectedDuration(parseInt(v))}
              className="grid grid-cols-2 gap-2"
            >
              {DURATION_OPTIONS.map((option) => (
                <div key={option.days} className="relative">
                  <RadioGroupItem
                    value={option.days.toString()}
                    id={`sa-duration-${option.days}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`sa-duration-${option.days}`}
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-colors"
                  >
                    <span className="font-medium">{option.label}</span>
                    {option.discount > 0 && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        -{option.discount}%
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <Separator />

          {/* Price Summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Giá gốc</span>
              <span>{formatVNCurrency(pricing.basePrice)}</span>
            </div>
            {pricing.discountPercent > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Giảm giá ({pricing.discountPercent}%)</span>
                <span>- {formatVNCurrency(pricing.discount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Tổng cộng</span>
              <span className="text-primary">{formatVNCurrency(pricing.finalPrice)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Hết hạn vào</span>
              <span>{endDate.toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleChangePlan} disabled={isUpdating}>
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cập nhật đăng ký
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
