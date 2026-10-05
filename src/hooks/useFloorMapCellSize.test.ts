import { describe, expect, it } from 'vitest'
import {
  cellSizeSignature,
  getPresetCellSize,
  isCellSizeDirty,
  normalizeCellSize,
} from './useFloorMapCellSize'

describe('floor map cell size', () => {
  it('normalizes invalid input to the default medium size', () => {
    expect(normalizeCellSize(null)).toEqual({ preset: 'md', height: 104, cols: 12, fontScale: 1 })
  })

  it('clamps height/font scale and snaps columns to supported values', () => {
    expect(normalizeCellSize({ preset: 'custom', height: 999, cols: 13, fontScale: 9 })).toEqual({
      preset: 'custom',
      height: 220,
      cols: 12,
      fontScale: 1.8,
    })
  })

  it('keeps preset sizes visibly different', () => {
    const small = getPresetCellSize('sm')
    const medium = getPresetCellSize('md')
    const large = getPresetCellSize('lg')

    expect(small.height).toBeLessThan(medium.height)
    expect(medium.height).toBeLessThan(large.height)
    expect(small.cols).toBeGreaterThan(medium.cols)
    expect(medium.cols).toBeGreaterThan(large.cols)
  })

  it('detects dirty draft by normalized signature', () => {
    const saved = getPresetCellSize('md')
    const draft = normalizeCellSize({ ...saved, height: saved.height + 12, preset: 'custom' })

    expect(cellSizeSignature(saved)).not.toEqual(cellSizeSignature(draft))
    expect(isCellSizeDirty(draft, saved)).toBe(true)
    expect(isCellSizeDirty(saved, saved)).toBe(false)
  })
})