import React, { useState } from 'react';
import { PurchaseOrder } from '@/types/purchase-order.types';
import { useReceivePO } from '@/hooks/usePurchaseOrders';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Package, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface POReceiveFormProps {
  po: PurchaseOrder;
  open: boolean;
  onClose: () => void;
}

interface ReceiveItem {
  item_id: string;
  quantity_to_receive: number;
  notes?: string;
}

const POReceiveForm: React.FC<POReceiveFormProps> = ({ po, open, onClose }) => {
  const receivePO = useReceivePO();
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>(
    po.items?.map(item => ({
      item_id: item.item_id,
      quantity_to_receive: item.quantity_ordered - item.quantity_received,
      notes: ''
    })) || []
  );
  const [generalNotes, setGeneralNotes] = useState('');

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setReceiveItems(items =>
      items.map(item =>
        item.item_id === itemId
          ? { ...item, quantity_to_receive: Math.max(0, quantity) }
          : item
      )
    );
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    setReceiveItems(items =>
      items.map(item =>
        item.item_id === itemId ? { ...item, notes } : item
      )
    );
  };

  const handleReceiveAll = () => {
    setReceiveItems(items =>
      items.map((item, index) => {
        const poItem = po.items?.[index];
        return {
          ...item,
          quantity_to_receive: poItem
            ? poItem.quantity_ordered - poItem.quantity_received
            : 0
        };
      })
    );
  };

  const handleClearAll = () => {
    setReceiveItems(items =>
      items.map(item => ({ ...item, quantity_to_receive: 0 }))
    );
  };

  const totalReceiving = receiveItems.reduce(
    (sum, item) => sum + item.quantity_to_receive,
    0
  );

  const handleSubmit = async () => {
    const itemsToReceive = receiveItems.filter(item => item.quantity_to_receive > 0);

    if (itemsToReceive.length === 0) {
      toast.error('Vui lòng nhập số lượng nhận cho ít nhất 1 sản phẩm');
      return;
    }

    for (const item of itemsToReceive) {
      const poItem = po.items?.find(i => i.item_id === item.item_id);
      if (poItem) {
        const remaining = poItem.quantity_ordered - poItem.quantity_received;
        if (item.quantity_to_receive > remaining) {
          toast.error(`Số lượng nhận vượt quá số lượng còn lại của ${poItem.item?.name}`);
          return;
        }
      }
    }

    try {
      await receivePO.mutateAsync({
        po_id: po.id,
        items: itemsToReceive,
        notes: generalNotes
      });
      toast.success('Nhận hàng thành công');
      onClose();
    } catch (error) {
      toast.error('Có lỗi xảy ra khi nhận hàng');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Nhận hàng - {po.po_code}
          </DialogTitle>
          <DialogDescription>
            Nhập số lượng thực tế nhận được cho từng sản phẩm
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReceiveAll}
            >
              Nhận tất cả
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAll}
            >
              Xóa tất cả
            </Button>
          </div>

          <div className="border rounded-lg">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">Đã đặt</TableHead>
                    <TableHead className="text-right">Đã nhận</TableHead>
                    <TableHead className="text-right">Còn lại</TableHead>
                    <TableHead className="text-right">Nhận lần này</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items?.map((poItem) => {
                    const remaining = poItem.quantity_ordered - poItem.quantity_received;
                    const receiveItem = receiveItems.find(
                      item => item.item_id === poItem.item_id
                    );
                    const isFullyReceived = remaining === 0;
  
                    return (
                      <TableRow
                        key={poItem.id}
                        className={isFullyReceived ? 'bg-green-50' : ''}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="font-medium">{poItem.item?.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {poItem.item?.code}
                              </div>
                            </div>
                            {isFullyReceived && (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                        </TableCell>
  
                        <TableCell className="text-right font-medium">
                          {poItem.quantity_ordered}
                        </TableCell>
  
                        <TableCell className="text-right">
                          <span className={poItem.quantity_received > 0 ? 'text-green-600 font-medium' : ''}>
                            {poItem.quantity_received}
                          </span>
                        </TableCell>
  
                        <TableCell className="text-right">
                          <Badge
                            variant={remaining === 0 ? 'default' : 'secondary'}
                          >
                            {remaining}
                          </Badge>
                        </TableCell>
  
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            value={receiveItem?.quantity_to_receive || 0}
                            onChange={(e) =>
                              handleQuantityChange(
                                poItem.item_id,
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-24 text-right"
                            disabled={isFullyReceived}
                          />
                        </TableCell>
  
                        <TableCell>
                          <Input
                            placeholder="Ghi chú..."
                            value={receiveItem?.notes || ''}
                            onChange={(e) =>
                              handleNotesChange(poItem.item_id, e.target.value)
                            }
                            disabled={isFullyReceived}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">
                  Tổng số lượng nhận lần này:
                </div>
                <div className="text-2xl font-bold">{totalReceiving}</div>
              </div>
              {totalReceiving > 0 && (
                <Badge variant="default" className="text-lg px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Sẵn sàng nhận
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ghi chú chung</Label>
            <Textarea
              placeholder="Ghi chú về tình trạng hàng, vấn đề phát sinh..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              rows={3}
            />
          </div>

          {totalReceiving === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                Bạn chưa nhập số lượng nhận cho bất kỳ sản phẩm nào
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={receivePO.isPending || totalReceiving === 0}
          >
            {receivePO.isPending ? 'Đang xử lý...' : 'Xác nhận nhận hàng'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default POReceiveForm;
