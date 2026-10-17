import { afterEach, describe, expect, it, vi } from 'vitest'
import { controlRequest } from '@/lib/workspace'
const native = vi.hoisted(() => ({ enabled: true, request: vi.fn() }))
vi.mock('./platform', () => ({ isNativeApp: () => native.enabled, nativePublicOrigin: () => 'https://app.roomqc.com' }))
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request: native.request } }))
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); native.enabled = true })

describe('native control directory transport', () => {
  it('calls only the configured server, preserves the bearer token and CSRF Origin', async () => {
    native.request.mockResolvedValue({ status: 200, data: { success: true } })
    const response = await controlRequest('/workspaces/anthuy/provision', { method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: JSON.stringify({ hotelName: 'Demo' }) })
    expect(response).toEqual({ success: true })
    expect(native.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://app.roomqc.com/api/control/workspaces/anthuy/provision',
      headers: { authorization: 'Bearer user-token', 'Content-Type': 'application/json', Origin: 'https://app.roomqc.com' },
      data: { hotelName: 'Demo' }, disableRedirects: true,
    }))
  })
  it('never follows a path traversal or foreign URL', async () => {
    for (const path of ['/../steal', '//evil.invalid', '/workspaces/anthuy/bootstrap?redirect=https://evil.invalid']) {
      await expect(controlRequest(path)).rejects.toThrow('không hợp lệ')
    }
    expect(native.request).not.toHaveBeenCalled()
  })
  it('reports a failed server response with its support ID', async () => {
    native.request.mockResolvedValue({ status: 503, data: { message: 'Try later', requestId: 'request-a' } })
    await expect(controlRequest('/workspaces/anthuy/bootstrap')).rejects.toThrow('Try later (Mã hỗ trợ: request-a)')
  })
  it('does not dispatch requests already cancelled by the caller', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(controlRequest('/workspaces/anthuy/bootstrap', { signal: controller.signal })).rejects.toThrow('Aborted')
    expect(native.request).not.toHaveBeenCalled()
  })
})
