import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Clock, CheckCircle, XCircle, QrCode, RefreshCw, CreditCard, X } from 'lucide-react';
import { formatVNCurrency } from '@/lib/pricing';
import { usePendingPayments, type PendingPayment } from '@/hooks/usePendingPayments';
import { ViewPaymentQRDialog } from '@/components/payment/ViewPaymentQRDialog';
import { PaymentSuccessDialog } from './PaymentSuccessDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function PendingPayments() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: payments, isLoading, refetch, isRefetching } = usePendingPayments();
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [successPayment, setSuccessPayment] = useState<PendingPayment | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [cancelPayment, setCancelPayment] = useState<PendingPayment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const pendingPayments = payments?.filter(p => p.payment_status === 'pending') || [];

  // Realtime subscription for payment status changes
  useEffect(() => {
    const channel = supabase
      .channel('pending-payments-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_transactions',
        },
        (payload) => {
          const newStatus = payload.new?.payment_status;
          const oldStatus = payload.old?.payment_status;
          
          if (oldStatus === 'pending' && newStatus === 'completed') {
            // Set the completed payment for success dialog
            const completedPayment = payload.new as unknown as PendingPayment;
            setSuccessPayment({
              ...completedPayment,
              invoice: null, // Will be refetched
            });
            setShowSuccessDialog(true);
            toast.success('🎉 Thanh toán đã được xác nhận!', {
              description: 'Gói dịch vụ đã được kích hoạt.',
            });
            
            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: ['tenant-subscription'] });
            queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
            queryClient.invalidateQueries({ queryKey: ['pending-payments-count'] });
            queryClient.invalidateQueries({ queryKey: ['payment-transactions'] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          } else if (oldStatus === 'pending' && newStatus === 'failed') {
            toast.error('Một giao dịch đã bị từ chối');
            queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
            queryClient.invalidateQueries({ queryKey: ['pending-payments-count'] });
          }
          
          refetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payment_transactions',
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, queryClient]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            <Clock className="h-3 w-3 mr-1" /> Chờ xác nhận
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
            <CheckCircle className="h-3 w-3 mr-1" /> Đã thanh toán
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
            <XCircle className="h-3 w-3 mr-1" /> Từ chối
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleViewQR = (payment: PendingPayment) => {
    setSelectedPayment(payment);
    setIsDialogOpen(true);
  };

  const handleGoToPayment = (payment: PendingPayment) => {
    if (payment.invoice_id) {
      navigate(`/settings/subscription/pay/${payment.invoice_id}`);
    }
  };

  const handleCancelPayment = async () => {
    if (!cancelPayment) return;
    
    setIsCancelling(true);
    try {
      const { error } = await supabase.rpc('cancel_subscription_payment', {
        p_payment_id: cancelPayment.id,
      });
      if (error) throw error;

      toast.success('Đã hủy đơn hàng');
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['pending-payments-count'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error) {
      console.error('Cancel payment error:', error);
      toast.error('Không thể hủy đơn hàng');
    } finally {
      setIsCancelling(false);
      setCancelPayment(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Pending Payments */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Đang chờ thanh toán
                  {pendingPayments.length > 0 && (
                    <Badge variant="destructive" className="animate-pulse">
                      {pendingPayments.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Các giao dịch đang chờ xác nhận (tự động cập nhật)
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pendingPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Không có giao dịch nào đang chờ xác nhận</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã đơn hàng</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Nội dung CK</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Hành động</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.map((payment) => (
                      <TableRow key={payment.id} className="transition-colors hover:bg-muted/50">
                        <TableCell className="font-mono text-sm">
                          {payment.invoice?.invoice_number || payment.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-semibold text-primary">
                          {formatVNCurrency(payment.amount)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {payment.transaction_reference}
                        </TableCell>
                        <TableCell>
                          {new Date(payment.created_at).toLocaleString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.payment_status)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {payment.invoice_id && (
                              <Button
                                size="sm"
                                onClick={() => handleGoToPayment(payment)}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Thanh toán
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewQR(payment)}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setCancelPayment(payment)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <ViewPaymentQRDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        payment={selectedPayment}
      />

      <PaymentSuccessDialog
        open={showSuccessDialog}
        onOpenChange={setShowSuccessDialog}
        payment={successPayment}
        showConfetti={true}
      />

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelPayment} onOpenChange={(open) => !open && setCancelPayment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy đơn hàng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn hủy đơn hàng này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelPayment}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? 'Đang hủy...' : 'Hủy đơn hàng'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
