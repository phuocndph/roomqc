import { describe, it, expect } from 'vitest'
import {
  mapLeanError,
  sanitizeLeanDraft,
  preSubmitValidate,
  flattenIssues,
  type SanitizedLeanIssue,
} from './roomCheckLeanErrors'

describe('mapLeanError', () => {
  it('maps conflict to Vietnamese reload message', () => {
    expect(mapLeanError('conflict_room_updated').message).toContain('tải lại trước khi gửi')
  })

  it.each([
    ['photo_required:damaged_lost', 'Hỏng / Mất'],
    ['photo_required:missing_replace', 'Thiếu / Cần thay'],
    ['photo_required:consumed_chargeable', 'Khách đã dùng'],
  ])('maps %s to specific bucket message', (code, hint) => {
    expect(mapLeanError(code).message).toContain(hint)
  })

  it('extracts itemId from server error tag', () => {
    const out = mapLeanError('photo_required:damaged_lost:550e8400-e29b-41d4-a716-446655440000')
    expect(out.itemId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('extracts itemId from invalid_quantity', () => {
    const out = mapLeanError('invalid_quantity:550e8400-e29b-41d4-a716-446655440000')
    expect(out.itemId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('maps invalid_quantity without itemId', () => {
    expect(mapLeanError('invalid_quantity').message).toMatch(/lớn hơn 0/)
  })

  it('maps primary_quantity_exceeds_standard', () => {
    const out = mapLeanError(
      'primary_quantity_exceeds_standard:550e8400-e29b-41d4-a716-446655440000:5:4',
    )
    expect(out.itemId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(out.message).toMatch(/vượt quá|vượt/)
  })

  it('extracts rate limit minutes', () => {
    expect(mapLeanError('quick_rate_limited:45').message).toContain('45 phút')
  })

  it('falls back to default rate limit minutes if number missing', () => {
    expect(mapLeanError('quick_rate_limited', 30).message).toContain('30 phút')
  })

  it('maps forbidden_tenant', () => {
    expect(mapLeanError('forbidden_tenant').message).toMatch(/không có quyền/)
  })

  it('returns raw message for unknown error', () => {
    expect(mapLeanError('something_weird').message).toBe('something_weird')
  })

  it('handles empty message', () => {
    expect(mapLeanError('').message).toMatch(/lỗi không xác định/)
  })
})

describe('sanitizeLeanDraft', () => {
  it('returns null for non-object input', () => {
    expect(sanitizeLeanDraft(null)).toBeNull()
    expect(sanitizeLeanDraft(undefined)).toBeNull()
    expect(sanitizeLeanDraft('foo')).toBeNull()
  })

  it('drops issues missing item_id, kind, or qty<=0', () => {
    const out = sanitizeLeanDraft({
      issues: {
        a: { item_id: 'x', kind: 'damaged', quantity: 2 },
        b: { kind: 'damaged', quantity: 1 },
        c: { item_id: 'y', kind: 'unknown', quantity: 1 },
        d: { item_id: 'z', kind: 'lost', quantity: 0 },
        e: { item_id: 'w', kind: 'lost', quantity: -3 },
      },
    })
    expect(Object.keys(out!.issues)).toEqual(['a'])
    // legacy single → wrapped to array
    expect(Array.isArray(out!.issues.a)).toBe(true)
    expect(out!.issues.a).toHaveLength(1)
  })

  it('migrates legacy single-issue object to array', () => {
    const out = sanitizeLeanDraft({
      issues: {
        a: { item_id: 'x', kind: 'damaged', quantity: 2, level1: 'damaged_lost' },
      },
    })
    expect(out!.issues.a).toHaveLength(1)
    expect(out!.issues.a[0].id).toBeTruthy()
  })

  it('keeps multi-issue array shape', () => {
    const out = sanitizeLeanDraft({
      issues: {
        a: [
          { id: 'i1', item_id: 'x', kind: 'damaged', quantity: 2, level1: 'linen.damaged_dirty' },
          { id: 'i2', item_id: 'x', kind: 'lost', quantity: 1, level1: 'linen.lost_unknown' },
        ],
      },
    })
    expect(out!.issues.a).toHaveLength(2)
    expect(out!.issues.a[0].id).toBe('i1')
    expect(out!.issues.a[1].kind).toBe('lost')
  })

  it('filters non-string photos', () => {
    const out = sanitizeLeanDraft({
      issues: {
        a: {
          item_id: 'x',
          kind: 'consumed',
          quantity: 1,
          photos: ['ok.jpg', 123, null, 'two.jpg'],
        },
      },
    })
    expect(out!.issues.a[0].photos).toEqual(['ok.jpg', 'two.jpg'])
  })

  it('drops minibar entries that are not positive numbers', () => {
    const out = sanitizeLeanDraft({
      minibar: { a: 2, b: 0, c: -1, d: 'x', e: 4 },
    })
    expect(out!.minibar).toEqual({ a: 2, e: 4 })
  })
})

const mkIssue = (over: Partial<SanitizedLeanIssue> = {}): SanitizedLeanIssue => ({
  id: 'auto',
  item_id: 'i1',
  item_name: 'Khăn tắm',
  item_type: 'amenity',
  level1: 'damaged_lost',
  kind: 'damaged',
  quantity: 1,
  photos: [],
  issueRole: 'primary_issue',
  ...over,
})

describe('preSubmitValidate', () => {
  it('returns null when no issues', () => {
    expect(preSubmitValidate({ issues: [], config: null })).toBeNull()
  })

  it('blocks qty <= 0', () => {
    const err = preSubmitValidate({ issues: [mkIssue({ quantity: 0 })] })
    expect(err?.code).toBe('invalid_quantity')
  })

  it('requires photo for damaged_lost when config on', () => {
    const err = preSubmitValidate({
      issues: [mkIssue({ kind: 'lost' })],
      config: {
        photo_required_damaged_lost: true,
        photo_required_missing_replace: false,
        photo_required_consumed_chargeable: false,
      },
    })
    expect(err?.code).toBe('photo_required:damaged_lost')
  })

  it('blocks when sum of primary_issue per item exceeds standard (§8.3)', () => {
    const err = preSubmitValidate({
      issues: [
        mkIssue({ id: 'a', kind: 'damaged', quantity: 2 }),
        mkIssue({ id: 'b', kind: 'lost', quantity: 2 }),
        mkIssue({ id: 'c', kind: 'lost', quantity: 1 }),
      ],
      standardByItem: { i1: 4 },
    })
    expect(err?.code).toBe('primary_quantity_exceeds_standard')
    expect(err?.itemId).toBe('i1')
  })

  it('does NOT count derived_action toward §8.3 constraint', () => {
    const out = preSubmitValidate({
      issues: [
        mkIssue({ id: 'a', kind: 'damaged', quantity: 1, issueRole: 'primary_issue' }),
        mkIssue({ id: 'b', kind: 'missing', quantity: 1, issueRole: 'derived_action' }),
      ],
      standardByItem: { i1: 1 },
    })
    expect(out).toBeNull()
  })

  it('passes valid multi-issue under standard', () => {
    const out = preSubmitValidate({
      issues: [
        mkIssue({ id: 'a', kind: 'missing', quantity: 2 }),
        mkIssue({ id: 'b', kind: 'lost', quantity: 1 }),
        mkIssue({ id: 'c', kind: 'damaged', quantity: 1 }),
      ],
      standardByItem: { i1: 4 },
      config: {
        photo_required_damaged_lost: false,
        photo_required_missing_replace: false,
        photo_required_consumed_chargeable: false,
      },
    })
    expect(out).toBeNull()
  })
})

describe('flattenIssues', () => {
  it('flattens record of arrays into a single array', () => {
    const result = flattenIssues({
      a: [mkIssue({ id: '1' }), mkIssue({ id: '2' })],
      b: [mkIssue({ id: '3', item_id: 'i2' })],
    })
    expect(result).toHaveLength(3)
    expect(result.map((i) => i.id)).toEqual(['1', '2', '3'])
  })
})
