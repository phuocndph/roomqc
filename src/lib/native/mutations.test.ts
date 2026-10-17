import { QueryClient, onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomQcMutationCache, nativeMutationDefaults } from './mutations'
const platform = vi.hoisted(() => ({ native: true }))
vi.mock('./platform', () => ({ isNativeApp: () => platform.native }))
afterEach(() => { platform.native = true; onlineManager.setOnline(true) })

describe('native business writes during network failure', () => {
  it('rejects an offline write immediately and does not replay it on reconnect', async () => {
    const client = new QueryClient({ mutationCache: createRoomQcMutationCache(), defaultOptions: { mutations: nativeMutationDefaults() } })
    const send = vi.fn()
    onlineManager.setOnline(false)
    const mutation = client.getMutationCache().build(client, { mutationFn: send })
    await expect(mutation.execute(undefined)).rejects.toThrow('mất kết nối mạng')
    onlineManager.setOnline(true)
    await client.resumePausedMutations()
    expect(send).not.toHaveBeenCalled()
    client.clear()
  })
  it('does not automatically retry a write after losing its response', async () => {
    const client = new QueryClient({ mutationCache: createRoomQcMutationCache(), defaultOptions: { mutations: nativeMutationDefaults() } })
    const send = vi.fn().mockRejectedValue(new Error('Lost response'))
    const mutation = client.getMutationCache().build(client, { mutationFn: send })
    await expect(mutation.execute(undefined)).rejects.toThrow('Lost response')
    expect(send).toHaveBeenCalledOnce()
    client.clear()
  })
  it('keeps the existing browser mutation defaults', () => {
    platform.native = false
    expect(nativeMutationDefaults()).toEqual({})
  })
})
