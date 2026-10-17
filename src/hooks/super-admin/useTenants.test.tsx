import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTenants } from './useTenants';

const state = vi.hoisted(() => ({ from: vi.fn(), tenants: vi.fn(), invoices: vi.fn(), activities: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...args: unknown[]) => state.from(...args) } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useTenants(), { wrapper });
}

describe('admin tenant query truthfulness', () => {
  beforeEach(() => {
    state.tenants.mockReset().mockResolvedValue({ data: [{ id: 'tenant-one', name: 'Trial', subscription_status: 'trial', registered_rooms: 0 }], error: null });
    state.invoices.mockReset().mockResolvedValue({ data: [], error: null });
    state.activities.mockReset().mockResolvedValue({ data: [], error: null });
    state.from.mockReset().mockImplementation((table: string) => {
      if (table === 'tenants') return { select: () => ({ order: state.tenants }) };
      if (table === 'invoices') return { select: () => ({ in: () => ({ eq: state.invoices }) }) };
      if (table === 'activity_logs') return { select: () => ({ in: () => ({ order: state.activities }) }) };
      throw new Error('Unexpected table');
    });
  });
  it('keeps the trial state with zero paid rooms', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ actual_status: 'trial', has_subscription: false });
  });
  it('does not query invoices or logs for an empty tenant list', async () => {
    state.tenants.mockResolvedValue({ data: [], error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(state.from).toHaveBeenCalledTimes(1);
  });
  it.each(['tenants', 'invoices', 'activities'] as const)('exposes a %s query failure instead of a zero/empty success', async table => {
    const failure = new Error(`${table} unavailable`);
    state[table].mockResolvedValue({ data: null, error: failure });
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeUndefined();
  });
});
