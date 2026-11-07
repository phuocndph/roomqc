import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenantSubscription } from '@/hooks/useSubscription';
import { useRoomSubscriptionLimit } from '@/hooks/useRoomSubscriptionLimit';
import { DURATION_OPTIONS } from '@/lib/pricing';
import { BankTransferPaymentDialog } from '@/components/payment/BankTransferPaymentDialog';

interface PlanChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRooms?: number;
  initialDuration?: number;
}
export function PlanChangeDialog({ open, onOpenChange, initialRooms = 50, initialDuration = 365 }: PlanChangeDialogProps) {
  const navigate = useNavigate();
  const { data: subscription } = useTenantSubscription();
  const { actualRooms } = useRoomSubscriptionLimit();
  const [rooms, setRooms] = useState(initialRooms);
  const [days, setDays] = useState(initialDuration);
  const [showQuote, setShowQuote] = useState(false);
  useEffect(() => {
    if (open) { setRooms(subscription?.registered_rooms || initialRooms); setDays(initialDuration); }
  }, [open, subscription?.registered_rooms, initialRooms, initialDuration]);
  const valid = Number.isInteger(rooms) && rooms >= Math.max(actualRooms || 0, 1) && rooms <= 100000;
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Gia hạn gói dịch vụ</DialogTitle>
        <DialogDescription>Chọn số phòng và thời hạn. Bước tiếp theo hiển thị giá chính xác từ máy chủ; chưa thu tiền.</DialogDescription>
      </DialogHeader>
      <Label htmlFor="renewal-rooms">Số phòng đăng ký</Label>
      <Input id="renewal-rooms" type="number" min={Math.max(actualRooms || 0, 1)} max={100000} value={rooms}
        onChange={e => setRooms(Number(e.target.value))} />
      {!valid && <p role="alert" className="text-sm text-destructive">Số phòng phải là số nguyên, từ {Math.max(actualRooms || 0, 1)} đến 100.000.</p>}
      <Label htmlFor="renewal-days">Thời hạn</Label>
      <select id="renewal-days" className="h-10 rounded-md border bg-background px-3" value={days} onChange={e => setDays(Number(e.target.value))}>
        {DURATION_OPTIONS.map(option => <option key={option.days} value={option.days}>{option.label}</option>)}
      </select>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
        <Button disabled={!valid} onClick={() => { onOpenChange(false); setShowQuote(true); }}>Xem báo giá</Button></DialogFooter>
    </DialogContent></Dialog>
    {showQuote && <BankTransferPaymentDialog open onOpenChange={setShowQuote} kind="extend" rooms={rooms} durationDays={days}
      onPaymentCreated={id => { setShowQuote(false); navigate('/settings/subscription/pay/' + id); }} />}
  </>;
}
