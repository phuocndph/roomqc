import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Plus, Calculator, Calendar, Percent, Info, CreditCard, Heart, Sparkles } from 'lucide-react';
import { useRoomSubscriptionLimit } from '@/hooks/useRoomSubscriptionLimit';
import { useUpdateTenantSubscription, useTenantSubscription } from '@/hooks/useSubscription';
import { useSuperAdminBankPaymentSettings } from '@/hooks/useBankPaymentSettings';
import { PRICE_PER_ROOM_DAILY, formatVNCurrency } from '@/lib/pricing';
import { BankTransferPaymentDialog } from '@/components/payment/BankTransferPaymentDialog';
import { supabase } from '@/integrations/supabase/client';
import { getFriendlyError } from '@/lib/errorMessage'

interface AddRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRoomsDialog({ open, onOpenChange }: AddRoomsDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [additionalRooms, setAdditionalRooms] = useState(10);
  const [showBankPayment, setShowBankPayment] = useState(false);
  const [isAddingFreeRooms, setIsAddingFreeRooms] = useState(false);
  const {
    registeredRooms,
    actualRooms,
    remainingDays,
    discountPercent,
  } = useRoomSubscriptionLimit();
  const updateSubscription = useUpdateTenantSubscription();
  const { data: subscription } = useTenantSubscription();
  const { data: bankSettings, isLoading: isBankSettingsLoading } = useSuperAdminBankPaymentSettings();

  const subscriptionStatus = (subscription as any)?.subscription_status as string | undefined;
  const isTrial = subscriptionStatus === 'trial';

  // Max rooms from plan (NULL = unlimited for trial)
  const maxRooms = (subscription?.subscription_plan as any)?.max_rooms;
  const maxAdditional = isTrial || !maxRooms ? Infinity : Math.max(0, maxRooms - registeredRooms);

  // Calculate price for additional rooms (only for paid plans)
  const pricing = (() => {
    if (isTrial || remainingDays <= 0) return null;
    
    const basePrice = additionalRooms * PRICE_PER_ROOM_DAILY * remainingDays;
    const discount = Math.round(basePrice * (discountPercent / 100));
    const finalPrice = basePrice - discount;
    
    return {
      basePrice,
      discount,
      discountPercent,
      finalPrice,
      pricePerRoom: Math.round(finalPrice / additionalRooms),
    };
  })();

  const handleTrialAddRooms = async () => {
    setIsAddingFreeRooms(true);
    try {
      const newTotal = registeredRooms + additionalRooms;
      const { error } = await supabase
        .from('tenants')
        .update({ registered_rooms: newTotal, updated_at: new Date().toISOString() })
        .eq('id', (subscription as any)?.id);

      if (error) throw error;

      // Invalidate all related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['tenant-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['actual-room-count'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-usage'] });
      queryClient.invalidateQueries({ queryKey: ['check-quota'] });

      toast({
        title: 'Thành công! 🎉',
        description: `Đã thêm ${additionalRooms} phòng miễn phí. Tổng: ${newTotal} phòng`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Lỗi', description: getFriendlyError(error), variant: 'destructive' });
    } finally {
      setIsAddingFreeRooms(false);
    }
  };

  const handleConfirm = async () => {
    if (isTrial) {
      await handleTrialAddRooms();
      return;
    }

    if (!pricing) return;
    if (isBankSettingsLoading) return;
    
    if (bankSettings) {
      onOpenChange(false);
      setTimeout(() => setShowBankPayment(true), 100);
    } else {
      toast({ title: 'Lỗi', description: 'Chưa cấu hình thông tin thanh toán. Vui lòng liên hệ quản trị viên.', variant: 'destructive' });
    }
  };

  const handlePaymentCreated = (invoiceId: string) => {
    setShowBankPayment(false);
    navigate(`/settings/subscription/pay/${invoiceId}`);
  };

  const handlePaymentDialogClose = (isOpen: boolean) => {
    setShowBankPayment(isOpen);
  };

  if (!isTrial && remainingDays <= 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Không thể mua thêm phòng</DialogTitle>
            <DialogDescription>
              Gói đăng ký của bạn đã hết hạn. Vui lòng gia hạn trước khi mua thêm phòng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {isTrial ? 'Thêm phòng miễn phí' : 'Mua thêm phòng'}
            </DialogTitle>
            <DialogDescription>
              {isTrial
                ? 'Thêm phòng để trải nghiệm đầy đủ tính năng trong chương trình dùng thử.'
                : 'Thêm phòng vào gói đăng ký hiện tại. Giá được tính theo số ngày còn lại.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Trial - Friendly message */}
            {isTrial && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <Sparkles className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 space-y-2">
                  <p className="font-medium">
                    🎉 Chương trình Hỗ trợ chuyển đổi số — Hoàn toàn MIỄN PHÍ!
                  </p>
                  <p className="text-sm">
                    Hãy thoải mái thêm phòng để trải nghiệm đầy đủ tính năng. 
                    Chúng tôi luôn đồng hành cùng bạn trong quá trình số hóa quản lý khách sạn.
                  </p>
                  <p className="text-xs flex items-center gap-1">
                    <Heart className="h-3 w-3 text-red-500" />
                    Không giới hạn số lượng phòng trong thời gian dùng thử
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Current Status */}
            <div className={`grid ${isTrial ? 'grid-cols-2' : 'grid-cols-2'} gap-4 p-4 rounded-lg bg-muted/50`}>
              <div>
                <div className="text-sm text-muted-foreground">Phòng đã đăng ký</div>
                <div className="text-xl font-semibold">{registeredRooms}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phòng thực tế</div>
                <div className="text-xl font-semibold">{actualRooms}</div>
              </div>
              {!isTrial && (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground">Ngày còn lại</div>
                    <div className="text-xl font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {remainingDays}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Chiết khấu áp dụng</div>
                    <div className="text-xl font-semibold flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      {discountPercent}%
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Discount Info - only for paid */}
            {!isTrial && discountPercent > 0 && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  Bạn được áp dụng chiết khấu {discountPercent}% theo thời hạn đăng ký gốc!
                </AlertDescription>
              </Alert>
            )}

            {/* Room Input */}
            <div className="space-y-2">
              <Label>Số phòng muốn thêm</Label>
              <Input
                type="number"
                min={1}
                max={maxAdditional === Infinity ? undefined : maxAdditional}
                value={additionalRooms}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 1);
                  setAdditionalRooms(maxAdditional === Infinity ? val : Math.min(maxAdditional, val));
                }}
              />
              <p className="text-sm text-muted-foreground">
                Sau khi thêm: {registeredRooms} + {additionalRooms} = {registeredRooms + additionalRooms} phòng
              </p>
              {!isTrial && maxRooms && (
                <p className="text-xs text-muted-foreground">
                  Giới hạn tối đa: {maxRooms} phòng theo gói dịch vụ (có thể thêm tối đa {maxAdditional} phòng)
                </p>
              )}
              {!isTrial && maxAdditional <= 0 && (
                <Alert variant="destructive" className="py-2">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Bạn đã đạt giới hạn phòng tối đa ({maxRooms}) của gói dịch vụ. Không thể thêm phòng.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Price Breakdown - only for paid plans */}
            {!isTrial && pricing && (
              <>
                <Separator />
                <div className="space-y-3 p-4 rounded-lg border">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calculator className="h-4 w-4" />
                    Chi tiết giá
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {additionalRooms} phòng × {formatVNCurrency(PRICE_PER_ROOM_DAILY)} × {remainingDays} ngày
                      </span>
                      <span>{formatVNCurrency(pricing.basePrice)}</span>
                    </div>
                    
                    {pricing.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Chiết khấu ({pricing.discountPercent}%)</span>
                        <span>-{formatVNCurrency(pricing.discount)}</span>
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div className="flex justify-between font-semibold text-base">
                      <span>Tổng thanh toán</span>
                      <span className="text-primary">{formatVNCurrency(pricing.finalPrice)}</span>
                    </div>
                    
                    <div className="text-xs text-muted-foreground text-right">
                      ≈ {formatVNCurrency(pricing.pricePerRoom)}/phòng cho {remainingDays} ngày còn lại
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Payment Method Hint - only for paid */}
            {!isTrial && bankSettings && (
              <Alert className="border-primary/30 bg-primary/5">
                <CreditCard className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Thanh toán qua chuyển khoản ngân hàng với QR Code
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            {isTrial ? (
              <Button
                onClick={handleConfirm}
                disabled={isAddingFreeRooms || additionalRooms < 1}
                className="bg-green-600 hover:bg-green-700"
              >
                {isAddingFreeRooms ? 'Đang thêm...' : `Thêm ${additionalRooms} phòng miễn phí`}
              </Button>
            ) : (
              <Button 
                onClick={handleConfirm} 
                disabled={updateSubscription.isPending || isBankSettingsLoading || additionalRooms < 1 || maxAdditional <= 0}
              >
                {isBankSettingsLoading ? 'Đang tải...' :
                  updateSubscription.isPending ? 'Đang xử lý...' : 
                  'Tiếp tục thanh toán'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank Transfer Payment Dialog - rendered outside main dialog */}
      {pricing && showBankPayment && (
        <BankTransferPaymentDialog
          open={showBankPayment}
          onOpenChange={handlePaymentDialogClose}
          amount={pricing.finalPrice}
          description={`Mua thêm ${additionalRooms} phòng (${remainingDays} ngày còn lại)`}
          autoCreateInvoice={true}
          onPaymentCreated={handlePaymentCreated}
          metadata={{
            type: 'add_rooms',
            additional_rooms: additionalRooms,
            new_total_rooms: registeredRooms + additionalRooms,
            remaining_days: remainingDays,
          }}
        />
      )}
    </>
  );
}
