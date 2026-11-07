import { afterEach, describe, expect, it, vi } from 'vitest'
import { controlRequest } from '@/lib/workspace'
const native = vi.hoisted(() => ({ enabled: true, request: vi.fn() }))
vi.mock('./platform', () => ({ isNativeApp: () => native.enabled, nativePublicOrigin: () => 'https://app.roomqc.com' }))
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request: native.request } }))
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); native.enabled = true })

describe('native control directory transport', () => {
  it('permits exact recheck writes only with bearer and stable UUID key', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const path = '/admin/workspaces/' + id + '/recheck'
    native.request.mockResolvedValue({ status: 202, data: { outcome: 'queued' } })
    const headers = { Authorization: 'Bearer admin-token', 'Idempotency-Key': key }
    await controlRequest(path, { method: 'POST', headers, body: JSON.stringify({ reason: 'Inspect registration' }) })
    expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST', url: 'https://app.roomqc.com/api/control' + path,
      headers: expect.objectContaining({ authorization: 'Bearer admin-token', 'idempotency-key': key }), disableRedirects: true }))
    native.request.mockClear()
    for (const options of [{ method: 'POST' }, { method: 'POST', headers: { Authorization: 'Bearer admin-token' } }, { method: 'DELETE', headers }])
      await expect(controlRequest(path, options)).rejects.toThrow('không hợp lệ')
    await expect(controlRequest(path + '?owner=other', { method: 'POST', headers })).rejects.toThrow('không hợp lệ')
    expect(native.request).not.toHaveBeenCalled()
  })
  it('permits only a GET to the exact private setup-status route', async () => {
    native.request.mockResolvedValue({ status: 200, data: { step: 'ready_to_setup' } })
    await controlRequest('/workspaces/anthuy/setup-status', { headers: { Authorization: 'Bearer owner-token' } })
    expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'GET',
      url: 'https://app.roomqc.com/api/control/workspaces/anthuy/setup-status', disableRedirects: true,
      headers: expect.objectContaining({ authorization: 'Bearer owner-token', Origin: 'https://app.roomqc.com' }) }))
    native.request.mockClear()
    for (const [path, method] of [['/workspaces/anthuy/setup-status', 'POST'], ['/workspaces/anthuy/setup-status?ownerId=other', 'GET'],
      ['/workspaces/anthuy/setup-status/../provision', 'GET'], ['/workspaces/anthuy/setup-status/extra', 'GET']]) {
      await expect(controlRequest(path, { method })).rejects.toThrow('không hợp lệ')
    }
    expect(native.request).not.toHaveBeenCalled()
  })
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
  it('allows only approved admin reads on the configured public origin', async () => {
    native.request.mockResolvedValue({ status: 200, data: { items: [], nextCursor: null } })
    await controlRequest('/admin/workspaces?limit=25&search=A+%26+B', { method: 'GET', headers: { Authorization: 'Bearer admin-token' } })
    expect(native.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET',
      url: 'https://app.roomqc.com/api/control/admin/workspaces?limit=25&search=A+%26+B',
      headers: expect.objectContaining({ authorization: 'Bearer admin-token', Origin: 'https://app.roomqc.com' }), disableRedirects: true,
    }))
    native.request.mockClear()
    for (const method of ['POST', 'DELETE', 'PUT']) {
      await expect(controlRequest('/admin/clusters', { method })).rejects.toThrow('không hợp lệ')
    }
    expect(native.request).not.toHaveBeenCalled()
  })
  it('permits the exact alert acknowledgement and result routes, retaining original key, CSRF origin and redirect refusal', async () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    native.request.mockResolvedValue({ status: 200, data: {} })
    await controlRequest('/admin/alerts/' + id + '/acknowledge', { method: 'POST', headers: { Authorization: 'Bearer admin-token', 'Idempotency-Key': key },
      body: JSON.stringify({ expectedVersion: 1, reason: 'Checking disk' }) })
    expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST', url: 'https://app.roomqc.com/api/control/admin/alerts/' + id + '/acknowledge',
      headers: expect.objectContaining({ 'idempotency-key': key, Origin: 'https://app.roomqc.com' }), data: { expectedVersion: 1, reason: 'Checking disk' }, disableRedirects: true }))
    await controlRequest('/admin/alerts/' + id + '/acknowledgement-result', { method: 'GET', headers: { 'Idempotency-Key': key } })
    expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'GET', url: 'https://app.roomqc.com/api/control/admin/alerts/' + id + '/acknowledgement-result' }))
    native.request.mockClear()
    for (const path of ['/admin/alerts/' + id + '/acknowledge?target=other', '/admin/clusters/register?target=other', '/admin/clusters/cluster-a/commands?other=x'])
      await expect(controlRequest(path, { method: 'POST' })).rejects.toThrow('không hợp lệ')
    expect(native.request).not.toHaveBeenCalled()
  })
  it('permits exact cluster command and scoped result paths without general admin mutations', async () => {
    native.request.mockResolvedValue({ status: 200, data: {} })
    const body = { operation: 'close_admission', expectedVersion: 1, reason: 'Đóng để kiểm tra', payload: {} }
    await controlRequest('/admin/clusters/cluster-a/commands', { method: 'POST', headers: { 'Idempotency-Key': 'original-key' }, body: JSON.stringify(body) })
    expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST', data: body, disableRedirects: true,
      headers: expect.objectContaining({ 'idempotency-key': 'original-key', Origin: 'https://app.roomqc.com' }) }))
    await controlRequest('/admin/clusters/cluster-a/command-result?operation=close_admission', { headers: { 'Idempotency-Key': 'original-key' } })
    expect(native.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'GET', url: 'https://app.roomqc.com/api/control/admin/clusters/cluster-a/command-result?operation=close_admission' }))
    native.request.mockClear()
    for (const path of ['/admin/clusters/cluster-a/command-result', '/admin/clusters/cluster-a/command-result?operation=close_admission&operation=close_admission',
      '/admin/clusters/cluster-a/command-result?operation=close_admission&actor=other', '/admin/clusters/cluster-a/command-result?operation=unknown'])
      await expect(controlRequest(path)).rejects.toThrow('không hợp lệ')
    expect(native.request).not.toHaveBeenCalled()
  })
})
