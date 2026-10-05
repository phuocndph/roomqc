import { X, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatVNCurrency } from '@/lib/pricing';
import { getBankName } from '@/lib/vietnam-banks';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCountdown, useQRExpiry } from './QRCountdown';
import { cn } from '@/lib/utils';

interface MobilePaymentQRDisplayProps {
  open: boolean;
  onClose: () => void;
  qrData: {
    bankCode: string;
    accountNumber: string;
    accountHolder: string;
    amount: number;
    paymentContent: string;
  };
  bookingInfo: {
    guestName: string;
    roomNumber: string;
  };
}

export function MobilePaymentQRDisplay({
  open,
  onClose,
  qrData,
  bookingInfo,
}: MobilePaymentQRDisplayProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError] = useState(false);
  const { isExpired } = useQRExpiry(`${open}-${refreshKey}`);

  const qrCodeUrl = `https://qr.sepay.vn/img?acc=${qrData.accountNumber}&bank=${qrData.bankCode}&amount=${qrData.amount}&des=${encodeURIComponent(qrData.paymentContent)}&template=compact`;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Đã sao chép');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-white flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="font-semibold text-lg">Thanh toán phòng {bookingInfo.roomNumber}</h2>
              <p className="text-sm text-muted-foreground">{bookingInfo.guestName}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* QR Code - Centered and Large */}
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-white p-4 rounded-2xl shadow-xl border-2 border-primary/10"
            >
              <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px]">
                {!qrLoaded && !qrError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse rounded-lg">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                {qrError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 rounded-lg">
                    <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                    <p className="text-sm text-center text-muted-foreground">Không tải được QR<br/>Kiểm tra kết nối mạng</p>
                  </div>
                )}
                <img
                  src={qrCodeUrl}
                  alt="QR Code thanh toán"
                  className={cn(
                    'w-full h-full object-contain transition-all',
                    isExpired && 'opacity-20 blur-sm',
                    (!qrLoaded || qrError) && 'opacity-0',
                  )}
                  onLoad={() => setQrLoaded(true)}
                  onError={() => setQrError(true)}
                />
              </div>
            </motion.div>

            {/* Countdown / Expiry */}
            <div className="mt-4">
              <QRCountdown
                resetKey={`${open}-${refreshKey}`}
                onRefresh={() => setRefreshKey((k) => k + 1)}
              />
            </div>

            {/* Amount - Prominent Display */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-6 text-center"
            >
              <p className="text-sm text-muted-foreground mb-1">Số tiền thanh toán</p>
              <p className="text-3xl font-bold text-primary">
                {formatVNCurrency(qrData.amount)}
              </p>
            </motion.div>
          </div>

          {/* Payment Info Footer */}
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="p-4 bg-muted/50 space-y-3"
          >
            {/* Bank Info */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Ngân hàng</span>
              <span className="font-medium">{getBankName(qrData.bankCode)}</span>
            </div>

            {/* Account Number */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Số tài khoản</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{qrData.accountNumber}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  type="button"
                  onClick={() => copyToClipboard(qrData.accountNumber, 'account')}
                >
                  {copiedField === 'account' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Account Holder */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Chủ TK</span>
              <span className="font-medium">{qrData.accountHolder}</span>
            </div>

            {/* Payment Content */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Nội dung CK</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-primary">{qrData.paymentContent}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  type="button"
                  onClick={() => copyToClipboard(qrData.paymentContent, 'content')}
                >
                  {copiedField === 'content' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Instructions */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300 text-center">
              Quét mã QR bằng ứng dụng ngân hàng để thanh toán
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
