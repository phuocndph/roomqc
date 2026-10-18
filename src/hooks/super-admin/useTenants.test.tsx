import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTenantDirectoryRequest } from '@/lib/admin-tenant-directory';
import { useTenants } from './useTenants';

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => state.rpc(...args) } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const empty = { items: [], total: 0, page: 0, page_size: 25, checked_at: '2026-10-18T00:00:00Z', plans: [] };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ page, search }) => useTenants({ ...defaultTenantDirectoryRequest, page, searchQuery: search }),
    { wrapper, initialProps: { page: 0, search: '' } });
}
describe('server tenant directory', () => {
  beforeEach(() => state.rpc.mockReset().mockResolvedValue({ data: empty, error: null }));
  it('calls one bounded server query; filter and page changes create new queries', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(empty);
    expect(state.rpc).toHaveBeenLastCalledWith('admin_tenant_directory_page', {
      p_page: 0, p_page_size: 25, p_search: '', p_status: 'all', p_plan: null,
      p_approval: 'all', p_sort: 'created_at', p_desc: true,
    });
    rerender({ page: 1, search: '  hotel  ' });
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2));
    expect(state.rpc.mock.calls[1][1]).toMatchObject({ p_page: 1, p_search: 'hotel' });
  });
  it('exposes an RPC failure instead of a zero count', async () => {
    const failure = { code: '42501', message: 'session expired' };
    state.rpc.mockResolvedValue({ data: null, error: failure });
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeUndefined();
  });
  it('rejects a partial or incompatible server response', async () => {
    state.rpc.mockResolvedValue({ data: { ...empty, total: 100 }, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
