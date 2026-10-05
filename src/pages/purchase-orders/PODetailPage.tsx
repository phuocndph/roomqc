import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, Phone, User, Calendar, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useBreakpoint } from '@/lib/breakpoints';
import { MobilePODetail } from '@/components/purchase-orders/MobilePODetail';

const PODetailPage: React.FC = () => {
  const { isMobile } = useBreakpoint()
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: po, isLoading } = usePurchaseOrder(id!);

  if (isMobile) {
    return <MobilePODetail />
  }

  if (isLoading) return <LoadingSpinner />;
  if (!po) return <div className="text-center py-12">Không tìm thấy đơn hàng</div>;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: any }> = {
      draft: { label: 'Nháp', variant: 'secondary' },
      submitted: { label: 'Chờ duyệt', variant: 'default' },
      approved: { label: 'Đã duyệt', variant: 'default' },
      rejected: { label: 'Từ chối', variant: 'destructive' },
      ordered: { label: 'Đã đặt', variant: 'default' },
      partial: { label: 'Nhận 1 phần', variant: 'secondary' },
      received: { label: 'Hoàn thành', variant: 'default' },
      cancelled: { label: 'Đã hủy', variant: 'destructive' }
    };
    return variants[status] || { label: status, variant: 'secondary' };
  };

  const statusBadge = getStatusBadge(po.status);
  const isOverdue = new Date(po.expected_delivery_date) < new Date() && po.status !== 'received' && po.status !== 'cancelled';
  const daysUntilDelivery = differenceInDays(new Date(po.expected_delivery_date), new Date());

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">ĐƠN ĐẶT HÀNG: {po.po_code}</h1>
                <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                {isOverdue && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Quá hạn</Badge>}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Ngày tạo: {formatDate(po.order_date)}</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  <span>Người tạo: {po.requested_by}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm"><Printer className="w-4 h-4 mr-2" />In</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Vendor Info */}
          <Card>
            <CardHeader><CardTitle>Thông tin nhà cung cấp</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={po.vendor?.logo_url} />
                  <AvatarFallback>{po.vendor?.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Link 
                    to={`/vendors/${po.vendor_id}`}
                    className="text-lg font-semibold hover:underline"
                  >
                    {po.vendor?.name}
                  </Link>
                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{po.vendor?.phone}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader><CardTitle>Chi tiết sản phẩm</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead className="text-right">SL đặt</TableHead>
                      <TableHead className="text-right">Đơn giá</TableHead>
                      <TableHead className="text-right">Thành tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {po.items?.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <Link 
                            to={`/items/${item.item_id}`}
                            className="font-medium hover:underline"
                          >
                            {item.item?.name || 'N/A'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-medium">{item.quantity_ordered}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(item.total_price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-6 flex justify-end">
                <div className="w-80 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tạm tính:</span>
                    <span className="font-medium">{formatCurrency(po.subtotal)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>TỔNG CỘNG:</span>
                    <span className="text-primary">{formatCurrency(po.total_amount)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Trạng thái đơn hàng</CardTitle></CardHeader>
            <CardContent>
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PODetailPage;
