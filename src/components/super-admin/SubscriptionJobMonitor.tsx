import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { readSubscriptionJobMonitor, subscriptionJobMonitorError, subscriptionJobStatusLabels, type SubscriptionJobRun } from '@/lib/subscription-job-monitor';
import { clearJobRecovery, JOB_RECOVERY_STORAGE_ERROR, loadJobRecovery, persistJobRecovery,
  readJobRecoveryReceipt, type JobRecoveryCommand } from '@/lib/subscription-job-recovery';

const time = (value: string) => new Date(value).toLocaleString('vi-VN');

function RunSummary({ run }: { run: SubscriptionJobRun }) {
  const result = run.summary;
  return <div className="space-y-1 text-sm">
    <div><Badge variant={run.status === 'success' ? 'default' : run.status === 'running' || run.status === 'busy' ? 'outline' : 'destructive'}>{subscriptionJobStatusLabels[run.status]}</Badge></div>
    <p>Bắt đầu: {time(run.started_at)}{run.finished_at ? ` · Kết thúc: ${time(run.finished_at)}` : ' · Chưa ghi nhận kết thúc'}</p>
    <p className="text-xs text-muted-foreground break-all">Mã lượt chạy: {run.id}</p>
    {run.execution_scope && <p>Phạm vi: {run.execution_scope.kind === 'cluster' ? 'toàn cụm' : `${run.execution_scope.tenant_ids.length} khách hàng được chỉ định`}.</p>}
    {run.status === 'interrupted' && <p className="font-medium text-destructive">Cần kiểm tra thủ công, không tự chạy lại.</p>}
    {result ? <>
      <p>Kiểm tra thuê bao: {result.subscription_status === 'success' ? 'thành công' : 'lỗi'}.</p>
      <p>Đã xác nhận: {result.to_grace_period} sang ân hạn · {result.to_suspended} sang tạm khóa.</p>
      <p>Thông báo: {result.notifications_sent} đã gửi · {result.notifications_failed} lỗi. Nhân sự: {result.staff_status === 'success' ? 'thành công' : result.staff_status === 'not_run' ? 'chưa chạy' : 'lỗi'}.</p>
      {(result.transition_outcome_unknown || result.recovery_required) && <p className="font-medium text-destructive">Kết quả có thể chưa đầy đủ hoặc cần khôi phục. Không coi các số trên là toàn bộ thay đổi.</p>}
      {result.error_codes.length > 0 && <p>Có {result.error_codes.length} mã lỗi được ghi nhận. Cần kiểm tra log vận hành.</p>}
    </> : <p>Chưa có bản tổng kết; không suy ra số thay đổi bằng 0.</p>}
  </div>;
}

function JobRecovery({ actorId, run, onRecovered }: { actorId: string; run: SubscriptionJobRun | null; onRecovered: () => void }) {
  const pending = useRef<JobRecoveryCommand | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reason, setReason] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    try {
      pending.current = loadJobRecovery(actorId);
      if (pending.current) { setReason(pending.current.reason); setAwaiting(true); }
    } catch { setStorageError(true); }
    setLoaded(true);
  }, [actorId]);
  const eligible = run?.status === 'interrupted' && run.execution_protocol === 'atomic_v1';
  async function recover() {
    if (!loaded || saving || storageError) return;
    if (!pending.current) {
      if (!eligible || !run || reason.trim().length < 10) return;
      pending.current = { runId: run.id, requestId: crypto.randomUUID(), deadlineAt: run.deadline_at, reason: reason.trim() };
    }
    const command = pending.current;
    try { persistJobRecovery(actorId, command); }
    catch { setStorageError(true); return; }
    setSaving(true); setAwaiting(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_recover_subscription_status_run' as never, {
        p_run_id: command.runId, p_request_id: command.requestId,
        p_expected_deadline_at: command.deadlineAt, p_reason: command.reason,
      } as never);
      if (error) throw error;
      readJobRecoveryReceipt(data, command);
      try { clearJobRecovery(actorId, command); }
      catch { setStorageError(true); return; }
      pending.current = null; setAwaiting(false); setReason('');
      setMessage('Đã ghi nhận giải phóng lượt gián đoạn. Không chạy lại tác vụ hoặc thay đổi gói khách hàng.');
      onRecovered();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null;
      // These errors are emitted only after checking for an existing receipt.
      // Auth/network/schema errors cannot disprove a previously committed call.
      if (code === 'PT412' || code === 'PT404') {
        try { clearJobRecovery(actorId, command); }
        catch { setStorageError(true); return; }
        pending.current = null; setAwaiting(false);
        setMessage('Máy chủ từ chối: lượt chạy chưa đủ điều kiện an toàn để giải phóng. Hãy tải lại giám sát.');
        onRecovered();
      } else setMessage('Chưa xác nhận được kết quả. Thử lại đúng lệnh trước; nếu bị từ chối, kiểm tra phiên quản trị và trạng thái lượt chạy.');
    } finally { setSaving(false); }
  }
  if (!loaded || (!eligible && !awaiting && !storageError && !message)) return null;
  return <div className="rounded-md border p-3 space-y-2 text-sm" aria-label="Phục hồi tác vụ gián đoạn">
    <h3 className="font-medium">Giải phóng lượt gián đoạn</h3>
    <p>Chỉ kết thúc lượt đã bị cơ chế DB chặn ghi tiếp. Không tự chạy lại, không đổi gói và không gửi thông báo.</p>
    {awaiting && <p>Lệnh đang chờ xác nhận cho lượt {pending.current?.runId}. Giữ nguyên lệnh khi thử lại hoặc tải lại trang.</p>}
    <label className="block" htmlFor="job-recovery-reason">Lý do giải phóng (ít nhất 10 ký tự)</label>
    <textarea id="job-recovery-reason" className="w-full rounded-md border bg-background p-2" maxLength={1000}
      disabled={saving || awaiting || storageError} value={reason} onChange={e => setReason(e.target.value)} />
    {storageError ? <p role="alert">{JOB_RECOVERY_STORAGE_ERROR}</p> : <Button variant="outline" disabled={saving || (!awaiting && reason.trim().length < 10)}
      onClick={() => void recover()}>{saving ? 'Đang xác nhận…' : awaiting ? 'Thử lại lệnh giải phóng' : 'Giải phóng lượt gián đoạn'}</Button>}
    {message && <p role="status">{message}</p>}
  </div>;
}

export function SubscriptionJobMonitor() {
  const { user, session } = useAuth();
  const query = useQuery({
    queryKey: ['subscription-job-monitor', user?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('admin_subscription_job_monitor' as never).abortSignal(signal);
      if (error) throw error;
      return readSubscriptionJobMonitor(data);
    },
    enabled: !!user && !!session, retry: false, gcTime: 0, staleTime: 0,
    refetchInterval: 60000, refetchIntervalInBackground: false,
  });
  // Never show cached protected evidence after an auth error, logout, or failed
  // revalidation. Reload is a read operation, not a command to execute a job.
  const data = user && session && !query.error && !query.isFetching ? query.data : undefined;
  return <section aria-label="Giám sát tác vụ thuê bao" className="rounded-lg border p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Tác vụ kiểm tra thuê bao</h2><p className="text-sm text-muted-foreground">Giám sát toàn cụm · không chạy tác vụ từ màn hình này</p></div>
      <Button variant="outline" size="sm" disabled={!user || !session || query.isFetching} onClick={() => void query.refetch()}>Tải lại giám sát</Button>
    </div>
    {!user || !session ? <p role="alert">Đăng nhập bằng phiên quản trị hợp lệ để xem giám sát.</p>
      : query.error ? <div role="alert" className="space-y-1 text-sm"><p>{subscriptionJobMonitorError(query.error)}</p><p>Dữ liệu cũ đã được ẩn, không dùng để kết luận trạng thái hiện tại.</p></div>
      : query.isPending || query.isFetching ? <p role="status">Đang kiểm tra dữ liệu mới nhất…</p>
      : data && <>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="rounded-md border p-3 space-y-1"><h3 className="font-medium">Lần thành công gần nhất</h3><p>{data.last_success_at ? time(data.last_success_at) : 'Chưa có lần chạy thành công được ghi nhận'}</p></div>
          <div className="rounded-md border p-3 space-y-1"><h3 className="font-medium">Lịch chạy</h3><p>Chưa xác minh lịch chạy</p><p className="text-muted-foreground">Có lịch sử thành công không chứng minh cron đang hoạt động.</p></div>
        </div>
        {data.active && <div className="rounded-md border p-3 space-y-2"><h3 className="font-medium">{data.active.status === 'interrupted' ? 'Lượt gián đoạn đang chặn tác vụ mới' : 'Lượt đang chạy'}</h3><RunSummary run={data.active} /></div>}
        {data.active?.status === 'interrupted' && data.active.execution_protocol !== 'atomic_v1'
          && <p className="text-sm text-destructive">Lượt cũ chưa có cơ chế DB chặn ghi tiếp. Cần người vận hành xác minh worker đã dừng; không giải phóng tự động.</p>}
        {data.latest_failure && <div className="rounded-md border border-destructive p-3 space-y-2"><h3 className="font-medium">Lỗi hoặc gián đoạn gần nhất</h3><RunSummary run={data.latest_failure} /></div>}
        <div className="rounded-md border p-3 text-sm space-y-1">
          <h3 className="font-medium">Cần xử lý theo điều kiện cũ tại thời điểm kiểm tra</h3>
          <p>{data.backlog.eligible_grace} đủ điều kiện sang ân hạn · {data.backlog.eligible_suspend} đủ điều kiện tạm khóa.</p>
          <p className={data.backlog.unhandled_expired_active > 0 ? 'font-medium text-destructive' : ''}>{data.backlog.unhandled_expired_active} gói đang dùng hoặc dùng thử đã hết hạn nhưng chưa được điều kiện cũ bao phủ.</p>
          <p className="text-muted-foreground">Đo lúc {time(data.backlog.checked_at)}; không phải toàn bộ backlog hay kết quả của lượt chạy gần nhất.</p>
        </div>
        {data.outbox && <div className="rounded-md border p-3 text-sm space-y-1">
          <h3 className="font-medium">Hàng đợi thông báo trong ứng dụng</h3>
          <p>{data.outbox.pending} đang chờ · {data.outbox.due} đến hạn thử · {data.outbox.with_error} đang có lỗi.</p>
          <p>{data.outbox.delivered} đã tạo thông báo · {data.outbox.obsolete} đã bỏ qua vì không còn phù hợp.</p>
          <p className="text-muted-foreground">Không bao gồm email/push và không chứng minh người dùng đã đọc.</p>
        </div>}
        {data.latest_recovery && <p className="text-sm">Lần giải phóng gần nhất: {time(data.latest_recovery.recovered_at)} · lượt {data.latest_recovery.run_id}.</p>}
        <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Lịch sử gần nhất ({data.runs.length}/25 lượt tối đa)</summary>
          {data.runs.length === 0 ? <p className="pt-3 text-sm">Chưa có lịch sử được ghi nhận.</p> : <ol className="divide-y">{data.runs.map(run => <li className="py-3" key={run.id}><RunSummary run={run} /></li>)}</ol>}
        </details>
        <p className="text-xs text-muted-foreground">Kiểm tra lúc {time(data.checked_at)}. Tự tải lại mỗi 60 giây khi màn hình đang mở và hoạt động.</p>
      </>}
    {user && session && <JobRecovery key={user.id} actorId={user.id} run={data?.active ?? null} onRecovered={() => void query.refetch()} />}
  </section>;
}
