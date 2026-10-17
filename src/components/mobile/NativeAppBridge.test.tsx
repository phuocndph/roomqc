import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeAppBridge } from './NativeAppBridge'

const mocks = vi.hoisted(() => ({
  native: true, events: {} as Record<string, (...args: unknown[]) => void>,
  remove: vi.fn(), navigate: vi.fn(), minimize: vi.fn(), exchange: vi.fn(), start: vi.fn(), stop: vi.fn(),
  error: vi.fn(), info: vi.fn(), close: vi.fn(), launch: vi.fn(),
}))
vi.mock('@/lib/native/platform', () => ({ isNativeApp: () => mocks.native }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }))
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (event, callback) => { mocks.events[event] = callback; return { remove: mocks.remove } }),
  getLaunchUrl: mocks.launch, minimizeApp: mocks.minimize,
} }))
vi.mock('@capacitor/network', () => ({ Network: {
  addListener: vi.fn(async (event, callback) => { mocks.events[event] = callback; return { remove: mocks.remove } }),
  getStatus: async () => ({ connected: true }),
} }))
vi.mock('@capacitor/browser', () => ({ Browser: { close: mocks.close } }))
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: vi.fn() } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  exchangeCodeForSession: mocks.exchange, startAutoRefresh: mocks.start, stopAutoRefresh: mocks.stop,
} } }))
vi.mock('sonner', () => ({ toast: { error: mocks.error, info: mocks.info } }))

let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.native = true
  mocks.events = {}
  mocks.launch.mockResolvedValue(undefined)
  mocks.exchange.mockResolvedValue({ error: null })
  window.history.replaceState({ idx: 0 }, '', '/')
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear() })
async function mount(path = '/') {
  const router = { navigate: mocks.navigate, state: { location: { pathname: path } } }
  const view = render(<QueryClientProvider client={client}><NativeAppBridge router={router as never} /></QueryClientProvider>)
  await waitFor(() => expect(mocks.events.backButton).toBeDefined())
  return view
}
describe('native lifecycle and routing', () => {
  it('shows network loss and clears it when connectivity returns', async () => {
    await mount()
    act(() => mocks.events.networkStatusChange({ connected: false }))
    expect(screen.getByRole('status')).toHaveTextContent('Mất kết nối mạng')
    act(() => mocks.events.networkStatusChange({ connected: true }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('uses actual history for Android back and minimizes at the root', async () => {
    await mount()
    act(() => mocks.events.backButton())
    expect(mocks.minimize).toHaveBeenCalledOnce()
    window.history.replaceState({ idx: 2 }, '', '/rooms')
    act(() => mocks.events.backButton())
    expect(mocks.navigate).toHaveBeenCalledWith(-1)
  })
  it('dismisses an open dialog before navigating away', async () => {
    const view = await mount('/rooms/check')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('data-state', 'open')
    document.body.append(dialog)
    const escape = vi.fn()
    document.addEventListener('keydown', escape)
    act(() => mocks.events.backButton())
    expect(escape).toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    dialog.remove(); document.removeEventListener('keydown', escape); view.unmount()
  })
  it('exchanges a PKCE code once and never navigates with tokens', async () => {
    await mount()
    await act(async () => { mocks.events.appUrlOpen({ url: 'com.roomqc.app://auth/callback?code=one-time' }) })
    expect(mocks.exchange).toHaveBeenCalledWith('one-time')
    expect(mocks.navigate).toHaveBeenCalledWith('/auth/callback', { replace: true })
    await act(async () => { mocks.events.appUrlOpen({ url: 'com.roomqc.app://auth/callback?code=one-time' }) })
    expect(mocks.exchange).toHaveBeenCalledOnce()
  })
  it('rejects authentication from another workspace', async () => {
    await mount()
    await act(async () => { mocks.events.appUrlOpen({ url: 'com.roomqc.app://auth/callback?code=one-time&workspace=other' }) })
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalled()
  })
  it('pauses token refresh in background and refreshes active data on resume', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const view = await mount()
    act(() => mocks.events.appStateChange({ isActive: false }))
    expect(mocks.stop).toHaveBeenCalledOnce()
    act(() => mocks.events.appStateChange({ isActive: true }))
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({ refetchType: 'active' })
    view.unmount()
    expect(mocks.remove).toHaveBeenCalledTimes(5)
  })
})
