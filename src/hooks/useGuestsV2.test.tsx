import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAllGuests, useGuestStats, useGuestsV2, exportGuestsToCSV } from './useGuestsV2'
import type { Guest } from './useGuests'

const state = vi.hoisted(() => ({ rows: [] as Guest[], requests: [] as { calls: [string, ...unknown[]][]; from: number; to: number }[], errorFrom: -1, tenantId: 'tenant-a' }))
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ tenant: { id: state.tenantId } }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const request = { calls: [] as [string, ...unknown[]][], from: 0, to: 499 }
    state.requests.push(request)
    const query: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'in', 'order', 'or', 'gte', 'range', 'abortSignal']) {
      query[name] = (...args: unknown[]) => {
        request.calls.push([name, ...args])
        if (name === 'range') [request.from, request.to] = args as [number, number]
        return query
      }
    }
    query.then = (resolve: (value: unknown) => void) => Promise.resolve(resolve({
      data: request.from === state.errorFrom ? null : state.rows.slice(request.from, request.to + 1),
      error: request.from === state.errorFrom ? new Error('offline') : null,
      count: state.rows.length,
    }))
    return query
  },
} }))
const guest = (id: number, fields: Partial<Guest> = {}): Guest => ({ id: String(id), tenant_id: 'tenant-a', full_name: 'Khách ' + id, vip_level: 'normal', total_stays: 1, total_spent: 100, created_at: new Date().toISOString(), ...fields }) as Guest
function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

describe('complete guest reads', () => {
  beforeEach(() => {
    state.rows = Array.from({ length: 1207 }, (_, id) => guest(id))
    state.requests = []
    state.errorFrom = -1
    state.tenantId = 'tenant-a'
  })
  it('exports all matches rather than the visible 50, retaining tenant/search/segment/order on every page', async () => {
    const controller = new AbortController()
    const result = await fetchAllGuests('tenant-a', { segment: 'vip', search: 'An%(),', sortBy: 'full_name', sortDir: 'asc', page: 3, pageSize: 50 }, { signal: controller.signal })
    expect(result).toHaveLength(1207)
    for (const { calls } of state.requests) {
      expect(calls).toContainEqual(['eq', 'tenant_id', 'tenant-a'])
      expect(calls).toContainEqual(['in', 'vip_level', ['gold', 'vip', 'platinum']])
      expect(calls).toContainEqual(['or', 'full_name.ilike.%An%,phone.ilike.%An%,email.ilike.%An%,id_number.ilike.%An%'])
      expect(calls).toContainEqual(['order', 'full_name', { ascending: true, nullsFirst: false }])
      expect(calls).toContainEqual(['order', 'id', { ascending: true }])
      expect(calls).toContainEqual(['abortSignal', controller.signal])
    }
  })
  it('counts birthday matches after the first 1,000 and reuses them when paging', async () => {
    const month = new Date().getMonth() + 1
    const birthday = `1990-${String(month).padStart(2, '0')}-15`
    state.rows = [...Array.from({ length: 1200 }, (_, id) => guest(id)), ...Array.from({ length: 51 }, (_, id) => guest(id + 1200, { date_of_birth: birthday }))]
    const { client, wrapper } = harness()
    const { result, rerender, unmount } = renderHook(({ page }) => useGuestsV2({ segment: 'birthday', page }), { wrapper, initialProps: { page: 1 } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(51)
    expect(result.current.data?.rows).toHaveLength(50)
    expect(result.current.data?.rows[0].id).toBe('1200')
    const requestCount = state.requests.length
    rerender({ page: 2 })
    expect(result.current.data?.rows.map(g => g.id)).toEqual(['1250'])
    expect(result.current.data?.total).toBe(51)
    expect(state.requests).toHaveLength(requestCount)
    unmount(); client.clear()
  })
  it('computes all statistics beyond the former 5,000-record cap', async () => {
    state.rows = Array.from({ length: 5001 }, (_, id) => guest(id, { vip_level: 'vip', total_stays: 2 }))
    const { client, wrapper } = harness()
    const { result, unmount } = renderHook(() => useGuestStats(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ total: 5001, vip: 5001, returning: 5001, totalRevenue: 500100 })
    expect(state.requests.every(({ calls }) => calls.some(call => call[0] === 'eq' && call[1] === 'tenant_id' && call[2] === 'tenant-a'))).toBe(true)
    unmount(); client.clear()
  })
  it('keeps normal lists server-paged with the filtered total', async () => {
    const { client, wrapper } = harness()
    const { result, unmount } = renderHook(() => useGuestsV2({ page: 2 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].id).toBe('50')
    expect(result.current.data?.rows).toHaveLength(50)
    expect(result.current.data?.total).toBe(1207)
    expect(state.requests[0].calls).toContainEqual(['range', 50, 99])
    unmount(); client.clear()
  })
  it('rejects missing tenant and later failures instead of a partial export', async () => {
    await expect(fetchAllGuests('')).rejects.toThrow('doanh nghiệp')
    expect(state.requests).toHaveLength(0)
    state.errorFrom = 500
    await expect(fetchAllGuests('tenant-a')).rejects.toThrow('offline')
  })
  it('quotes CSV delimiters and neutralizes spreadsheet formulas', async () => {
    let blob: Blob
    vi.stubGlobal('URL', { createObjectURL: vi.fn((value: Blob) => { blob = value; return 'blob:test' }), revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      exportGuestsToCSV([guest(1, { full_name: '=1+1', phone: '+849123', email: 'a,"b"@test.vn' })])
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsText(blob)
      })
      expect(content).toContain("'=1+1,'+849123")
      expect(content).toContain('"a,""b""@test.vn"')
      expect(click).toHaveBeenCalledOnce()
    } finally { click.mockRestore(); vi.unstubAllGlobals() }
  })
})
