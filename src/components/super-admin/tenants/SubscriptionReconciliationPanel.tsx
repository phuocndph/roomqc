import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  readReconciliationPage, reconciliationError, reconciliationFlags,
  type ReconciliationCursor, type ReconciliationFilter,
} from '@/lib/subscription-reconciliation';

// Remount on tenant change; no cursor or cached evidence is carried to another tenant.
export function SubscriptionReconciliationPanel({ tenantId }: { tenantId: string }) {
  return <ReconciliationQueue key={tenantId} tenantId={tenantId} />;
}

function ReconciliationQueue({ tenantId }: { tenantId: string }) {
  const { user, session } = useAuth();
  const [filter, setFilter] = useState<ReconciliationFilter>('all');
  const [cursors, setCursors] = useState<(ReconciliationCursor | null)[]>([null]);
  const before = cursors.at(-1);
  const query = useQuery({
    queryKey: ['subscription-reconciliation', user?.id, tenantId, filter, before],
    queryFn: async ({ signal }) => {
      // Generated RPC types are updated separately from migrations.
      const { data, error } = await supabase.rpc('admin_subscription_reconciliation' as never, {
        p_tenant_id: tenantId, p_filter: filter, p_limit: 25,
        p_before_created_at: before?.created_at ?? null, p_before_id: before?.id ?? null,
      } as never).abortSignal(signal);
      if (error) throw error;
      return readReconciliationPage(data, tenantId);
    },
    enabled: !!user && !!session, retry: false, gcTime: 0, staleTime: 0, refetchInterval: 30000,
  });
  const page = user && session && !query.isFetching && !query.error ? query.data : undefined;
  return <section aria-label="Đối soát thuê bao" className="space-y-4 py-3">
    <div className="rounded-md border p-3 text-sm space-y-1">
      <p className="font-medium">Chỉ tra cứu — không xác nhận thanh toán hoặc đổi gói</p>
      <p>Các dấu hiệu dưới đây cần kiểm tra chứng từ. Không yêu cầu khách chuyển khoản thêm từ màn hình này.</p>
      <p className="text-muted-foreground">Hiển thị đơn đang chờ và giao dịch hoàn tất có dấu hiệu lệch. Mốc 24 giờ là tuổi đơn chờ, không phải cam kết giá hay hạn chuyển khoản.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="reconciliation-filter" className="text-sm font-medium">Lọc đơn</label>
      <select id="reconciliation-filter" value={filter} className="rounded-md border bg-background p-2 text-sm"
        onChange={event => { setFilter(event.target.value as ReconciliationFilter); setCursors([null]); }}>
        <option value="all">Tất cả đơn trong hàng đợi</option>
        <option value="attention">Cần kiểm tra</option>
        <option value="legacy">Đơn cũ chưa xác thực</option>
        <option value="stale">Chờ quá 24 giờ</option>
      </select>
      <Button variant="outline" size="sm" disabled={query.isFetching || !session}
        onClick={() => { if (cursors.length > 1) setCursors([null]); else void query.refetch(); }}>Tải lại từ đầu</Button>
    </div>
    {!session || !user ? <p role="alert">Vui lòng đăng nhập quản trị để xem đối soát.</p>
      : query.error ? <p role="alert">{reconciliationError(query.error)}</p>
      : query.isPending || query.isFetching ? <p role="status">Đang kiểm tra dữ liệu mới nhất…</p>
      : page && <>
        <p className="text-xs text-muted-foreground">Kiểm tra lúc {new Date(page.checked_at).toLocaleString('vi-VN')}. Tự tải lại mỗi 30 giây khi màn hình đang mở.</p>
        {page.rows.length === 0 ? <p>Không có đơn phù hợp bộ lọc trong phạm vi kiểm tra.</p> : <Table>
          <TableHeader><TableRow><TableHead>Đơn / hóa đơn</TableHead><TableHead>Số tiền ghi nhận</TableHead><TableHead>Cần lưu ý</TableHead></TableRow></TableHeader>
          <TableBody>{page.rows.map(row => <TableRow key={row.id}>
            <TableCell className="align-top">
              <p className="text-xs break-all font-mono">{row.id}</p>
              <p>{row.invoice_number ?? 'Không có hóa đơn cùng khách hàng'}</p>
              {row.invoice_id && <p className="text-xs break-all text-muted-foreground">ID hóa đơn: {row.invoice_id}</p>}
              <p className="text-xs text-muted-foreground">{row.payment_status === 'pending' ? 'Đang chờ' : 'Hoàn tất'} · Hóa đơn: {row.invoice_status ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{row.flags.includes('missing_created_at') ? 'Thiếu thời điểm tạo' : new Date(row.created_at).toLocaleString('vi-VN')}</p>
            </TableCell>
            <TableCell className="align-top whitespace-nowrap">{row.amount.toLocaleString('vi-VN')} {row.currency}</TableCell>
            <TableCell className="align-top"><div className="flex flex-wrap gap-1">{row.flags.map(flag =>
              <Badge key={flag} variant={flag === 'non_payable_draft' ? 'outline' : 'destructive'}>
                {reconciliationFlags[flag as keyof typeof reconciliationFlags] ?? 'Dấu hiệu mới — cần kiểm tra'}
              </Badge>)}</div></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </>}
    <div className="flex items-center justify-end gap-3">
      <span className="text-sm">Trang {cursors.length}</span>
      <Button variant="outline" size="sm" disabled={cursors.length === 1 || query.isFetching}
        onClick={() => setCursors(value => value.slice(0, -1))}>Trang trước</Button>
      <Button variant="outline" size="sm" disabled={!page?.has_more || !page.next_cursor}
        onClick={() => { if (page?.next_cursor) setCursors(value => [...value, page.next_cursor]); }}>Trang sau</Button>
    </div>
  </section>;
}
