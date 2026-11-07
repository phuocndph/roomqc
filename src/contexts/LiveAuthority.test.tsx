import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// W1 open-browser matrix (2026-11-06): hotel assignment and tenant usage mode
// changed by an administrator must reach an already open session on focus or
// reconnect, without a reload.

const state = vi.hoisted(() => ({
  assigned: ['A1', 'A2'] as string[],
  preference: 'A1' as string | null,
  mode: 'full',
}))

const hotels = [
  { id: 'A1', name: 'Hotel A1' },
  { id: 'A2', name: 'Hotel A2' },
]

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const result = () => {
      if (table === 'user_hotels') return { data: state.assigned.map(hotel_id => ({ hotel_id })), error: null }
      if (table === 'user_preferences') return { data: state.preference ? { current_hotel_id: state.preference, preferences: {} } : null, error: null }
      if (table === 'tenants') return { data: { id: 'tenant-A', usage_mode: state.mode }, error: null }
      return { data: null, error: null }
    }
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.single = async () => result()
    builder.maybeSingle = async () => result()
    builder.upsert = async () => ({ error: null })
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
    return builder
  }
  return { supabase: { from } }
})
vi.mock('@/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'staff-A', user_level_code: 'staff' }, hotelId: 'A1', tenantId: 'tenant-A' }),
}))
vi.mock('@/hooks/useHotels', () => ({ useHotels: () => ({ data: hotels, isLoading: false }) }))
vi.mock('sonner', () => ({ toast: vi.fn() }))

import { HotelProvider, useHotelContext } from './HotelContext'
import { useUsageMode } from '@/hooks/useUsageMode'

const HotelProbe = () => {
  const { selectedHotel, availableHotels } = useHotelContext()
  return (
    <div>
      <span data-testid="selected">{selectedHotel?.name ?? 'none'}</span>
      <span data-testid="available">{availableHotels.map(h => h.name).join(',')}</span>
    </div>
  )
}
const ModeProbe = () => {
  const { hasMode } = useUsageMode()
  return <span data-testid="inventory-menu">{hasMode('standard') ? 'visible' : 'hidden'}</span>
}

let client: QueryClient
const renderWithClient = (ui: React.ReactNode) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
const refocus = () => act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })

beforeEach(() => {
  state.assigned = ['A1', 'A2']
  state.preference = 'A1'
  state.mode = 'full'
  localStorage.clear()
  // App.tsx defaults: long staleTime, no focus refetch.
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false } } })
})
afterEach(() => {
  cleanup()
  client.clear()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

describe('hotel assignment in an open session', () => {
  it('moves off a hotel that is unassigned while the page is open', async () => {
    renderWithClient(<HotelProvider><HotelProbe /></HotelProvider>)
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Hotel A1'))

    state.assigned = ['A2']
    refocus()

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Hotel A2'))
    expect(screen.getByTestId('available')).toHaveTextContent(/^Hotel A2$/)
  })

  it('shows a re-assigned hotel without jumping away from the current selection', async () => {
    renderWithClient(<HotelProvider><HotelProbe /></HotelProvider>)
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Hotel A1'))

    state.assigned = ['A2']
    refocus()
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Hotel A2'))

    state.assigned = ['A1', 'A2']
    act(() => { onlineManager.setOnline(false) })
    act(() => { onlineManager.setOnline(true) })

    await waitFor(() => expect(screen.getByTestId('available')).toHaveTextContent('Hotel A1,Hotel A2'))
    expect(screen.getByTestId('selected')).toHaveTextContent('Hotel A2')
  })
})

describe('tenant usage mode in an open session', () => {
  it('hides standard-mode navigation after the tenant switches to homestay', async () => {
    renderWithClient(<ModeProbe />)
    await waitFor(() => expect(screen.getByTestId('inventory-menu')).toHaveTextContent('visible'))

    state.mode = 'homestay'
    refocus()

    await waitFor(() => expect(screen.getByTestId('inventory-menu')).toHaveTextContent('hidden'))
  })
})
