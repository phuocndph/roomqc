import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/hooks/useUser';
import { formatVNCurrency } from '@/lib/pricing';
import { checkoutError, readSubscriptionQuote } from '@/lib/subscription-checkout';

interface BankTransferPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'extend' | 'add_rooms';
  rooms: number;
  durationDays?: number;
  onPaymentCreated?: (invoiceId: string) => void;
}

// Retains the component name, but never accepts money, bank details or
// arbitrary metadata from the browser. Opening only fetches a server quote;
// the order (amount, transfer reference, platform account) is created server side.
export function BankTransferPaymentDialog(props: BankTransferPaymentDialogProps) {
  const { tenantId } = useUser();
  return <QuoteDraftDialog key={JSON.stringify([tenantId, props.kind, props.rooms, props.durationDays])} {...props} />;
}
function QuoteDraftDialog({ open, onOpenChange, kind, rooms, durationDays, onPaymentCreated }: BankTransferPaymentDialogProps) {
  const { tenantId } = useUser();
  const client = useQueryClient();
  const ids = useMemo(() => ({ quote: crypto.randomUUID(), draft: crypto.randomUUID() }), []);
  const busy = useRef(false);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const { data: quote, error, isLoading, refetch } = useQuery({
    queryKey: ['subscription-quote', tenantId, ids.quote],
    enabled: open && !!tenantId,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await supabase.rpc('create_subscription_quote', {
        p_request_id: ids.quote, p_kind: kind, p_rooms: rooms,
        p_duration_days: kind === 'extend' ? durationDays : undefined,
      });
      if (result.error) throw result.error;
      return readSubscriptionQuote(result.data);
    },
  });
  const createDraft = async () => {
    if (!quote || busy.current || invoiceId) return;
    busy.current = true; setCreating(true); setFailure('');
    try {
      const result = await supabase.rpc('create_subscription_checkout_draft', {
        p_quote_id: quote.quote_id, p_request_id: ids.draft,
      });
      if (result.error) throw result.error;
      const value = result.data;
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.invoice_id !== 'string'
        || value.non_payable !== false || value.checkout_enabled !== true) throw new Error('INVALID_DRAFT_RESPONSE');
      setInvoiceId(value.invoice_id);
      void client.invalidateQueries({ queryKey: ['pending-payments'] });
      void client.invalidateQueries({ queryKey: ['pending-payments-count'] });
      void client.invalidateQueries({ queryKey: ['invoices'] });
    } catch (cause) { setFailure(checkoutError(cause)); }
    finally { busy.current = false; setCreating(false); }
  };
  return <Dialog open={open} onOpenChange={creating ? undefined : onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Báo giá từ hệ thống</DialogTitle>
        <DialogDescription>Giá được tính trên máy chủ. Sau khi tạo đơn, chuyển khoản theo mã QR; gói được kích hoạt tự động khi RoomQC nhận đủ tiền.</DialogDescription>
      </DialogHeader>
      {!tenantId ? <p role="alert">Không xác định được tài khoản khách sạn. Vui lòng đăng nhập lại.</p>
        : isLoading ? <p role="status"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Đang lấy báo giá…</p>
        : error ? <div role="alert"><p>{checkoutError(error)}</p><Button variant="outline" onClick={() => void refetch()}>Thử lại</Button></div>
        : quote && <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt>Số phòng tính phí</dt><dd className="text-right">{quote.billed_rooms}</dd>
          <dt>Số ngày</dt><dd className="text-right">{quote.duration_days}</dd>
          <dt>Đơn giá/phòng/ngày</dt><dd className="text-right">{formatVNCurrency(quote.price_per_room_daily)}</dd>
          <dt>Giá gốc</dt><dd className="text-right">{formatVNCurrency(quote.subtotal)}</dd>
          <dt>Chiết khấu</dt><dd className="text-right">−{formatVNCurrency(quote.discount_amount)}</dd>
          <dt className="font-semibold">Tổng dự kiến</dt><dd className="text-right font-semibold">{formatVNCurrency(quote.total_amount)}</dd>
          <dt>Kỳ dự kiến</dt><dd className="text-right">{quote.period_start} → {quote.period_end}</dd>
        </dl>}
      {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
      {invoiceId && <p role="status">Đã tạo đơn. Mở trang thanh toán để quét mã QR; đơn cũng nằm trong mục Đang chờ.</p>}
      <DialogFooter>
        <Button variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>Đóng</Button>
        {invoiceId ? <Button onClick={() => onPaymentCreated?.(invoiceId)}>Thanh toán ngay</Button>
          : <Button disabled={!quote || creating || !!error || !tenantId} onClick={() => void createDraft()}>
            {creating ? 'Đang tạo…' : 'Tạo đơn thanh toán'}
          </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
