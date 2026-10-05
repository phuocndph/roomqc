import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, CheckCircle, Loader2, AlertCircle, QrCode, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { formatVNCurrency } from '@/lib/pricing';
import { getBankName } from '@/lib/vietnam-banks';
import { motion, AnimatePresence } from 'framer-motion';
import { usePaymentById } from '@/hooks/useBookingPayments';
import { useBankPaymentSettings } from '@/hooks/useBankPaymentSettings';
import ReactConfetti from 'react-confetti';
import { getPublicBaseUrl } from '@/utils/getPublicUrl';
import { supabase } from '@/integrations/supabase/client';
import { navigateBack } from '@/lib/navigation';

export default function PaymentQRPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();

  // Session check state
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  // Check if on Auth Bridge domain BEFORE any conditional logic
  const { isOnAuthBridge, targetUrl } = useMemo(() => {
    const currentOrigin = window.location.origin;
    const publicBaseUrl = getPublicBaseUrl();
    const isOnAuthBridge = publicBaseUrl !== currentOrigin;
    const targetUrl = paymentId ? `${publicBaseUrl}/payment-qr/${paymentId}` : '';
    return { isOnAuthBridge, targetUrl, publicBaseUrl };
  }, [paymentId]);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [autoOpenAttempted, setAutoOpenAttempted] = useState(false);

  // Check session on mount to determine if PWA is logged in
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setHasSession(!!data.session);
        
      } catch {
        setHasSession(false);
      } finally {
        setSessionChecked(true);
      }
    };
    checkSession();
  }, []);

  // Decision logic:
  // - If NOT on Auth Bridge → always fetch (normal flow)
  // - If on Auth Bridge + has session → fetch (PWA is open and logged in)
  // - If on Auth Bridge + no session → redirect to browser (fresh open)
  const shouldFetchData = !isOnAuthBridge || (isOnAuthBridge && hasSession);
  const shouldShowRedirectUI = isOnAuthBridge && sessionChecked && !hasSession;

  // Fetch data only when appropriate
  const { data: payment, isLoading, error } = usePaymentById(
    shouldFetchData && sessionChecked ? paymentId : undefined
  );
  
  // Get hotelId from payment metadata
  const paymentHotelId = payment?.hotel_id;
  
  const { data: bankSettings, isLoading: bankLoading } = useBankPaymentSettings(paymentHotelId);

  // Reset autoOpenAttempted when paymentId changes (for in-app navigation)
  useEffect(() => {
    setAutoOpenAttempted(false);
  }, [paymentId]);

  // Auto-open Safari only when showing redirect UI
  useEffect(() => {
    if (shouldShowRedirectUI && paymentId && targetUrl && !autoOpenAttempted) {
      setAutoOpenAttempted(true);
      // Small delay to ensure page loads first
      const timer = setTimeout(() => {
        
        window.open(targetUrl, '_blank');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowRedirectUI, paymentId, targetUrl, autoOpenAttempted]);

  // Handle window resize for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show confetti when payment is completed
  useEffect(() => {
    if (payment?.payment_status === 'completed') {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [payment?.payment_status]);

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

  // Show loading while checking session
  if (!sessionChecked) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Đang kiểm tra...</p>
      </div>
    );
  }

  // Show Auth Bridge UI only when: on Auth Bridge domain + no session (fresh open)
  if (shouldShowRedirectUI && paymentId) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-primary/20 via-primary/10 to-background flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-background/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center border border-border/50"
        >
          {/* Animated QR Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.1 }}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <QrCode className="h-10 w-10 text-primary" />
            </motion.div>
          </motion.div>

          <h2 className="text-xl font-bold mb-2">Xem mã QR thanh toán</h2>
          
          {/* Auto-open indicator */}
          {!autoOpenAttempted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang mở trình duyệt...</span>
            </motion.div>
          )}

          <p className="text-muted-foreground mb-6">
            Nhấn nút bên dưới để mở trang thanh toán
          </p>

          <Button 
            size="lg" 
            className="w-full h-12 text-base shadow-lg hover:shadow-xl transition-all"
            onClick={() => {
              
              window.open(targetUrl, '_blank');
            }}
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Mở trong trình duyệt
          </Button>

          <Button 
            variant="ghost" 
            className="mt-4 w-full"
            onClick={() => navigateBack(navigate, '/settings/subscription')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
        </motion.div>
      </div>
    );
  }

  // Loading: wait for payment AND bank settings (only when payment has loaded with hotel_id)
  const isBankSettingsLoading = payment && paymentHotelId && bankLoading;
  
  if (isLoading || isBankSettingsLoading) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Đang tải thông tin thanh toán...</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Không tìm thấy thông tin thanh toán</h2>
        <p className="text-muted-foreground text-center mb-6">
          Mã thanh toán không tồn tại hoặc đã bị xóa
        </p>
        <Button onClick={() => navigateBack(navigate, '/settings/subscription')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại
        </Button>
      </div>
    );
  }

  if (!bankSettings) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Chưa cấu hình ngân hàng</h2>
        <p className="text-muted-foreground text-center mb-6">
          Vui lòng cấu hình tài khoản ngân hàng trong Cài đặt → Thanh toán
        </p>
        <Button onClick={() => navigateBack(navigate, '/settings/subscription')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại
        </Button>
      </div>
    );
  }

  const isCompleted = payment.payment_status === 'completed';
  const qrCodeUrl = `https://qr.sepay.vn/img?acc=${bankSettings.account_number}&bank=${bankSettings.bank_code}&amount=${payment.amount}&des=${encodeURIComponent(payment.transaction_reference || '')}&template=compact`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background flex flex-col"
      >
        {/* Confetti for completed payment */}
        {showConfetti && (
          <ReactConfetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={200}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/settings/subscription')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="font-semibold text-lg">
                Thanh toán phòng {String((payment.metadata as Record<string, unknown>)?.room_number || '')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {String((payment.metadata as Record<string, unknown>)?.guest_name || '')}
              </p>
            </div>
          </div>
          
          {/* Status Badge */}
          {isCompleted && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700"
            >
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Đã thanh toán</span>
            </motion.div>
          )}
        </div>

        {/* QR Code - Centered and Large */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {isCompleted ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center"
            >
              <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-700 mb-2">Thanh toán thành công!</h3>
              <p className="text-muted-foreground">
                Đã nhận {formatVNCurrency(payment.amount)}
              </p>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="bg-background p-4 rounded-2xl shadow-xl border-2 border-primary/10"
              >
                <img
                  src={qrCodeUrl}
                  alt="QR Code thanh toán"
                  className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] object-contain"
                />
              </motion.div>

              {/* Amount - Prominent Display */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-6 text-center"
              >
                <p className="text-sm text-muted-foreground mb-1">Số tiền thanh toán</p>
                <p className="text-3xl font-bold text-primary">
                  {formatVNCurrency(payment.amount)}
                </p>
              </motion.div>
            </>
          )}
        </div>

        {/* Payment Info Footer */}
        {!isCompleted && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="p-4 bg-muted/50 space-y-3"
          >
            {/* Bank Info */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Ngân hàng</span>
              <span className="font-medium">{getBankName(bankSettings.bank_code)}</span>
            </div>

            {/* Account Number */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Số tài khoản</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{bankSettings.account_number}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  type="button"
                  onClick={() => copyToClipboard(bankSettings.account_number, 'account')}
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
              <span className="font-medium">{bankSettings.account_holder}</span>
            </div>

            {/* Payment Content */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Nội dung CK</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-primary">
                  {payment.transaction_reference}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  type="button"
                  onClick={() => copyToClipboard(payment.transaction_reference || '', 'content')}
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
        )}

        {/* Instructions */}
        {!isCompleted && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300 text-center">
              Quét mã QR bằng ứng dụng ngân hàng để thanh toán
            </p>
          </div>
        )}

        {/* Back button when completed */}
        {isCompleted && (
          <div className="p-4 border-t">
            <Button className="w-full" onClick={() => navigateBack(navigate, '/settings/subscription')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
