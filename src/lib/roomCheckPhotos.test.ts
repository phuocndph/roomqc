import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRoomCheckPhoto, resolveRoomCheckPhotoUrl, resolveRoomCheckPhotoUrls } from './roomCheckPhotos'

const storage = vi.hoisted(() => ({
  from: vi.fn(),
  sign: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: storage.from } } }))

describe('room-check photo reference compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.from.mockReturnValue({ createSignedUrl: storage.sign, remove: storage.remove })
    storage.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.invalid/refreshed' }, error: null })
    storage.remove.mockResolvedValue({ data: [{}], error: null })
  })

  it('signs durable private object paths', async () => {
    expect(await resolveRoomCheckPhotoUrl('tenant/hotel/photo.png')).toBe('https://storage.invalid/refreshed')
    expect(storage.from).toHaveBeenCalledWith('room-check-photos')
    expect(storage.sign).toHaveBeenCalledWith('tenant/hotel/photo.png', 3600)
  })

  it('refreshes stored signed URLs without reusing the expired token', async () => {
    await resolveRoomCheckPhotoUrl('https://old.invalid/storage/v1/object/sign/room-check-photos/tenant/photo%20one.png?token=expired')
    expect(storage.sign).toHaveBeenCalledWith('tenant/photo one.png', 3600)
  })

  it('resolves historical URLs for the now-private bucket', async () => {
    await resolveRoomCheckPhotoUrl('https://old.invalid/storage/v1/object/public/room-check-photos/tenant/photo.png')
    expect(storage.sign).toHaveBeenCalledWith('tenant/photo.png', 3600)
  })

  it('preserves legacy item-images references without signing against the wrong bucket', async () => {
    const legacy = 'https://old.invalid/storage/v1/object/public/item-images/tenant/photo.png'
    expect(await resolveRoomCheckPhotoUrl(legacy)).toBe(legacy)
    expect(storage.sign).not.toHaveBeenCalled()
  })

  it('filters malformed photo collections', async () => {
    expect(await resolveRoomCheckPhotoUrls(null)).toEqual([])
    expect(await resolveRoomCheckPhotoUrls([null, 3, 'tenant/photo.png'])).toEqual(['https://storage.invalid/refreshed'])
  })

  it('deletes the private object referenced by a signed URL', async () => {
    expect(await deleteRoomCheckPhoto('https://old.invalid/storage/v1/object/sign/room-check-photos/tenant/photo.png?token=expired')).toBe(true)
    expect(storage.from).toHaveBeenCalledWith('room-check-photos')
    expect(storage.remove).toHaveBeenCalledWith(['tenant/photo.png'])
  })

  it('keeps deletion of legacy item-images references compatible', async () => {
    expect(await deleteRoomCheckPhoto('https://old.invalid/storage/v1/object/public/item-images/tenant/photo%20one.png')).toBe(true)
    expect(storage.from).toHaveBeenCalledWith('item-images')
    expect(storage.remove).toHaveBeenCalledWith(['tenant/photo one.png'])
  })

  it('does not delete unknown remote URLs', async () => {
    expect(await deleteRoomCheckPhoto('https://external.invalid/photo.png')).toBe(false)
    expect(storage.from).not.toHaveBeenCalled()
  })
})
