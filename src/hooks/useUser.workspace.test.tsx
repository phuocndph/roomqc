import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountProfileError } from '@/lib/account-profile-error'
import { useUser } from './useUser'

const state = vi.hoisted(() => ({
  workspace: { workspace: { id: 'workspace-A', tenantId: 'tenant-A' as string | null } } as { workspace: { id: string; tenantId: string | null } } | null,
  profile: { data: { id: 'actor', tenant_id: 'tenant-A' }, error: null } as { data: { id: string; tenant_id: string } | null; error: Error | null },
  from: vi.fn(),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'actor' } }) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { get workspace() { return state.workspace } } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  state.from(table)
  return { select: () => ({ eq: () => table === 'users' ? { maybeSingle: async () => state.profile }
    : Promise.resolve({ data: [{ role: 'staff' }], error: null }) }) }
} } }))

const clients: QueryClient[] = []
function openProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } })
  clients.push(client)
  return renderHook(() => useUser(), { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}
beforeEach(() => {
  state.from.mockClear()
  state.workspace = { workspace: { id: 'workspace-A', tenantId: 'tenant-A' } }
  state.profile = { data: { id: 'actor', tenant_id: 'tenant-A' }, error: null }
})
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear() })

describe('profile workspace boundary and recoverable failures', () => {
  it('refuses another tenant before exposing its profile or fetching its roles, without retrying', async () => {
    state.profile.data!.tenant_id = 'tenant-B'
    const { result } = openProfile()
    await waitFor(() => expect(result.current.error).toBeInstanceOf(AccountProfileError))
    expect(result.current.error).toMatchObject({ code: 'workspace_mismatch' })
    expect(result.current.user).toBeUndefined()
    expect(result.current.role).toBeUndefined()
    expect(state.from.mock.calls).toEqual([['users']])
  })
  it('keeps an unconfirmed workspace separate from a network failure', async () => {
    state.workspace!.workspace.tenantId = null
    const { result } = openProfile()
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'workspace_unconfirmed' }))
    expect(result.current.user).toBeUndefined()
    expect(state.from.mock.calls).toEqual([['users']])
  })
  it('retains one bounded retry for a real transport failure', async () => {
    const failure = new Error('Failed to fetch')
    state.profile = { data: null, error: failure }
    const { result } = openProfile()
    await waitFor(() => expect(result.current.error).toBe(failure))
    expect(state.from.mock.calls).toEqual([['users'], ['users']])
  })
  it('loads the matching employee profile and role normally', async () => {
    const { result } = openProfile()
    await waitFor(() => expect(result.current.role).toBe('staff'))
    expect(result.current.tenantId).toBe('tenant-A')
    expect(result.current.error).toBeNull()
  })
  it('preserves first-time onboarding when no workspace binding or profile exists', async () => {
    state.workspace = null
    state.profile.data = null
    const { result } = openProfile()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
