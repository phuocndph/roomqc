import { supabase } from '@/integrations/supabase/client'

export const ROOM_CHECK_PHOTO_BUCKET = 'room-check-photos'

function privatePath(value: string): string | null {
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return value
  const marker = `/object/sign/${ROOM_CHECK_PHOTO_BUCKET}/`
  const publicMarker = `/object/public/${ROOM_CHECK_PHOTO_BUCKET}/`
  const index = value.indexOf(marker)
  const publicIndex = value.indexOf(publicMarker)
  const start = index >= 0 ? index + marker.length : publicIndex >= 0 ? publicIndex + publicMarker.length : -1
  if (start < 0) return null
  const end = value.indexOf('?', start)
  return decodeURIComponent(value.slice(start, end >= 0 ? end : undefined))
}

export function isRoomCheckPhotoValue(value: string): boolean {
  return !!privatePath(value)
}

export async function resolveRoomCheckPhotoUrl(value: string): Promise<string> {
  const path = privatePath(value)
  if (!path) return value // legacy item-images URL remains readable for history
  const { data, error } = await supabase.storage
    .from(ROOM_CHECK_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60)
  return error || !data?.signedUrl ? value : data.signedUrl
}

export async function resolveRoomCheckPhotoUrls(values: unknown): Promise<string[]> {
  if (!Array.isArray(values)) return []
  return Promise.all(values.filter((value): value is string => typeof value === 'string').map(resolveRoomCheckPhotoUrl))
}

export async function deleteRoomCheckPhoto(value: string): Promise<boolean> {
  const path = privatePath(value)
  if (path) {
    const { error } = await supabase.storage.from(ROOM_CHECK_PHOTO_BUCKET).remove([path])
    return !error
  }
  const legacyMarker = '/object/public/item-images/'
  const index = value.indexOf(legacyMarker)
  if (index < 0) return false
  const start = index + legacyMarker.length
  const { error } = await supabase.storage.from('item-images').remove([decodeURIComponent(value.slice(start).split('?')[0])])
  return !error
}
