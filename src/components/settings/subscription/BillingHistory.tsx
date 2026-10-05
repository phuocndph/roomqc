import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePaymentTransactions, useInvoices } from "@/hooks/useSubscription";
import { formatDate } from "date-fns";
import { vi } from "date-fns/locale";
import { FileText, History, CheckCircle, XCircle, Clock, RefreshCw, Download, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from '@/integrations/supabase/client';
import { formatVNCurrency } from '@/lib/pricing';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useUser } from '@/hooks/useUser';
import { getFriendlyError } from '@/lib/errorMessage';

export function BillingHistory() {
  const { data: transactions, isLoading: loadingTransactions, refetch: refetchTransactions } = usePaymentTransactions();
  const { data: invoices, isLoading: loadingInvoices, refetch: refetchInvoices } = useInvoices();
  const [selectedInvoice, setSelectedInvoice] = useState<typeof invoices extends (infer T)[] | null | undefined ? T : never>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { user } = useUser();

  const canSync = user?.user_level_code === 'super_admin' || user?.user_level_code === 'tenant_owner';

  const handleSyncTransactions = async () => {
    if (!canSync) return;
    
    setIsSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await supabase.functions.invoke('sync-sepay-transactions', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.error) {
        throw new Error(response.error.message || 'Sync failed');
      }

      const result = response.data;
      
      if (result.success) {
        if (result.matched > 0) {
          toast.success(`Đã đồng bộ ${result.matched} giao dịch thành công!`, {
            description: `Hóa đơn: ${result.matchedInvoices?.join(', ')}`
          });
          refetchTransactions();
          refetchInvoices();
        } else {
          toast.info('Không tìm thấy giao dịch mới để đồng bộ', {
            description: `Đã kiểm tra ${result.totalTransactions || 0} giao dịch từ SePay`
          });
        }
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Lỗi đồng bộ giao dịch', {
        description: getFriendlyError(error)
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Realtime subscription for payment updates
  useEffect(() => {
    const channel = supabase
      .channel('billing-history-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_transactions' },
        () => refetchTransactions()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        () => refetchInvoices()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchTransactions, refetchInvoices]);

  // Filter to show only completed or failed transactions (not pending - those are in "Đang chờ" tab)
  const completedTransactions = transactions?.filter(t => 
    t.payment_status === 'completed' || t.payment_status === 'failed'
  ) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Thành công
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Thất bại
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            <Clock className="h-3 w-3 mr-1" />
            Đang chờ
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getInvoiceForTransaction = (invoiceId: string | null) => {
    if (!invoiceId || !invoices) return null;
    return invoices.find(inv => inv.id === invoiceId);
  };

  if (loadingTransactions || loadingInvoices) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Lịch sử giao dịch</CardTitle>
                <CardDescription>
                  Tất cả giao dịch đã hoàn thành hoặc thất bại
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canSync && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSyncTransactions}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Đồng bộ SePay
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  refetchTransactions();
                  refetchInvoices();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Làm mới
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {completedTransactions.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground">Chưa có giao dịch nào</p>
              <p className="text-sm text-muted-foreground mt-1">
                Các giao dịch đã hoàn thành sẽ hiển thị tại đây
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày giao dịch</TableHead>
                    <TableHead>Mã hóa đơn</TableHead>
                    <TableHead>Nội dung</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead className="text-right">Chi tiết</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedTransactions.map((transaction) => {
                    const invoice = getInvoiceForTransaction(transaction.invoice_id);
                    const description = typeof transaction.metadata === 'object' && transaction.metadata !== null 
                      ? (transaction.metadata as any).description || 'Thanh toán đăng ký'
                      : 'Thanh toán đăng ký';
                    
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          {transaction.payment_date
                            ? formatDate(new Date(transaction.payment_date), 'dd/MM/yyyy HH:mm', { locale: vi })
                            : formatDate(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })
                          }
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {invoice?.invoice_number || '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {description}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(transaction.payment_status)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatVNCurrency(transaction.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedInvoice(invoice)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Hóa đơn {selectedInvoice?.invoice_number}
            </DialogTitle>
            <DialogDescription>
              Chi tiết hóa đơn và thông tin thanh toán
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Ngày phát hành:</span>
                  <p className="font-medium">
                    {formatDate(new Date(selectedInvoice.invoice_date), 'dd/MM/yyyy', { locale: vi })}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Trạng thái:</span>
                  <div className="mt-1">
                    <Badge variant={selectedInvoice.status === 'paid' ? 'default' : selectedInvoice.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {selectedInvoice.status === 'paid' ? 'Đã thanh toán' : 
                       selectedInvoice.status === 'cancelled' ? 'Đã hủy' : 'Chưa thanh toán'}
                    </Badge>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Thời hạn sử dụng:</span>
                  <p className="font-medium">
                    {formatDate(new Date(selectedInvoice.period_start), 'dd/MM/yyyy', { locale: vi })} → {formatDate(new Date(selectedInvoice.period_end), 'dd/MM/yyyy', { locale: vi })}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tạm tính:</span>
                  <span>{formatVNCurrency(selectedInvoice.subtotal)}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Giảm giá:</span>
                    <span>-{formatVNCurrency(selectedInvoice.discount_amount)}</span>
                  </div>
                )}
                {selectedInvoice.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Thuế:</span>
                    <span>{formatVNCurrency(selectedInvoice.tax_amount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Tổng cộng:</span>
                  <span className="text-primary">{formatVNCurrency(selectedInvoice.total_amount)}</span>
                </div>
              </div>

              {selectedInvoice.notes && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Ghi chú:</span>
                    <p className="mt-1">{selectedInvoice.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
