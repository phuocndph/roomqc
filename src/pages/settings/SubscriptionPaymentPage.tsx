import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdminBankPaymentSettings } from '@/hooks/useBankPaymentSettings';
import { BankQRCode } from '@/components/payment/BankQRCode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, History } from 'lucide-react';
import { formatVNCurrency } from '@/lib/pricing';
import { toast } from 'sonner';
import Confetti from 'react-confetti';
export default function SubscriptionPaymentPage() {
  const {
    invoiceId
  } = useParams<{
    invoiceId: string;
  }>();
  const navigate = useNavigate();
  const {
    data: bankSettings,
    isLoading: isLoadingBank
  } = useSuperAdminBankPaymentSettings();
  const queryClient = useQueryClient();
  const [showConfetti, setShowConfetti] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // Fetch payment transaction with invoice
  const {
    data: payment,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['payment-transaction', invoiceId],
    queryFn: async () => {
      if (!invoiceId) throw new Error('Missing invoiceId');
      const {
        data,
        error
      } = await supabase.from('payment_transactions').select(`
          *,
          invoice:invoices(*)
        `).eq('invoice_id', invoiceId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceId,
    refetchInterval: 5000 // Refetch every 5s as backup
  });

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!payment?.id) return;
    const channel = supabase.channel(`payment-status-${payment.id}`).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'payment_transactions',
      filter: `id=eq.${payment.id}`
    }, payload => {
      const newStatus = payload.new?.payment_status;
      const oldStatus = payload.old?.payment_status;

      // Check using payload.old instead of React state to ensure accurate comparison
      if (newStatus === 'completed' && oldStatus !== 'completed') {
        setJustCompleted(true);
        setShowConfetti(true);
        toast.success('🎉 Thanh toán thành công!', {
          description: 'Gói dịch vụ của bạn đã được kích hoạt.',
          duration: 5000
        });
        // Invalidate related queries
        queryClient.invalidateQueries({
          queryKey: ['tenant-subscription']
        });
        queryClient.invalidateQueries({
          queryKey: ['pending-payments']
        });
        queryClient.invalidateQueries({
          queryKey: ['pending-payments-count']
        });
        queryClient.invalidateQueries({
          queryKey: ['payment-transactions']
        });
        queryClient.invalidateQueries({
          queryKey: ['invoices']
        });
        // Hide confetti after 5 seconds
        setTimeout(() => setShowConfetti(false), 5000);
      } else if (newStatus === 'failed' && oldStatus !== 'failed') {
        toast.error('Thanh toán bị từ chối', {
          description: 'Vui lòng liên hệ hỗ trợ để được giúp đỡ.'
        });
      }

      // Always refetch to update UI
      refetch();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [payment?.id, refetch, queryClient]);
  const handleBack = () => {
    navigate('/settings/subscription?tab=pending');
  };
  const handleViewHistory = () => {
    navigate('/settings/subscription');
    // Small delay to ensure navigation, then switch tab
    setTimeout(() => {
      const historyTab = document.querySelector('[value="history"]') as HTMLElement;
      if (historyTab) historyTab.click();
    }, 100);
  };
  if (isLoading || isLoadingBank) {
    return <div className="container mx-auto py-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Đang tải thông tin thanh toán...</p>
        </div>
      </div>;
  }
  if (error || !payment) {
    return <div className="container mx-auto py-6">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Không tìm thấy đơn hàng
            </CardTitle>
            <CardDescription>
              Đơn hàng không tồn tại hoặc bạn không có quyền truy cập.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBack} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại quản lý đăng ký
            </Button>
          </CardContent>
        </Card>
      </div>;
  }
  const paymentStatus = payment.payment_status as string;
  const paymentContent = payment.transaction_reference || '';
  const amount = payment.amount || 0;
  const invoice = payment.invoice as Record<string, unknown> | null;

  // Success state
  if (paymentStatus === 'completed') {
    return <div className="container mx-auto py-6">
        {showConfetti && <Confetti recycle={false} numberOfPieces={200} />}
        <Card className={`max-w-lg mx-auto transition-all duration-500 ${justCompleted ? 'animate-in zoom-in-95 fade-in' : ''}`}>
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4 animate-in zoom-in-50 duration-300">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Thanh toán thành công!</CardTitle>
            <CardDescription className="text-base">
              Cảm ơn bạn đã thanh toán. Gói dịch vụ đã được kích hoạt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Số tiền thanh toán</span>
                <span className="font-bold text-lg text-primary">{formatVNCurrency(amount)}</span>
              </div>
              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mã thanh toán</span>
                  <span className="font-mono font-medium">{paymentContent}</span>
                </div>
                {payment.gateway_transaction_id && <div className="flex justify-between">
                    <span className="text-muted-foreground">Mã giao dịch NH</span>
                    <span className="font-mono text-xs">{payment.gateway_transaction_id}</span>
                  </div>}
                {payment.payment_date && <div className="flex justify-between">
                    <span className="text-muted-foreground">Xác nhận lúc</span>
                    <span>{new Date(payment.payment_date).toLocaleString('vi-VN')}</span>
                  </div>}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={handleBack} className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Quay lại quản lý đăng ký
              </Button>
              <Button variant="outline" onClick={handleViewHistory} className="w-full">
                <History className="h-4 w-4 mr-2" />
                Xem lịch sử giao dịch
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>;
  }

  // Failed state
  if (paymentStatus === 'failed') {
    return <div className="container mx-auto py-6">
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle className="text-destructive">Thanh toán bị từ chối</CardTitle>
            <CardDescription>
              Giao dịch của bạn không thể hoàn tất. Vui lòng liên hệ hỗ trợ nếu cần giúp đỡ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {payment.notes && <Alert variant="destructive">
                <AlertDescription>{payment.notes}</AlertDescription>
              </Alert>}
            <Button onClick={handleBack} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại quản lý đăng ký
            </Button>
          </CardContent>
        </Card>
      </div>;
  }

  // Pending state - show QR Code
  if (!bankSettings) {
    return <div className="container mx-auto py-6">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Không tìm thấy thông tin ngân hàng
            </CardTitle>
            <CardDescription>
              Cấu hình thanh toán ngân hàng chưa được thiết lập.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBack} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại quản lý đăng ký
            </Button>
          </CardContent>
        </Card>
      </div>;
  }
  return <div className="container mx-auto py-6 max-w-lg">
      <div className="mb-6">
        <Button variant="ghost" onClick={handleBack} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại
        </Button>
        <h1 className="text-2xl font-bold">Thanh toán đơn hàng</h1>
        <p className="text-muted-foreground">
          {invoice?.notes as string || 'Quét mã QR để thanh toán'}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-amber-600">
            <Clock className="h-5 w-5 animate-pulse" />
            <CardTitle className="text-base">Đang chờ thanh toán</CardTitle>
          </div>
          <CardDescription>
            Vui lòng chuyển khoản theo thông tin bên dưới
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BankQRCode bankCode={bankSettings.bank_code} bankName={bankSettings.bank_name} accountNumber={bankSettings.account_number} accountHolder={bankSettings.account_holder} amount={amount} paymentContent={paymentContent} qrTemplate={bankSettings.qr_template} />

          
        </CardContent>
      </Card>
    </div>;
}
