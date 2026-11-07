import { supabase } from '@/integrations/supabase/client'

// W1-D7 (07/11/2026): the item-images bucket is private. Stored values keep
// their old shape (public URL or bare path); they are turned into short-lived
// signed URLs when shown. Any other value (blob:, data:, other buckets,
// external links) passes through unchanged.

export const ITEM_IMAGES_BUCKET = 'item-images'
const SIGNED_TTL_SECONDS = 60 * 60
const REUSE_FOR_MS = 50 * 60 * 1000

export function itemImagesPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  for (const kind of ['public', 'sign', 'authenticated']) {
    const marker = `/object/${kind}/${ITEM_IMAGES_BUCKET}/`
    const index = value.indexOf(marker)
    if (index >= 0) {
      const rest = value.slice(index + marker.length)
      const end = rest.indexOf('?')
      return decodeURIComponent(end >= 0 ? rest.slice(0, end) : rest)
    }
  }
  return null
}

const cache = new Map<string, { url: string; at: number }>()
const inflight = new Map<string, Promise<string>>()

export function cachedStorageUrl(value: string | null | undefined): string | null {
  const path = itemImagesPath(value)
  if (!path) return value ?? null
  const hit = cache.get(path)
  return hit && Date.now() - hit.at < REUSE_FOR_MS ? hit.url : null
}

export async function resolveStorageUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  const path = itemImagesPath(value)
  if (!path) return value
  const cached = cachedStorageUrl(value)
  if (cached) return cached
  let pending = inflight.get(path)
  if (!pending) {
    pending = supabase.storage.from(ITEM_IMAGES_BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) throw error ?? new Error('signed_url_unavailable')
        cache.set(path, { url: data.signedUrl, at: Date.now() })
        return data.signedUrl
      })
      .finally(() => inflight.delete(path))
    inflight.set(path, pending)
  }
  try {
    return await pending
  } catch {
    return null
  }
}

/** Test hook: forget cached signed URLs. */
export function clearStorageUrlCache() {
  cache.clear()
  inflight.clear()
}
