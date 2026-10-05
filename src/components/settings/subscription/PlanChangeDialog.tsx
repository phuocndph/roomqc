import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTenantSubscription, useUpdateTenantSubscription } from '@/hooks/useSubscription';
import { useSuperAdminBankPaymentSettings } from '@/hooks/useBankPaymentSettings';
import { useRoomSubscriptionLimit } from '@/hooks/useRoomSubscriptionLimit';
import { Input } from '@/components/ui/input';
import { Info, Loader2, Package, CreditCard, Minus, Plus, AlertTriangle } from 'lucide-react';
import {
  PRICE_PER_ROOM_DAILY,
  DURATION_OPTIONS,
  calculateSubscriptionPrice,
  formatVNCurrency,
  calculateEndDate,
} from '@/lib/pricing';
import { BankTransferPaymentDialog } from '@/components/payment/BankTransferPaymentDialog';

interface PlanChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRooms?: number;
  initialDuration?: number;
}

export function PlanChangeDialog({
  open,
  onOpenChange,
  initialRooms = 50,
  initialDuration = 365,
}: PlanChangeDialogProps) {
  const navigate = useNavigate();
  const { data: subscription } = useTenantSubscription();
  const { data: bankSettings, isLoading: isBankSettingsLoading } = useSuperAdminBankPaymentSettings();
  const { actualRooms: dbActualRooms } = useRoomSubscriptionLimit();
  const updateSubscription = useUpdateTenantSubscription();

  const [selectedDuration, setSelectedDuration] = useState(initialDuration);
  const [showBankPayment, setShowBankPayment] = useState(false);
  const [rooms, setRooms] = useState(initialRooms);

  // Current registered rooms from subscription
  const registeredRooms = subscription?.registered_rooms || initialRooms;
  
  // Minimum rooms is the actual count in database
  const minRooms = dbActualRooms || 1;

  // Sync rooms state with subscription data
  useEffect(() => {
    if (subscription?.registered_rooms) {
      setRooms(subscription.registered_rooms);
    }
  }, [subscription?.registered_rooms]);

  // Update duration when initial value changes
  useEffect(() => {
    setSelectedDuration(initialDuration);
  }, [initialDuration]);

  const pricing = useMemo(
    () => calculateSubscriptionPrice(rooms, selectedDuration),
    [rooms, selectedDuration]
  );

  const currentEndDate = subscription?.subscription_end_date 
    ? new Date(subscription.subscription_end_date) 
    : new Date();
  const newEndDate = calculateEndDate(currentEndDate, selectedDuration);

  // Validation: rooms must be >= actual rooms in database
  const isRoomsBelowMinimum = rooms < minRooms;

  const handleConfirm = async () => {
    if (isRoomsBelowMinimum) return;
    if (isBankSettingsLoading) return;

    if (bankSettings) {
      onOpenChange(false);
      setTimeout(() => setShowBankPayment(true), 100);
    } else {
      toast({ title: 'Lỗi', description: 'Chưa cấu hình thông tin thanh toán. Vui lòng liên hệ quản trị viên.', variant: 'destructive' });
    }
  };

  // Max rooms from plan
  const maxRooms = (subscription?.subscription_plan as any)?.max_rooms || 500;

  const handleRoomsChange = (value: number) => {
    // Allow setting any value >= minRooms, capped at plan maxRooms
    setRooms(Math.max(1, Math.min(maxRooms, value)));
  };

  const handlePaymentCreated = (invoiceId: string) => {
    setShowBankPayment(false);
    navigate(`/settings/subscription/pay/${invoiceId}`);
  };

  const handlePaymentDialogClose = (isOpen: boolean) => {
    setShowBankPayment(isOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gia hạn gói dịch vụ</DialogTitle>
            <DialogDescription>
              Chọn thời hạn gia hạn theo nhu cầu
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Current Info */}
            {registeredRooms > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Đăng ký hiện tại: <strong>{registeredRooms} phòng</strong>
                  {subscription?.subscription_end_date && (
                    <>
                      {' '}• Hết hạn:{' '}
                      <strong>
                        {new Date(subscription.subscription_end_date).toLocaleDateString('vi-VN')}
                      </strong>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Room Count - Adjustable */}
            <div className="space-y-2">
              <Label>Số phòng đăng ký</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => handleRoomsChange(rooms - 10)}
                  disabled={rooms <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={maxRooms}
                  value={rooms}
                  onChange={(e) => handleRoomsChange(parseInt(e.target.value) || 1)}
                  className="w-24 text-center h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => handleRoomsChange(rooms + 10)}
                  disabled={rooms >= maxRooms}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Giới hạn tối đa: {maxRooms} phòng theo gói dịch vụ
              </p>
              {rooms !== registeredRooms && !isRoomsBelowMinimum && (
                <p className="text-xs text-muted-foreground">
                  Thay đổi: {registeredRooms} → {rooms} phòng ({rooms > registeredRooms ? '+' : ''}{rooms - registeredRooms})
                </p>
              )}
              {isRoomsBelowMinimum && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Không thể giảm xuống dưới {minRooms} phòng (số phòng thực tế đang có trong hệ thống)
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Duration Selection */}
            <div className="space-y-3">
              <Label>Thời hạn gia hạn</Label>
              <RadioGroup
                value={selectedDuration.toString()}
                onValueChange={(v) => setSelectedDuration(parseInt(v))}
                className="grid grid-cols-2 gap-2"
              >
                {DURATION_OPTIONS.map((option) => (
                  <div key={option.days} className="relative">
                    <RadioGroupItem
                      value={option.days.toString()}
                      id={`dialog-duration-${option.days}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`dialog-duration-${option.days}`}
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
                <span>
                  {rooms} × {formatVNCurrency(PRICE_PER_ROOM_DAILY)} × {pricing.days} ngày ={' '}
                  {formatVNCurrency(pricing.basePrice)}
                </span>
              </div>
              {pricing.discountPercent > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Giảm giá ({pricing.discountPercent}%)</span>
                  <span>- {formatVNCurrency(pricing.discount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold text-base">
                <span>Tổng thanh toán</span>
                <span className="text-primary">{formatVNCurrency(pricing.finalPrice)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Hạn mới</span>
                <span>{newEndDate.toLocaleDateString('vi-VN')}</span>
              </div>
            </div>

            {/* Payment Method Hint */}
            {bankSettings && (
              <Alert className="border-primary/30 bg-primary/5">
                <CreditCard className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Thanh toán qua chuyển khoản ngân hàng với QR Code
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={updateSubscription.isPending || isBankSettingsLoading || isRoomsBelowMinimum}
            >
              {(updateSubscription.isPending || isBankSettingsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isBankSettingsLoading ? 'Đang tải...' : 'Tiếp tục thanh toán'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank Transfer Payment Dialog - rendered outside main dialog */}
      {showBankPayment && (
        <BankTransferPaymentDialog
          open={showBankPayment}
          onOpenChange={handlePaymentDialogClose}
          amount={pricing.finalPrice}
          description={`Gia hạn gói dịch vụ ${rooms} phòng - ${selectedDuration} ngày${rooms !== registeredRooms ? ` (thay đổi từ ${registeredRooms} phòng)` : ''}`}
          autoCreateInvoice={true}
          onPaymentCreated={handlePaymentCreated}
          metadata={{
            type: 'extend',
            rooms: rooms,
            previous_rooms: registeredRooms,
            duration_days: selectedDuration,
          }}
        />
      )}
    </>
  );
}
