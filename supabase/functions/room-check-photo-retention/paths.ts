// Map stored room check photo values (bare private paths, signed/public URLs of
// room-check-photos, or legacy public item-images URLs) to Storage removals.
// Mirrors src/lib/roomCheckPhotos.ts; unknown values are left untouched.

export const ROOM_CHECK_BUCKET = 'room-check-photos'
const LEGACY_BUCKET = 'item-images'

function pathAfter(value: string, marker: string): string | null {
  const index = value.indexOf(marker)
  if (index < 0) return null
  const rest = value.slice(index + marker.length)
  const end = rest.indexOf('?')
  return decodeURIComponent(end >= 0 ? rest.slice(0, end) : rest)
}

export function storageTargetsForPhotos(values: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = { [ROOM_CHECK_BUCKET]: [], [LEGACY_BUCKET]: [] }
  if (!Array.isArray(values)) return out
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue
    if (!/^https?:\/\//i.test(value)) { out[ROOM_CHECK_BUCKET].push(value); continue }
    const own = pathAfter(value, `/object/sign/${ROOM_CHECK_BUCKET}/`) ?? pathAfter(value, `/object/public/${ROOM_CHECK_BUCKET}/`)
    if (own) { out[ROOM_CHECK_BUCKET].push(own); continue }
    const legacy = pathAfter(value, `/object/public/${LEGACY_BUCKET}/`) ?? pathAfter(value, `/object/sign/${LEGACY_BUCKET}/`)
    if (legacy) out[LEGACY_BUCKET].push(legacy)
  }
  return out
}
