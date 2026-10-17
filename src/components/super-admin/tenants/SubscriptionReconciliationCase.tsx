import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { readCaseMutation, readCasePage, reconciliationCaseError } from '@/lib/subscription-reconciliation-cases';

type Command = { requestId: string; note: string; action: 'create' | 'note'; version: number | null };

// Remounted on source/tenant changes; notes and pending request IDs never cross sources.
export function SubscriptionReconciliationCase(props: { tenantId: string; paymentId: string; onClose: () => void }) {
  const { user } = useAuth();
  return <CaseNotebook key={`${user?.id}:${props.tenantId}:${props.paymentId}`} {...props} />;
}

function CaseNotebook({ tenantId, paymentId, onClose }: { tenantId: string; paymentId: string; onClose: () => void }) {
  const { user, session } = useAuth();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const pending = useRef<Command | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const query = useQuery({
    queryKey: ['subscription-reconciliation-case', user?.id, tenantId, paymentId, before],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('admin_subscription_reconciliation_case' as never, {
        p_payment_id: paymentId, p_before_version: before ?? null,
      } as never).abortSignal(signal);
      if (error) throw error;
      return readCasePage(data, tenantId, paymentId, before);
    },
    enabled: !!user && !!session, retry: false, gcTime: 0, staleTime: 0, refetchOnMount: 'always',
  });
  const page = user && session && !permissionDenied && !query.isFetching && !query.error ? query.data : undefined;
  const canWrite = !!page && (page.case !== null || page.source.can_create) && before === undefined;

  async function save() {
    if (!user || !session || permissionDenied || saving) return;
    if (!pending.current) {
      if (!page || !canWrite || !note.trim() || note.trim().length > 2000) return;
      pending.current = { requestId: crypto.randomUUID(), note: note.trim(),
        action: page.case ? 'note' : 'create', version: page.case?.version ?? null };
    }
    // Never regenerate this command after refocus/refetch/version changes. Only
    // a committed receipt or a definitive rejection may release the pending ID.
    const command = pending.current;
    setSaving(true); setFailure(null); setSaved(null);
    try {
      const { data, error } = await supabase.rpc('admin_mutate_subscription_reconciliation_case' as never, {
        p_payment_id: paymentId, p_request_id: command.requestId, p_action: command.action,
        p_note: command.note, p_expected_version: command.version,
      } as never);
      if (error) throw error;
      const result = readCaseMutation(data, tenantId, paymentId);
      pending.current = null; setAwaitingReceipt(false);
      if (command.action === 'create' && !result.created) {
        // A competing admin already opened it. The supplied note was NOT saved.
        setSaved('Đã mở hồ sơ có sẵn. Nội dung bạn nhập chưa được lưu; kiểm tra lịch sử rồi lưu thành ghi chú nếu cần.');
      } else {
        setNote(''); setSaved('Máy chủ đã xác nhận lưu hồ sơ. Không có thay đổi tài chính.');
      }
      await query.refetch();
    } catch (error) {
      setFailure(reconciliationCaseError(error));
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (code === '42501') setPermissionDenied(true);
      if (['42501', 'PT409', 'PT404', '22023', 'PGRST202', '42883'].includes(String(code))) {
        pending.current = null; setAwaitingReceipt(false);
      } else setAwaitingReceipt(true);
    } finally { setSaving(false); }
  }

  return <section aria-label="Hồ sơ kiểm tra giao dịch" className="rounded-md border p-4 space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h3 ref={heading} tabIndex={-1} className="font-semibold">Hồ sơ kiểm tra giao dịch</h3>
      <Button variant="ghost" size="sm" onClick={onClose} disabled={saving || awaitingReceipt}>Ẩn chi tiết hồ sơ</Button>
    </div>
    <p className="text-xs font-mono break-all">Giao dịch: {paymentId}</p>
    <p className="text-sm">Chỉ lưu lịch sử kiểm tra nội bộ. Tạo hồ sơ hoặc ghi chú không xác nhận tiền, không đổi hóa đơn hay gói sử dụng.</p>
    <p className="text-xs text-muted-foreground">Chưa có phân công, kết luận, mở lại hoặc tải chứng từ. Không dán mật khẩu, khóa API hoặc thông tin ngân hàng nhạy cảm vào ghi chú.</p>
    {!session || !user ? <p role="alert">Vui lòng đăng nhập quản trị để xem hồ sơ.</p>
      : query.error ? <p role="alert">{reconciliationCaseError(query.error)}</p>
      : query.isFetching || query.isPending ? <p role="status">Đang tải hồ sơ mới nhất…</p>
      : page && <>
        {page.case ? <>
          <p className="text-sm">Hồ sơ đang mở · Phiên bản {page.case.version}</p>
          <p className="text-xs">Nguồn được chụp lúc {new Date(page.case.source_snapshot.captured_at).toLocaleString('vi-VN')}; không tự cập nhật theo giao dịch.</p>
          <ol aria-label="Lịch sử hồ sơ" className="space-y-3">
            {page.events.map(event => <li key={event.id} className="border-l-2 pl-3 text-sm">
              <p className="font-medium">{event.action === 'create' ? 'Tạo hồ sơ' : 'Ghi chú'} · v{event.version} · {new Date(event.created_at).toLocaleString('vi-VN')}</p>
              <p className="text-xs break-all text-muted-foreground">Người thực hiện: {event.actor_id}</p>
              <p className="whitespace-pre-wrap break-words">{event.note}</p>
            </li>)}
          </ol>
        </> : <p>Chưa có hồ sơ kiểm tra cho giao dịch này.</p>}
        {!canWrite && before === undefined && <p>Giao dịch nguồn không còn phù hợp để tạo hồ sơ mới.</p>}
        {canWrite && <div className="space-y-2">
          <label htmlFor="reconciliation-case-note" className="block text-sm font-medium">{page.case ? 'Ghi chú mới' : 'Lý do mở hồ sơ'}</label>
          <textarea id="reconciliation-case-note" value={note} maxLength={2000} disabled={saving || awaitingReceipt}
            className="w-full min-h-24 rounded-md border bg-background p-2 text-sm"
            onChange={event => { setNote(event.target.value); setSaved(null); }} />
          {!awaitingReceipt && <Button size="sm" disabled={saving || !note.trim()} onClick={() => void save()}>
            {saving ? 'Đang lưu…' : page.case ? 'Lưu ghi chú' : 'Tạo hồ sơ kiểm tra'}
          </Button>}
        </div>}
      </>}
    {failure && <p role="alert">{failure}</p>}
    {awaitingReceipt && session && user && !permissionDenied && <div className="space-y-2">
      <p className="text-sm">Lệnh trước chưa rõ kết quả. Không nhập lệnh mới hoặc đóng hồ sơ cho đến khi xác nhận; tải lại không hủy lệnh đã gửi.</p>
      <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? 'Đang xác nhận…' : 'Thử lại lệnh trước'}</Button>
    </div>}
    {saved && session && user && <p role="status">{saved}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={saving || query.isFetching || !session}
        onClick={() => { setSaved(null); setFailure(null); setPermissionDenied(false); if (before !== undefined) setCursors([undefined]); else void query.refetch(); }}>Tải lại hồ sơ</Button>
      <Button variant="outline" size="sm" disabled={saving || query.isFetching || cursors.length === 1}
        onClick={() => setCursors(value => value.slice(0, -1))}>Lịch sử mới hơn</Button>
      <Button variant="outline" size="sm" disabled={saving || !page?.has_more || !page.next_before_version}
        onClick={() => { if (page?.next_before_version) setCursors(value => [...value, page.next_before_version]); }}>Lịch sử cũ hơn</Button>
    </div>
  </section>;
}
