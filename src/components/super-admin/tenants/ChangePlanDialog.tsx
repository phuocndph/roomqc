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
  const [reason, setReason] = useState('');
  const [actualRoomCount, setActualRoomCount] = useState<number | null>(null);
  const [roomCountError, setRoomCountError] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch actual room count for tenant
  useEffect(() => {
    if (!tenant?.id || !open) return;

    let cancelled = false;
    setActualRoomCount(null);
    setRoomCountError(false);
    const fetchRoomCount = async () => {
      try {
        const { count, error } = await supabase.from('rooms')
          .select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
        if (error || count === null) throw error || new Error('Room count unavailable');
        if (!cancelled) setActualRoomCount(count);
      } catch {
        if (!cancelled) setRoomCountError(true);
      }
    };
    void fetchRoomCount();
    
    setReason('');
    // Set initial values from tenant
    setRooms(tenant.registered_rooms || 50);
    setSelectedDuration(tenant.subscription_duration_days || 365);
    return () => { cancelled = true; };
  }, [tenant?.id, tenant?.registered_rooms, tenant?.subscription_duration_days, open]);

  const pricing = useMemo(
    () => calculateSubscriptionPrice(rooms, selectedDuration),
    [rooms, selectedDuration]
  );

  const endDate = calculateEndDate(new Date(), selectedDuration);

  const handleChangePlan = async () => {
    if (!tenant || isUpdating || actualRoomCount === null || reason.trim().length < 5) return;

    setIsUpdating(true);
    try {
      const { data, error } = await supabase.rpc('admin_manage_tenant', {
        p_tenant_id: tenant.id,
        p_action: 'change_plan',
        p_reason: reason.trim(),
        p_rooms: rooms,
        p_duration_days: selectedDuration,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== tenant.id) {
        throw new Error('Máy chủ chưa xác nhận thay đổi. Vui lòng tải lại trước khi thử lại.');
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
    <Dialog open={open} onOpenChange={(value) => { if (!isUpdating) onOpenChange(value); }}>
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

          <div className="space-y-2">
            <Label htmlFor="sa-plan-reason">Lý do điều chỉnh (bắt buộc)</Label>
            <Input id="sa-plan-reason" value={reason} maxLength={1000}
              onChange={(event) => setReason(event.target.value)} disabled={isUpdating} />
            <p className="text-xs text-muted-foreground">
              Đây là cấp gói thủ công, không xác nhận đã thu tiền. Thay đổi được ghi nhật ký.
            </p>
          </div>
          {roomCountError && <Alert variant="destructive"><AlertDescription>
            Không tải được số phòng thực tế. Hãy đóng và mở lại để thử lại; chưa thể điều chỉnh gói.
          </AlertDescription></Alert>}
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
          <Button variant="outline" disabled={isUpdating} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleChangePlan} disabled={isUpdating || actualRoomCount === null || reason.trim().length < 5 || (actualRoomCount !== null && rooms < actualRoomCount)}>
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cập nhật đăng ký
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
