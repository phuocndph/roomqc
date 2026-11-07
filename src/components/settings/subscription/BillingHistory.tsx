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
import { FileText, History, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from '@/integrations/supabase/client';
import { formatVNCurrency } from '@/lib/pricing';
import { Separator } from '@/components/ui/separator';
import { useUser } from '@/hooks/useUser';
import { instanceChannelName } from '@/lib/realtime/channelName'

export function BillingHistory() {
  const { data: transactions, isLoading: loadingTransactions, isError: transactionsError,
    isFetching: fetchingTransactions, refetch: refetchTransactions } = usePaymentTransactions();
  const { data: invoices, isLoading: loadingInvoices, isError: invoicesError,
    isFetching: fetchingInvoices, refetch: refetchInvoices } = useInvoices();
  const { tenantId } = useUser();
  const [selection, setSelection] = useState<{ tenantId: string; id: string } | null>(null);
  const hasError = transactionsError || invoicesError;
  const isFetching = fetchingTransactions || fetchingInvoices;
  // Resolve from current scoped data; never retain an invoice snapshot after a
  // tenant switch, a failed refresh, or while revalidating access.
  const selectedInvoice = !hasError && !isFetching && selection?.tenantId === tenantId
    ? invoices?.find(invoice => invoice.id === selection.id) ?? null : null;
  const refresh = () => { void refetchTransactions(); void refetchInvoices(); };

  // Realtime subscription for payment updates
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(instanceChannelName(`billing-history:${tenantId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_transactions', filter: `tenant_id=eq.${tenantId}` },
        () => refetchTransactions()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `tenant_id=eq.${tenantId}` },
        () => refetchInvoices()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, refetchTransactions, refetchInvoices]);

  // Filter to show only completed or failed transactions (not pending - those are in "Đang chờ" tab)
  const completedTransactions = transactions?.filter(t => 
    ['completed', 'failed', 'cancelled', 'expired', 'refunded'].includes(t.payment_status ?? '')
  ) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'cancelled': return <Badge variant="outline">Đã hủy</Badge>;
      case 'expired': return <Badge variant="outline">Đã hết hạn</Badge>;
      case 'refunded': return <Badge variant="outline">Đã hoàn tiền</Badge>;
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

  if (!tenantId) {
    return <p role="alert">Không xác định được khách sạn. Vui lòng đăng nhập lại.</p>;
  }

  if (hasError) {
    return <div role="alert" className="space-y-3">
      <p>Không tải được lịch sử thanh toán. Vui lòng thử lại hoặc đăng nhập lại.</p>
      <Button variant="outline" onClick={refresh} disabled={isFetching}>Thử lại</Button>
    </div>;
  }

  if (loadingTransactions || loadingInvoices || isFetching) {
    return (
      <div role="status" aria-label="Đang tải lịch sử thanh toán" className="space-y-4">
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
                  Lịch sử thuê bao RoomQC, không phải hóa đơn của khách lưu trú.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={refresh}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Làm mới
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Chỉ tra cứu. Đơn gia hạn được xác nhận tự động khi RoomQC nhận tiền qua chuyển khoản.
          </p>
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
                    const metadata = transaction.metadata;
                    const description = typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
                      && typeof metadata.description === 'string' ? metadata.description : 'Thanh toán đăng ký';
                    
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
                          {getStatusBadge(transaction.payment_status === 'failed' && invoice?.status === 'cancelled'
                            ? 'cancelled' : transaction.payment_status)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatVNCurrency(transaction.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Xem hóa đơn ${invoice.invoice_number}`}
                              onClick={() => setSelection({ tenantId, id: invoice.id })}
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
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelection(null)}>
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
