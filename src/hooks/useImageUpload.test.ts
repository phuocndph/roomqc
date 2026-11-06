import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageUpload } from './useImageUpload'

const storage = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), sign: vi.fn(), publicUrl: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: storage.from } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('image upload bucket contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.from.mockReturnValue({ upload: storage.upload, createSignedUrl: storage.sign, getPublicUrl: storage.publicUrl })
    storage.upload.mockResolvedValue({ data: { path: 'tenant/photo.png' }, error: null })
    storage.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.invalid/private-signed' }, error: null })
    storage.publicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.invalid/public-item' } })
  })

  it('uses a signed URL and private bucket for room checks', async () => {
    const { result } = renderHook(() => useImageUpload())
    let uploaded
    await act(async () => { uploaded = await result.current.uploadImage(new File(['photo'], 'test.png', { type: 'image/png' }), 'tenant', 'room-check-photos') })
    expect(uploaded).toEqual({ path: 'tenant/photo.png', url: 'https://storage.invalid/private-signed' })
    expect(storage.from).toHaveBeenCalledWith('room-check-photos')
    expect(storage.sign).toHaveBeenCalledWith('tenant/photo.png', 3600)
    expect(storage.publicUrl).not.toHaveBeenCalled()
  })

  it('preserves public item-image behavior for other callers', async () => {
    const { result } = renderHook(() => useImageUpload())
    let uploaded
    await act(async () => { uploaded = await result.current.uploadImage(new File(['photo'], 'test.png'), 'tenant') })
    expect(uploaded).toEqual({ path: 'tenant/photo.png', url: 'https://storage.invalid/public-item' })
    expect(storage.from).toHaveBeenCalledWith('item-images')
    expect(storage.sign).not.toHaveBeenCalled()
  })
})
