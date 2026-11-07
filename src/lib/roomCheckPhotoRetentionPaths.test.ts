import { describe, expect, it } from 'vitest'
import { storageTargetsForPhotos } from '../../supabase/functions/room-check-photo-retention/paths'

describe('W1-D6 photo retention storage targets', () => {
  it('maps private paths, signed URLs and legacy public URLs to their buckets', () => {
    const out = storageTargetsForPhotos([
      't1/h1/r1/a.jpg',
      'http://127.0.0.1:18084/storage/v1/object/sign/room-check-photos/t1/h1/r1/b%20c.jpg?token=x',
      'https://x.example/storage/v1/object/public/item-images/room-checks/old.jpg',
      'https://elsewhere.example/photo.jpg',
      42,
      '',
    ])
    expect(out['room-check-photos']).toEqual(['t1/h1/r1/a.jpg', 't1/h1/r1/b c.jpg'])
    expect(out['item-images']).toEqual(['room-checks/old.jpg'])
  })
  it('handles missing values', () => {
    expect(storageTargetsForPhotos(null)).toEqual({ 'room-check-photos': [], 'item-images': [] })
  })
})
