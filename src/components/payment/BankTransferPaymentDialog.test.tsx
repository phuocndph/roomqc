import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BankTransferPaymentDialog } from './BankTransferPaymentDialog';
import { formatVNCurrency } from '@/lib/pricing';
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), tenantId: 'tenant-fixture' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: state.from } }));
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenantId }) }));
const quote = { quote_id: 'server-quote', billed_rooms: 3, duration_days: 30,
  price_per_room_daily: 2400, subtotal: 216000, discount_amount: 0, total_amount: 216000,
  period_start: '2026-10-17', period_end: '2026-11-16', currency: 'VND', checkout_enabled: false };
const draft = { invoice_id: 'server-invoice', non_payable: true, checkout_enabled: false };
function mount(extra = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const callback = vi.fn();
  const props = { open: true, onOpenChange: vi.fn(), kind: 'extend' as const, rooms: 3, durationDays: 30, onPaymentCreated: callback, ...extra };
  const view = render(<QueryClientProvider client={client}><BankTransferPaymentDialog {...props} /></QueryClientProvider>);
  return { ...view, callback, client, props };
}
describe('server-priced draft dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.tenantId = 'tenant-fixture';
    state.rpc.mockImplementation(async (name: string) => ({ data: name === 'create_subscription_quote' ? quote : draft, error: null }));
  });
  it('opens a server quote, not an automatic invoice or client-priced insert', async () => {
    mount();
    expect(await screen.findAllByText(formatVNCurrency(216000))).toHaveLength(2);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith('create_subscription_quote', {
      p_request_id: expect.any(String), p_kind: 'extend', p_rooms: 3, p_duration_days: 30,
    });
    expect(state.from).not.toHaveBeenCalled();
    expect(screen.getByText('Không chuyển khoản cho bản nháp này.')).toBeInTheDocument();
  });
  it('deduplicates clicks and waits for an explicit click before navigating', async () => {
    let finish!: (value: unknown) => void;
    state.rpc.mockImplementation((name: string) => name === 'create_subscription_quote'
      ? Promise.resolve({ data: quote, error: null }) : new Promise(resolve => { finish = resolve; }));
    const { callback } = mount();
    const button = await screen.findByRole('button', { name: 'Tạo bản nháp' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(button);
    expect(state.rpc.mock.calls.filter(c => c[0] === 'create_subscription_checkout_draft')).toHaveLength(1);
    finish({ data: draft, error: null });
    expect(await screen.findByRole('button', { name: 'Xem bản nháp' })).toBeInTheDocument();
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản nháp' }));
    expect(callback).toHaveBeenCalledWith('server-invoice');
  });
  it('uses the same draft request ID after an uncertain network response', async () => {
    let calls = 0;
    state.rpc.mockImplementation(async (name: string) => name === 'create_subscription_quote' ? { data: quote, error: null }
      : ++calls === 1 ? { data: null, error: { message: 'network' } } : { data: draft, error: null });
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo bản nháp' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    await screen.findByRole('button', { name: 'Xem bản nháp' });
    const callsToCreate = state.rpc.mock.calls.filter(c => c[0] === 'create_subscription_checkout_draft');
    expect(callsToCreate[0][1]).toEqual(callsToCreate[1][1]);
    expect(Object.keys(callsToCreate[0][1]).sort()).toEqual(['p_quote_id', 'p_request_id']);
  });
  it('shows actionable conflicts without creating another quote or changing its price', async () => {
    state.rpc.mockImplementation(async (name: string) => name === 'create_subscription_quote' ? { data: quote, error: null }
      : { error: { message: 'PENDING_SUBSCRIPTION_ORDER_EXISTS' }, data: null });
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo bản nháp' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(await screen.findByText(/Bạn còn đơn đang chờ/)).toBeInTheDocument();
    expect(state.rpc.mock.calls.filter(c => c[0] === 'create_subscription_quote')).toHaveLength(1);
  });
  it('requests add-on pricing without a browser-derived number of remaining days', async () => {
    mount({ kind: 'add_rooms', durationDays: undefined });
    await screen.findAllByText(formatVNCurrency(216000));
    expect(state.rpc).toHaveBeenCalledWith('create_subscription_quote', expect.objectContaining({
      p_kind: 'add_rooms', p_rooms: 3, p_duration_days: undefined,
    }));
  });
  it('does not issue a quote without a tenant session', () => {
    state.tenantId = '';
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('đăng nhập lại');
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
