import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { readSubscriptionJobMonitor, subscriptionJobMonitorError, subscriptionJobStatusLabels, type SubscriptionJobRun } from '@/lib/subscription-job-monitor';

const time = (value: string) => new Date(value).toLocaleString('vi-VN');

function RunSummary({ run }: { run: SubscriptionJobRun }) {
  const result = run.summary;
  return <div className="space-y-1 text-sm">
    <div><Badge variant={run.status === 'success' ? 'default' : run.status === 'running' || run.status === 'busy' ? 'outline' : 'destructive'}>{subscriptionJobStatusLabels[run.status]}</Badge></div>
    <p>Bắt đầu: {time(run.started_at)}{run.finished_at ? ` · Kết thúc: ${time(run.finished_at)}` : ' · Chưa ghi nhận kết thúc'}</p>
    <p className="text-xs text-muted-foreground break-all">Mã lượt chạy: {run.id}</p>
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
      <div><h2 className="font-semibold">Tác vụ kiểm tra thuê bao</h2><p className="text-sm text-muted-foreground">Chỉ xem · phạm vi toàn cụm · không chạy tác vụ từ màn hình này</p></div>
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
        {data.active && <div className="rounded-md border p-3 space-y-2"><h3 className="font-medium">Lượt đang chạy</h3><RunSummary run={data.active} /></div>}
        {data.latest_failure && <div className="rounded-md border border-destructive p-3 space-y-2"><h3 className="font-medium">Lỗi hoặc gián đoạn gần nhất</h3><RunSummary run={data.latest_failure} /></div>}
        <div className="rounded-md border p-3 text-sm space-y-1">
          <h3 className="font-medium">Cần xử lý theo điều kiện cũ tại thời điểm kiểm tra</h3>
          <p>{data.backlog.eligible_grace} đủ điều kiện sang ân hạn · {data.backlog.eligible_suspend} đủ điều kiện tạm khóa.</p>
          <p className={data.backlog.unhandled_expired_active > 0 ? 'font-medium text-destructive' : ''}>{data.backlog.unhandled_expired_active} active đã hết hạn chưa được điều kiện cũ bao phủ.</p>
          <p className="text-muted-foreground">Đo lúc {time(data.backlog.checked_at)}; không phải toàn bộ backlog hay kết quả của lượt chạy gần nhất.</p>
        </div>
        <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Lịch sử gần nhất ({data.runs.length}/25 lượt tối đa)</summary>
          {data.runs.length === 0 ? <p className="pt-3 text-sm">Chưa có lịch sử được ghi nhận.</p> : <ol className="divide-y">{data.runs.map(run => <li className="py-3" key={run.id}><RunSummary run={run} /></li>)}</ol>}
        </details>
        <p className="text-xs text-muted-foreground">Kiểm tra lúc {time(data.checked_at)}. Tự tải lại mỗi 60 giây khi màn hình đang mở và hoạt động.</p>
      </>}
  </section>;
}
