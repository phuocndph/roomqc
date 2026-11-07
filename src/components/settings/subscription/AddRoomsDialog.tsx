import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenantSubscription } from '@/hooks/useSubscription';
import { BankTransferPaymentDialog } from '@/components/payment/BankTransferPaymentDialog';

export function AddRoomsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { data: subscription } = useTenantSubscription();
  const [rooms, setRooms] = useState(10);
  const [showQuote, setShowQuote] = useState(false);
  const isTrial = subscription?.subscription_status === 'trial';
  const valid = Number.isInteger(rooms) && rooms >= 1 && rooms <= 100000;
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>{isTrial ? 'Thêm phòng trong thời gian dùng thử' : 'Mua thêm phòng'}</DialogTitle>
        <DialogDescription>{isTrial
          ? 'Bạn có thể tạo phòng trong giới hạn dùng thử hiện tại tại mục Phòng. Muốn tăng giới hạn, hãy đăng ký gói hoặc liên hệ hỗ trợ.'
          : 'Giá và số ngày còn lại được máy chủ tính ở bước tiếp theo. Hiện chỉ tạo nháp, chưa tăng giới hạn phòng hoặc thu tiền.'}</DialogDescription>
      </DialogHeader>
      {!isTrial && <><Label htmlFor="additional-rooms">Số phòng mua thêm</Label>
        <Input id="additional-rooms" type="number" min={1} max={100000} value={rooms} onChange={e => setRooms(Number(e.target.value))} />
        {!valid && <p role="alert" className="text-sm text-destructive">Nhập số nguyên từ 1 đến 100.000.</p>}</>}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
        {isTrial ? <Button onClick={() => { onOpenChange(false); navigate('/rooms'); }}>Quản lý phòng</Button>
          : <Button disabled={!valid} onClick={() => { onOpenChange(false); setShowQuote(true); }}>Xem báo giá</Button>}
      </DialogFooter>
    </DialogContent></Dialog>
    {showQuote && <BankTransferPaymentDialog open onOpenChange={setShowQuote} kind="add_rooms" rooms={rooms}
      onPaymentCreated={id => { setShowQuote(false); navigate('/settings/subscription/pay/' + id); }} />}
  </>;
}
