import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSignedUrl = vi.hoisted(() => vi.fn())
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}))

import { clearStorageUrlCache, itemImagesPath, resolveStorageUrl } from './storageImageUrl'

beforeEach(() => { clearStorageUrlCache(); createSignedUrl.mockReset() })

describe('W1-D7 private item-images URLs', () => {
  it('extracts the object path from stored public or signed URLs', () => {
    expect(itemImagesPath('https://x/storage/v1/object/public/item-images/t1/a%20b.jpg')).toBe('t1/a b.jpg')
    expect(itemImagesPath('https://x/storage/v1/object/sign/item-images/t1/c.jpg?token=1')).toBe('t1/c.jpg')
    expect(itemImagesPath('https://x/storage/v1/object/public/avatars/u.jpg')).toBeNull()
    expect(itemImagesPath('blob:http://x/123')).toBeNull()
  })

  it('signs item-images values once and reuses the signed URL', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/signed?token=abc' }, error: null })
    const stored = 'https://x/storage/v1/object/public/item-images/t1/a.jpg'
    const [a, b] = await Promise.all([resolveStorageUrl(stored), resolveStorageUrl(stored)])
    expect(a).toBe('https://x/signed?token=abc')
    expect(b).toBe(a)
    expect(await resolveStorageUrl(stored)).toBe(a)
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
    expect(createSignedUrl).toHaveBeenCalledWith('t1/a.jpg', 3600)
  })

  it('passes other values through and hides failures', async () => {
    expect(await resolveStorageUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA')
    expect(await resolveStorageUrl(null)).toBeNull()
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('denied') })
    expect(await resolveStorageUrl('https://x/storage/v1/object/public/item-images/t2/z.jpg')).toBeNull()
  })
})
