import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, History, X } from 'lucide-react';
import { formatVNCurrency } from '@/lib/pricing';
import Confetti from 'react-confetti';
import { useNavigate } from 'react-router-dom';

interface PaymentSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    amount: number;
    transaction_reference: string;
    gateway_transaction_id?: string | null;
    payment_date?: string | null;
  } | null;
  showConfetti?: boolean;
}

export function PaymentSuccessDialog({
  open,
  onOpenChange,
  payment,
  showConfetti = true,
}: PaymentSuccessDialogProps) {
  const navigate = useNavigate();

  const handleViewHistory = () => {
    onOpenChange(false);
    navigate('/settings/subscription');
    setTimeout(() => {
      const historyTab = document.querySelector('[value="history"]') as HTMLElement;
      if (historyTab) historyTab.click();
    }, 100);
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {showConfetti && open && (
          <Confetti
            recycle={false}
            numberOfPieces={150}
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 100 }}
          />
        )}
        <DialogHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4 animate-in zoom-in-50 duration-300">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <DialogTitle className="text-2xl text-green-600 text-center">
            Thanh toán thành công!
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Cảm ơn bạn đã thanh toán. Gói dịch vụ đã được kích hoạt.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Số tiền thanh toán</span>
            <span className="font-bold text-lg text-primary">
              {formatVNCurrency(payment.amount)}
            </span>
          </div>
          <div className="border-t pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mã thanh toán</span>
              <span className="font-mono font-medium">{payment.transaction_reference}</span>
            </div>
            {payment.gateway_transaction_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mã giao dịch NH</span>
                <span className="font-mono text-xs">{payment.gateway_transaction_id}</span>
              </div>
            )}
            {payment.payment_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Xác nhận lúc</span>
                <span>{new Date(payment.payment_date).toLocaleString('vi-VN')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <Button onClick={handleViewHistory} className="w-full">
            <History className="h-4 w-4 mr-2" />
            Xem lịch sử giao dịch
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            <X className="h-4 w-4 mr-2" />
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
