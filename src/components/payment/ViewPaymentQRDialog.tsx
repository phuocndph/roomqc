import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BankQRCode } from './BankQRCode';
import { QRCountdown, useQRExpiry } from './QRCountdown';
import { useBankPaymentSettings } from '@/hooks/useBankPaymentSettings';
import { Loader2, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatVNCurrency } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { PendingPayment } from '@/hooks/usePendingPayments';

interface ViewPaymentQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PendingPayment | null;
  hotelId?: string;
}

export function ViewPaymentQRDialog({
  open,
  onOpenChange,
  payment,
  hotelId,
}: ViewPaymentQRDialogProps) {
  const { data: bankSettings, isLoading: isLoadingSettings } = useBankPaymentSettings(hotelId);
  const [refreshKey, setRefreshKey] = useState(0);
  const { isExpired } = useQRExpiry(`${open}-${payment?.id ?? ''}-${refreshKey}`);

  if (!payment) return null;

  const isPending = payment.payment_status === 'pending';
  const isCompleted = payment.payment_status === 'completed';
  const isFailed = payment.payment_status === 'failed';

  const getStatusBadge = () => {
    if (isPending) {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <Clock className="h-3 w-3 mr-1" /> Chờ xác nhận
        </Badge>
      );
    }
    if (isCompleted) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" /> Đã thanh toán
        </Badge>
      );
    }
    if (isFailed) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <XCircle className="h-3 w-3 mr-1" /> Từ chối
        </Badge>
      );
    }
    return <Badge variant="secondary">{payment.payment_status}</Badge>;
  };

  if (isLoadingSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!bankSettings && isPending) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chi tiết thanh toán</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
            <p className="text-muted-foreground">
              Thông tin thanh toán không khả dụng.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Chi tiết thanh toán
            {getStatusBadge()}
          </DialogTitle>
          <DialogDescription>
            Mã đơn hàng: {payment.invoice?.invoice_number || payment.transaction_reference}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Info Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số tiền</span>
              <span className="font-bold text-primary">{formatVNCurrency(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nội dung CK</span>
              <span className="font-mono font-semibold">{payment.transaction_reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ngày tạo</span>
              <span>{new Date(payment.created_at).toLocaleString('vi-VN')}</span>
            </div>
            {payment.invoice?.notes && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mô tả</span>
                <span className="text-right max-w-[200px]">{payment.invoice.notes}</span>
              </div>
            )}
          </div>

          {/* Show QR if pending and bank settings available */}
          {isPending && bankSettings && (
            <>
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <Clock className="h-5 w-5 text-amber-500" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  Đang chờ xác nhận. Vui lòng chuyển khoản nếu bạn chưa thực hiện.
                </span>
              </div>

              <div className={cn('transition-all', isExpired && 'opacity-30 blur-sm pointer-events-none')}>
                <BankQRCode
                  bankCode={bankSettings.bank_code}
                  bankName={bankSettings.bank_name}
                  accountNumber={bankSettings.account_number}
                  accountHolder={bankSettings.account_holder}
                  amount={payment.amount}
                  paymentContent={payment.transaction_reference || ''}
                  qrTemplate={bankSettings.qr_template}
                />
              </div>

              <QRCountdown
                resetKey={`${open}-${payment.id}-${refreshKey}`}
                onRefresh={() => setRefreshKey((k) => k + 1)}
              />
            </>
          )}

          {/* Completed status */}
          {isCompleted && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div className="text-sm text-green-700 dark:text-green-300">
                <p className="font-medium">Thanh toán đã được xác nhận!</p>
                {payment.payment_date && (
                  <p>Ngày thanh toán: {new Date(payment.payment_date).toLocaleString('vi-VN')}</p>
                )}
              </div>
            </div>
          )}

          {/* Failed status */}
          {isFailed && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-300">
                Thanh toán đã bị từ chối. Vui lòng liên hệ quản trị viên để biết thêm chi tiết.
              </span>
            </div>
          )}

          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
