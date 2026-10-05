import React from 'react';
import { PurchaseOrder } from '@/types/purchase-order.types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Printer,
  Copy,
  Trash,
  MoreHorizontal,
  AlertCircle
} from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface POTableProps {
  purchaseOrders: PurchaseOrder[];
  selectedPOs: string[];
  onSelectionChange: (ids: string[]) => void;
}

const POTable: React.FC<POTableProps> = ({
  purchaseOrders,
  selectedPOs,
  onSelectionChange
}) => {
  const navigate = useNavigate();

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

  const formatRelativeTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: vi });
  };

  const isOverdue = (po: PurchaseOrder) => {
    if (po.status === 'received' || po.status === 'cancelled') return false;
    return new Date(po.expected_delivery_date) < new Date();
  };

  const isDueSoon = (po: PurchaseOrder) => {
    if (po.status === 'received' || po.status === 'cancelled') return false;
    const daysUntilDelivery = differenceInDays(
      new Date(po.expected_delivery_date),
      new Date()
    );
    return daysUntilDelivery >= 0 && daysUntilDelivery <= 2;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(purchaseOrders.map(po => po.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedPOs, id]);
    } else {
      onSelectionChange(selectedPOs.filter(poId => poId !== id));
    }
  };

  return (
    <div className="border rounded-lg">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedPOs.length === purchaseOrders.length && purchaseOrders.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Mã đơn</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Nhà cung cấp</TableHead>
              <TableHead>Sản phẩm</TableHead>
              <TableHead className="text-right">Tổng giá trị</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead>Người duyệt</TableHead>
              <TableHead>Ngày giao DK</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  Không có đơn đặt hàng nào
                </TableCell>
              </TableRow>
            ) : (
              purchaseOrders.map(po => {
                const statusBadge = getStatusBadge(po.status);
                const overdue = isOverdue(po);
                const dueSoon = isDueSoon(po);
  
                return (
                  <TableRow
                    key={po.id}
                    className={`
                      ${overdue ? 'border-l-4 border-l-red-500' : ''}
                      ${dueSoon ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}
                      cursor-pointer hover:bg-muted/50
                    `}
                    onClick={() => navigate(`/purchase-orders/${po.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedPOs.includes(po.id)}
                        onCheckedChange={(checked) => handleSelectOne(po.id, checked as boolean)}
                      />
                    </TableCell>
  
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{po.po_code}</span>
                        {overdue && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
  
                    <TableCell>
                      <div>
                        <div className="font-medium">{formatDate(po.order_date)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatRelativeTime(po.order_date)}
                        </div>
                      </div>
                    </TableCell>
  
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {po.vendor?.logo_url && (
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={po.vendor.logo_url} />
                            <AvatarFallback>
                              {po.vendor.name.substring(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div>
                          <div className="font-medium">{po.vendor?.name || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">
                            {po.vendor?.code || ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
  
                    <TableCell>
                      <div className="text-sm">
                        {po.items?.length || 0} items
                      </div>
                    </TableCell>
  
                    <TableCell className="text-right">
                      <div className="font-semibold">{formatCurrency(po.total_amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        ST: {formatCurrency(po.subtotal)}
                      </div>
                    </TableCell>
  
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="text-xs">
                            {po.requested_by?.substring(0, 2).toUpperCase() || 'NA'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{po.requested_by || 'N/A'}</span>
                      </div>
                    </TableCell>
  
                    <TableCell>
                      {po.approved_by ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">
                              {po.approved_by.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm">{po.approved_by}</div>
                            <div className="text-xs text-muted-foreground">
                              {po.approved_at && formatDate(po.approved_at)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
  
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {formatDate(po.expected_delivery_date)}
                        </div>
                        {overdue ? (
                          <div className="text-xs text-red-500 font-medium">
                            Quá hạn
                          </div>
                        ) : dueSoon ? (
                          <div className="text-xs text-yellow-600 font-medium">
                            Còn {differenceInDays(new Date(po.expected_delivery_date), new Date())} ngày
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(po.expected_delivery_date)}
                          </div>
                        )}
                      </div>
                    </TableCell>
  
                    <TableCell>
                      <Badge variant={statusBadge.variant}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
  
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="hover:bg-muted hover:text-foreground" aria-label="Thao tác đơn đặt hàng">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate(`/purchase-orders/${po.id}`)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Xem chi tiết
                          </DropdownMenuItem>
  
                          {po.status === 'draft' && (
                            <>
                              <PermissionGate module="purchase_orders" action="update">
                                <DropdownMenuItem>
                                  <Send className="w-4 h-4 mr-2" />
                                  Gửi duyệt
                                </DropdownMenuItem>
                              </PermissionGate>
                            </>
                          )}
  
                          {po.status === 'submitted' && (
                            <>
                              <PermissionGate module="purchase_orders" action="approve">
                                <DropdownMenuItem>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Duyệt
                                </DropdownMenuItem>
                              </PermissionGate>
                              <PermissionGate module="purchase_orders" action="approve">
                                <DropdownMenuItem>
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Từ chối
                                </DropdownMenuItem>
                              </PermissionGate>
                            </>
                          )}
  
                          {(po.status === 'ordered' || po.status === 'partial') && (
                            <PermissionGate module="purchase_orders" action="update">
                              <DropdownMenuItem>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Nhận hàng
                              </DropdownMenuItem>
                            </PermissionGate>
                          )}
  
                          <DropdownMenuSeparator />
  
                          <DropdownMenuItem>
                            <Printer className="w-4 h-4 mr-2" />
                            In đơn
                          </DropdownMenuItem>
  
                          <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Sao chép
                          </DropdownMenuItem>
  
                          {(po.status === 'draft' || po.status === 'submitted') && (
                            <>
                              <DropdownMenuSeparator />
                              <PermissionGate module="purchase_orders" action="delete">
                                <DropdownMenuItem className="text-red-600">
                                  <Trash className="w-4 h-4 mr-2" />
                                  Xóa
                                </DropdownMenuItem>
                              </PermissionGate>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default POTable;
