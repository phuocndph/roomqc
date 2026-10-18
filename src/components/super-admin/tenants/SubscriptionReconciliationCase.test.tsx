import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionReconciliationCase } from './SubscriptionReconciliationCase';

const state = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), session: true, actor: '10000000-0000-4000-8000-000000000004' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: state.session ? { user: { id: state.actor } } : null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (name: string, args: unknown) => name === 'admin_subscription_reconciliation_case'
  ? { abortSignal: () => state.read(name, args) } : state.mutate(name, args) } }));
const tenant = '10000000-0000-4000-8000-000000000001';
const payment = '10000000-0000-4000-8000-000000000002';
const id = '10000000-0000-4000-8000-000000000003';
const actor = '10000000-0000-4000-8000-000000000004';
const date = '2026-10-17T00:00:00Z';
const item = { id, payment_id: payment, tenant_id: tenant, invoice_id: null, status: 'open', version: 1,
  created_by: actor, created_at: date, updated_at: date,
  source_snapshot: { captured_at: date, payment_status: 'pending', amount: 90000, currency: 'VND', invoice_status: null, invoice_same_tenant: false } };
const event = { id: actor, case_id: id, version: 1, actor_id: actor, request_id: actor, action: 'create',
  note: 'Ghi chú có sẵn', before_state: null, after_state: item, created_at: date };
const empty = { source: { id: payment, tenant_id: tenant, can_create: true }, case: null,
  events: [], has_more: false, next_before_version: null, checked_at: date };
const existing = { ...empty, case: item, events: [event] };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SubscriptionReconciliationCase tenantId={tenant} paymentId={payment} onClose={() => {}} /></QueryClientProvider>);
  return { ...view, rerenderCase: (nextTenant: string, nextPayment: string) => view.rerender(<QueryClientProvider client={client}><SubscriptionReconciliationCase tenantId={nextTenant} paymentId={nextPayment} onClose={() => {}} /></QueryClientProvider>) };
}

describe('operational reconciliation case notebook (mock server)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    state.actor = actor;
    state.session = true;
    state.read.mockReset().mockResolvedValue({ data: empty, error: null });
    state.mutate.mockReset().mockResolvedValue({ data: { case: item, created: true }, error: null });
  });
  it('loads only an exact source and sends no client amount, invoice or tenant on creation', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: '  Kiểm tra nguồn  ' } });
    state.read.mockResolvedValue({ data: existing, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    await screen.findByText(/Máy chủ đã xác nhận/);
    expect(state.read).toHaveBeenCalledWith('admin_subscription_reconciliation_case', { p_payment_id: payment, p_before_version: null });
    expect(state.mutate).toHaveBeenCalledWith('admin_mutate_subscription_reconciliation_case', {
      p_payment_id: payment, p_request_id: expect.any(String), p_action: 'create', p_note: 'Kiểm tra nguồn', p_expected_version: null,
    });
    expect(screen.getByText(/không đổi hóa đơn/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thanh toán|Kết luận|Phân công/ })).not.toBeInTheDocument();
  });
  it('reuses the exact request ID on an ambiguous network failure without fake success', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Cần kiểm tra' } });
    state.mutate.mockRejectedValueOnce(new Error('network'));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/Máy chủ đã xác nhận/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Lý do mở hồ sơ')).toHaveValue('Cần kiểm tra');
    state.read.mockResolvedValue({ data: existing, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await screen.findByText(/Máy chủ đã xác nhận/);
    expect(state.mutate.mock.calls[1][1]).toEqual(state.mutate.mock.calls[0][1]);
  });
  it('keeps exact note command after lost response then reload reveals a newer version', async () => {
    state.read.mockResolvedValue({ data: existing, error: null });
    setup();
    fireEvent.change(await screen.findByLabelText('Ghi chú mới'), { target: { value: 'Đã gửi nhưng mất phản hồi' } });
    state.mutate.mockRejectedValueOnce(new Error('lost response after commit'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    await screen.findByRole('alert');
    const updated = { ...item, version: 2 };
    state.read.mockResolvedValue({ data: { ...existing, case: updated,
      events: [{ ...event, id: payment, version: 2, action: 'note', before_state: item, after_state: updated }, event] }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại hồ sơ' }));
    await screen.findByText('Hồ sơ đang mở · Phiên bản 2');
    expect(screen.getByLabelText('Ghi chú mới')).toBeDisabled();
    state.mutate.mockResolvedValue({ data: { case: updated, created: false }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await screen.findByText(/Máy chủ đã xác nhận/);
    expect(state.mutate.mock.calls[1][1]).toEqual(state.mutate.mock.calls[0][1]);
    expect(state.mutate.mock.calls[1][1].p_expected_version).toBe(1);
  });
  it('does not claim the submitted reason was saved if another admin already created the case', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Nội dung của tôi' } });
    state.mutate.mockResolvedValue({ data: { case: item, created: false }, error: null });
    state.read.mockResolvedValue({ data: existing, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    await screen.findByText(/Nội dung bạn nhập chưa được lưu/);
    expect(screen.queryByText(/Máy chủ đã xác nhận lưu/)).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Ghi chú mới')).toHaveValue('Nội dung của tôi');
  });
  it('includes the server version on note writes and preserves text on version conflict', async () => {
    state.read.mockResolvedValue({ data: existing, error: null });
    state.mutate.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'CASE_VERSION_CONFLICT' } });
    setup(); fireEvent.change(await screen.findByLabelText('Ghi chú mới'), { target: { value: 'Ghi chú sau' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tải lại');
    expect(state.mutate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ p_expected_version: 1, p_action: 'note' }));
    expect(screen.getByLabelText('Ghi chú mới')).toHaveValue('Ghi chú sau');
    expect(screen.queryByText(/Máy chủ đã xác nhận/)).not.toBeInTheDocument();
  });
  it('shows missing migration explicitly and offers no write action', async () => {
    state.read.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    setup(); expect(await screen.findByRole('alert')).toHaveTextContent('chưa được cài đặt');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it('hides previously loaded evidence when mutation permission is revoked', async () => {
    state.read.mockResolvedValue({ data: existing, error: null });
    state.mutate.mockResolvedValue({ data: null, error: { code: '42501' } });
    setup(); await screen.findByText('Ghi chú có sẵn');
    fireEvent.change(screen.getByLabelText('Ghi chú mới'), { target: { value: 'Không lưu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('không còn đủ quyền');
    expect(screen.queryByText('Ghi chú có sẵn')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('hides stale history while refreshing and after a read authorization failure', async () => {
    state.read.mockResolvedValueOnce({ data: existing, error: null }); setup();
    await screen.findByText('Ghi chú có sẵn');
    let resolve: (value: unknown) => void = () => {};
    state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại hồ sơ' }));
    await screen.findByText('Đang tải hồ sơ mới nhất…');
    expect(screen.queryByText('Ghi chú có sẵn')).not.toBeInTheDocument();
    resolve({ data: null, error: { code: '42501' } });
    await screen.findByRole('alert');
    expect(screen.queryByText('Ghi chú có sẵn')).not.toBeInTheDocument();
  });
  it('does not read without a session, does not enable create for ineligible source', async () => {
    state.session = false; const view = setup();
    expect(screen.getByRole('alert')).toHaveTextContent('đăng nhập');
    expect(state.read).not.toHaveBeenCalled();
    view.unmount(); state.session = true;
    state.read.mockResolvedValue({ data: { ...empty, source: { ...empty.source, can_create: false } }, error: null });
    setup(); await screen.findByText('Chưa có hồ sơ kiểm tra cho giao dịch này.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('clears unsaved contents on tenant/source switch and rejects mixed-scope response', async () => {
    const view = setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Không mang sang khách khác' } });
    view.rerenderCase(actor, payment);
    expect(screen.queryByDisplayValue('Không mang sang khách khác')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không xác nhận được');
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it('disables double submit and retains the typed note while saving', async () => {
    let resolve: (value: unknown) => void = () => {};
    state.mutate.mockImplementation(() => new Promise(done => { resolve = done; }));
    setup(); fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Một lần' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    expect(screen.getByRole('button', { name: 'Đang lưu…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ẩn chi tiết hồ sơ' })).toBeDisabled();
    expect(state.mutate).toHaveBeenCalledTimes(1);
    resolve({ data: null, error: { code: 'PT409', message: 'CASE_SOURCE_NOT_ELIGIBLE' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' })).toBeEnabled());
  });
  it('persists before dispatch and replays the same note/version after a full remount', async () => {
    state.read.mockResolvedValue({ data: existing, error: null });
    state.mutate.mockImplementationOnce(async (_name, args) => {
      expect(sessionStorage.length).toBe(1);
      expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!).command.requestId).toBe(args.p_request_id);
      throw new Error('response lost after commit');
    });
    const view = setup();
    fireEvent.change(await screen.findByLabelText('Ghi chú mới'), { target: { value: 'Giữ nguyên qua F5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    await screen.findByRole('alert');
    const original = state.mutate.mock.calls[0][1];
    view.unmount();
    const updated = { ...item, version: 2 };
    state.read.mockResolvedValue({ data: { ...existing, case: updated,
      events: [{ ...event, id: payment, version: 2, action: 'note', before_state: item, after_state: updated }, event] }, error: null });
    setup();
    expect(await screen.findByLabelText('Ghi chú mới')).toHaveValue('Giữ nguyên qua F5');
    expect(screen.getByLabelText('Ghi chú mới')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu ghi chú' })).not.toBeInTheDocument();
    state.mutate.mockResolvedValue({ data: { case: updated, created: false }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await screen.findByText(/Máy chủ đã xác nhận/);
    expect(state.mutate.mock.calls[1][1]).toEqual(original);
    expect(sessionStorage.length).toBe(0);
  });
  it('keeps a command while a send is in flight and the notebook unmounts', async () => {
    state.mutate.mockImplementationOnce(() => new Promise(() => {}));
    const view = setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Đang gửi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    const original = state.mutate.mock.calls[0][1];
    view.unmount(); setup();
    await screen.findByLabelText('Lý do mở hồ sơ');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await screen.findByText(/Máy chủ đã xác nhận/);
    expect(state.mutate.mock.calls[1][1]).toEqual(original);
  });
  it('isolates commands by actor and source, restoring them only for the original scope', async () => {
    state.mutate.mockRejectedValue(new Error('network'));
    const view = setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Riêng người A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    await screen.findByRole('alert');
    state.actor = id; view.rerenderCase(tenant, payment);
    expect(await screen.findByLabelText('Lý do mở hồ sơ')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Thử lại lệnh trước' })).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(1);
    state.actor = actor; view.rerenderCase(tenant, payment);
    expect(await screen.findByLabelText('Lý do mở hồ sơ')).toHaveValue('Riêng người A');
    expect(screen.getByRole('button', { name: 'Thử lại lệnh trước' })).toBeEnabled();
  });
  it('does not release an unknown command when authorization or the RPC disappears on replay', async () => {
    state.mutate.mockRejectedValueOnce(new Error('lost response'));
    const view = setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Chờ xác minh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    await screen.findByRole('alert');
    state.mutate.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await screen.findByText(/không còn đủ quyền/);
    expect(sessionStorage.length).toBe(1);
    view.unmount(); setup();
    await screen.findByLabelText('Lý do mở hồ sơ');
    state.mutate.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await screen.findByText(/chưa được cài đặt/);
    expect(sessionStorage.length).toBe(1);
  });
  it('does not send when durable session storage is blocked', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Không gửi mất ID' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa gửi thêm lệnh');
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Thử lại lệnh trước' })).toBeDisabled();
  });
  it('blocks new IDs without deleting a corrupt scoped command', async () => {
    const key = `roomqc:case-pending:v1:${actor}:${tenant}:${payment}`;
    sessionStorage.setItem(key, '{broken');
    setup();
    await screen.findByLabelText('Lý do mở hồ sơ');
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa gửi thêm lệnh');
    expect(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' })).toBeDisabled();
    expect(sessionStorage.getItem(key)).toBe('{broken');
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it('does not allow a new command if receipt storage cleanup fails', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Đã nhận receipt' } });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa gửi thêm lệnh');
    expect(screen.queryByText(/Máy chủ đã xác nhận/)).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(1);
    expect(screen.getByRole('button', { name: 'Thử lại lệnh trước' })).toBeDisabled();
  });
  it('retains pending evidence after an invalid receipt or request-ID conflict', async () => {
    state.mutate.mockResolvedValueOnce({ data: { case: { ...item, tenant_id: id }, created: true }, error: null });
    setup();
    fireEvent.change(await screen.findByLabelText('Lý do mở hồ sơ'), { target: { value: 'Phải đúng nguồn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ kiểm tra' }));
    await screen.findByRole('alert');
    const original = state.mutate.mock.calls[0][1];
    expect(sessionStorage.length).toBe(1);
    state.mutate.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'CASE_REQUEST_ID_REUSED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2));
    expect(state.mutate.mock.calls[1][1]).toEqual(original);
    expect(sessionStorage.length).toBe(1);
    expect(screen.queryByRole('button', { name: 'Tạo hồ sơ kiểm tra' })).not.toBeInTheDocument();
  });
  it('releases a persisted command after an explicit post-receipt-lookup version rejection', async () => {
    state.read.mockResolvedValue({ data: existing, error: null });
    state.mutate.mockRejectedValueOnce(new Error('network'));
    const view = setup();
    fireEvent.change(await screen.findByLabelText('Ghi chú mới'), { target: { value: 'Phiên bản cũ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    await screen.findByRole('alert'); view.unmount(); setup();
    await screen.findByLabelText('Ghi chú mới');
    state.mutate.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'CASE_VERSION_CONFLICT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại lệnh trước' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toBeEnabled());
    expect(sessionStorage.length).toBe(0);
    expect(screen.getByLabelText('Ghi chú mới')).toHaveValue('Phiên bản cũ');
  });
});
