import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionJobMonitor } from './SubscriptionJobMonitor';

const state = vi.hoisted(() => ({ rpc: vi.fn(), recovery: vi.fn(), loggedIn: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.loggedIn ? { id: 'admin-one' } : null, session: state.loggedIn ? { access_token: 'fixture-only' } : null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => args[0] === 'admin_recover_subscription_status_run'
  ? state.recovery(...args) : ({ abortSignal: () => state.rpc(...args) }) } }));
const stamp = '2026-10-17T12:00:00Z';
const page = () => ({ job: 'check-subscription-status', scope: 'cluster', checked_at: stamp, scheduler_status: 'not_observed', last_success_at: null, active: null, latest_failure: null, runs: [], backlog: { eligible_grace: 4, eligible_suspend: 2, unhandled_expired_active: 3, checked_at: stamp, definition: 'legacy_predicates_only' } });
const run = (status = 'running') => ({ id: '00000000-0000-4000-8000-000000000001', job: 'check-subscription-status', scope: 'cluster', status, started_at: stamp, finished_at: ['running', 'interrupted'].includes(status) ? null : stamp, deadline_at: '2026-10-17T12:05:00Z', blocked_by: status === 'busy' ? '00000000-0000-4000-8000-000000000009' : null, summary: null });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SubscriptionJobMonitor /></QueryClientProvider>);
  return { client, ...view, rerenderPanel: () => view.rerender(<QueryClientProvider client={client}><SubscriptionJobMonitor /></QueryClientProvider>) };
}

describe('read-only subscription job monitor', () => {
  beforeEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); state.loggedIn = true; state.recovery.mockReset(); state.rpc.mockReset().mockResolvedValue({ data: page(), error: null }); });
  it('shows unknown last success and unknown schedule, scoped current backlog, no write action', async () => {
    setup();
    expect(await screen.findByText('Chưa có lần chạy thành công được ghi nhận')).toBeInTheDocument();
    expect(screen.getByText('Chưa xác minh lịch chạy')).toBeInTheDocument();
    expect(screen.getByText('4 đủ điều kiện sang ân hạn · 2 đủ điều kiện tạm khóa.')).toBeInTheDocument();
    expect(screen.getByText('3 gói đang dùng hoặc dùng thử đã hết hạn nhưng chưa được điều kiện cũ bao phủ.')).toBeInTheDocument();
    expect(screen.getByText(/không phải toàn bộ backlog/)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(state.rpc).toHaveBeenCalledWith('admin_subscription_job_monitor');
  });
  it('keeps active, interrupted and busy separate from last success without inventing success', async () => {
    state.rpc.mockResolvedValue({ data: { ...page(), active: run(), latest_failure: { ...run('interrupted'), id: '00000000-0000-4000-8000-000000000002' }, runs: [run('busy')] }, error: null });
    setup();
    expect(await screen.findByText('Đang chạy')).toBeInTheDocument();
    expect(screen.getByText('Bỏ qua vì đang bận')).toBeInTheDocument();
    expect(screen.getByText('Bị gián đoạn — cần kiểm tra')).toBeInTheDocument();
    expect(screen.getByText('Cần kiểm tra thủ công, không tự chạy lại.')).toBeInTheDocument();
    expect(screen.getByText('Chưa có lần chạy thành công được ghi nhận')).toBeInTheDocument();
    expect(screen.queryByText('Thành công', { exact: true })).not.toBeInTheDocument();
  });
  it('does not present partial counts or staff not run as a complete successful result', async () => {
    state.rpc.mockResolvedValue({ data: { ...page(), runs: [{ ...run('failed'), summary: { subscription_status: 'failed', staff_status: 'not_run', to_grace_period: 1, to_suspended: 0, notifications_sent: 0, notifications_failed: 2, transition_outcome_unknown: true, recovery_required: true, error_codes: ['fixture_error'] } }] }, error: null });
    setup();
    expect(await screen.findByText('Thất bại')).toBeInTheDocument();
    expect(screen.getByText(/Nhân sự: chưa chạy/)).toBeInTheDocument();
    expect(screen.getByText(/Không coi các số trên là toàn bộ thay đổi/)).toBeInTheDocument();
    expect(screen.queryByText('fixture_error')).not.toBeInTheDocument();
  });
  it('shows a timed out active marker as blocking instead of rejecting the response', async () => {
    state.rpc.mockResolvedValue({ data: { ...page(), active: run('interrupted') }, error: null });
    setup();
    expect(await screen.findByText('Lượt gián đoạn đang chặn tác vụ mới')).toBeInTheDocument();
    expect(screen.getByText('Cần kiểm tra thủ công, không tự chạy lại.')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
  it.each([
    [{ code: '42501' }, /Phiên quản trị/],
    [{ code: 'PGRST202' }, /cập nhật schema/],
    [new TypeError('Failed to fetch'), /kết nối hoặc máy chủ/],
  ])('hides stale evidence on error and reloads without running a job %#', async (error, message) => {
    setup();
    await screen.findByText('4 đủ điều kiện sang ân hạn · 2 đủ điều kiện tạm khóa.');
    state.rpc.mockResolvedValue({ data: null, error });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại giám sát' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).toHaveTextContent('Dữ liệu cũ đã được ẩn');
    expect(screen.queryByText(/4 đủ điều kiện/)).not.toBeInTheDocument();
    state.rpc.mockResolvedValue({ data: page(), error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại giám sát' }));
    expect(await screen.findByText('4 đủ điều kiện sang ân hạn · 2 đủ điều kiện tạm khóa.')).toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledTimes(3);
    expect(state.rpc.mock.calls.every(args => args[0] === 'admin_subscription_job_monitor')).toBe(true);
  });
  it('rejects an invalid DTO instead of showing empty success', async () => {
    state.rpc.mockResolvedValue({ data: {}, error: null }); setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('không đúng định dạng');
    expect(screen.queryByText(/Chưa có lịch sử/)).not.toBeInTheDocument();
  });
  it('hides evidence on logout and clears unmounted query cache', async () => {
    const view = setup(); await screen.findByText('4 đủ điều kiện sang ân hạn · 2 đủ điều kiện tạm khóa.');
    state.loggedIn = false; view.rerenderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('Đăng nhập');
    expect(screen.queryByText(/4 đủ điều kiện/)).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    view.unmount();
    await waitFor(() => expect(view.client.getQueryCache().getAll()).toHaveLength(0));
  });
  it('refetches every 60 seconds while mounted, then stops after unmount', async () => {
    vi.useFakeTimers();
    try {
      const view = setup();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(state.rpc).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
      expect(state.rpc).toHaveBeenCalledTimes(2);
      view.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
      expect(state.rpc).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it('restores and replays an ambiguous recovery after remount even when the active run disappeared', async () => {
    const active = { ...run('interrupted'), execution_protocol: 'atomic_v1', execution_scope: { kind: 'cluster' } };
    state.rpc.mockResolvedValue({ data: { ...page(), active }, error: null });
    const first = setup();
    fireEvent.change(await screen.findByLabelText('Lý do giải phóng (ít nhất 10 ký tự)'), { target: { value: 'Đã đối chiếu lượt chạy bị gián đoạn' } });
    state.recovery.mockResolvedValueOnce({ data: null, error: { message: 'lost response' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giải phóng lượt gián đoạn' }));
    await screen.findByRole('button', { name: 'Thử lại lệnh giải phóng' });
    const args = state.recovery.mock.calls[0][1];
    first.unmount();
    state.rpc.mockResolvedValue({ data: page(), error: null });
    state.recovery.mockResolvedValueOnce({ data: { run_id: args.p_run_id, request_id: args.p_request_id, released: true, replayed: true }, error: null });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại lệnh giải phóng' }));
    await screen.findByText(/Đã ghi nhận giải phóng/);
    expect(state.recovery.mock.calls[1][1]).toEqual(args);
    expect(window.sessionStorage.length).toBe(0);
  });
  it('cannot release legacy runs and sends no command if persistence fails', async () => {
    state.rpc.mockResolvedValue({ data: { ...page(), active: run('interrupted') }, error: null });
    const legacy = setup(); await screen.findByText(/Lượt cũ chưa có cơ chế DB/);
    expect(screen.queryByRole('button', { name: 'Giải phóng lượt gián đoạn' })).not.toBeInTheDocument();
    legacy.unmount();
    state.rpc.mockResolvedValue({ data: { ...page(), active: { ...run('interrupted'), execution_protocol: 'atomic_v1', execution_scope: { kind: 'cluster' } } }, error: null });
    setup(); fireEvent.change(await screen.findByLabelText('Lý do giải phóng (ít nhất 10 ký tự)'), { target: { value: 'Đã kiểm tra và đối chiếu' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    fireEvent.click(screen.getByRole('button', { name: 'Giải phóng lượt gián đoạn' }));
    await screen.findByText(/Không thể bảo toàn lệnh phục hồi/);
    expect(state.recovery).not.toHaveBeenCalled();
  });
  it('shows outbox backlog separately from subscription transitions', async () => {
    state.rpc.mockResolvedValue({ data: { ...page(), outbox: { pending: 4, due: 2, with_error: 1, delivered: 6, obsolete: 3,
      oldest_pending_at: stamp, checked_at: stamp } }, error: null });
    setup(); expect(await screen.findByText('4 đang chờ · 2 đến hạn thử · 1 đang có lỗi.')).toBeInTheDocument();
    expect(screen.getByText(/Không bao gồm email\/push/)).toBeInTheDocument();
  });
});
