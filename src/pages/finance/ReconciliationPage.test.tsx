import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReconciliationPage from './ReconciliationPage';

const state = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: state.query }));
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'fixture-tenant' }) }));
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: ({ title, description }: { title: string; description: string }) =>
  <header><h1>{title}</h1><p>{description}</p></header> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

const fixture = { id: 'fixture-anomaly', anomaly_type: 'unmatched', status: 'open',
  sepay_amount: 50000, sepay_date: '2026-10-17T00:00:00Z', sepay_reference: 'A0-safe-reference',
  sepay_content: 'Local fixture only', amount_diff: null, expected_invoice_number: null, resolution_note: null };

beforeEach(() => {
  vi.clearAllMocks();
  state.query.mockReturnValue({ data: [fixture], isLoading: false, isError: false, isFetching: false, refetch: state.refetch });
});
afterEach(cleanup);

it('keeps legacy evidence accessible without provider or unaudited resolution controls', () => {
  render(<ReconciliationPage />);
  expect(screen.getByRole('heading', { name: 'Lịch sử đối soát thuê bao' })).toBeInTheDocument();
  expect(screen.getByText(/không phải các khoản thu của khách lưu trú/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Đối soát ngay' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Local fixture only');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Đánh dấu đã xử lý' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Bỏ qua' })).not.toBeInTheDocument();
});

it('shows a retryable error instead of empty success or stale evidence', () => {
  state.query.mockReturnValue({ data: [fixture], isError: true, isLoading: false, isFetching: false, refetch: state.refetch });
  render(<ReconciliationPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Không tải được lịch sử đối soát');
  expect(screen.queryByText('A0-safe-reference')).not.toBeInTheDocument();
  expect(screen.queryByText(/Không có bản ghi/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(state.refetch).toHaveBeenCalledOnce();
});

it('does not describe an empty legacy history as proof all payments match', () => {
  state.query.mockReturnValue({ data: [], isError: false, isLoading: false, isFetching: false });
  render(<ReconciliationPage />);
  expect(screen.getByText(/không phải xác nhận mọi giao dịch đã khớp/)).toBeInTheDocument();
});
