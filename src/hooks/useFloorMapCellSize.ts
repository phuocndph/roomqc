import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

export type CellSizePreset = 'sm' | 'md' | 'lg' | 'custom'

export interface CellSizeState {
  preset: CellSizePreset
  height: number // px
  cols: number  // xl breakpoint cols
  fontScale: number // 0.8 – 1.4
}

export const FLOOR_MAP_CELL_SIZE_PRESETS: Record<Exclude<CellSizePreset, 'custom'>, { height: number; cols: number }> = {
  sm: { height: 76, cols: 16 },
  md: { height: 104, cols: 12 },
  lg: { height: 148, cols: 8 },
}

const DEFAULT_FONT_SCALE = 1.0
const ALLOWED_COLS = [4, 6, 8, 10, 12, 14, 16] as const

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function snapCols(c: number): number {
  let best = ALLOWED_COLS[0] as number
  let diff = Math.abs(c - best)
  for (const v of ALLOWED_COLS) {
    const d = Math.abs(c - v)
    if (d < diff) { diff = d; best = v }
  }
  return best
}

export function floorMapCellSizeStorageKey(hotelId?: string | null) {
  return `rooms.floorMap.cellSize:${hotelId || 'default'}`
}

export function normalizeCellSize(p: Partial<CellSizeState> | null | undefined): CellSizeState {
  if (!p || typeof p.height !== 'number' || typeof p.cols !== 'number') {
    return { preset: 'md', ...FLOOR_MAP_CELL_SIZE_PRESETS.md, fontScale: DEFAULT_FONT_SCALE }
  }
  return {
    preset: ['sm', 'md', 'lg', 'custom'].includes(String(p.preset)) ? (p.preset as CellSizePreset) : 'custom',
    height: Math.round(clamp(p.height, 64, 220)),
    cols: snapCols(p.cols),
    fontScale: Number(clamp(typeof p.fontScale === 'number' ? p.fontScale : DEFAULT_FONT_SCALE, 0.7, 1.8).toFixed(2)),
  }
}

export function getPresetCellSize(preset: Exclude<CellSizePreset, 'custom'>, fontScale = DEFAULT_FONT_SCALE): CellSizeState {
  return normalizeCellSize({ preset, ...FLOOR_MAP_CELL_SIZE_PRESETS[preset], fontScale })
}

function readStored(hotelId?: string | null): CellSizeState {
  try {
    const raw = localStorage.getItem(floorMapCellSizeStorageKey(hotelId))
    if (raw) return normalizeCellSize(JSON.parse(raw))
  } catch {
    // Ignore corrupted local preferences and fall back to defaults.
  }
  return normalizeCellSize(null)
}

export function cellSizeSignature(value: CellSizeState): string {
  return JSON.stringify(normalizeCellSize(value))
}

export function isCellSizeDirty(draft: CellSizeState, saved: CellSizeState): boolean {
  return cellSizeSignature(draft) !== cellSizeSignature(saved)
}

export function useFloorMapCellSize(hotelId?: string | null, remoteInitial?: CellSizeState | null) {
  const initialSaved = remoteInitial ? normalizeCellSize(remoteInitial) : readStored(hotelId)
  const [draft, setDraft] = useState<CellSizeState>(() => initialSaved)
  const [saved, setSaved] = useState<CellSizeState>(() => initialSaved)
  const draftRef = useRef(draft)
  const savedRef = useRef(saved)
  const hotelRef = useRef(hotelId)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    savedRef.current = saved
  }, [saved])

  const applySaved = useCallback((next: Partial<CellSizeState> | null | undefined) => {
    const normalized = normalizeCellSize(next)
    draftRef.current = normalized
    savedRef.current = normalized
    setDraft(normalized)
    setSaved(normalized)
    try { localStorage.setItem(floorMapCellSizeStorageKey(hotelId), JSON.stringify(normalized)) } catch {
      // Local persistence is best-effort.
    }
  }, [hotelId])

  const applyDraft = useCallback((next: Partial<CellSizeState>) => {
    const normalized = normalizeCellSize(next)
    draftRef.current = normalized
    setDraft(normalized)
  }, [])

  // Reload when hotel changes or remote arrives. Do not let stale remote values
  // overwrite local edits while the user is adjusting before pressing Save.
  useEffect(() => {
    const hotelChanged = hotelRef.current !== hotelId
    if (hotelChanged) {
      hotelRef.current = hotelId
    }

    if (!remoteInitial) {
      if (hotelChanged) {
        applySaved(readStored(hotelId))
      }
      return
    }

    const next = normalizeCellSize(remoteInitial)
    const hasUnsavedChanges = isCellSizeDirty(draftRef.current, savedRef.current)
    if (!hasUnsavedChanges || hotelChanged) applySaved(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySaved, hotelId, remoteInitial?.height, remoteInitial?.cols, remoteInitial?.fontScale, remoteInitial?.preset])

  const setPreset = useCallback((preset: CellSizePreset) => {
    const current = draftRef.current
    applyDraft(preset === 'custom'
      ? { ...current, preset: 'custom' }
      : getPresetCellSize(preset, current.fontScale))
  }, [applyDraft])

  const setCustom = useCallback((patch: Partial<Pick<CellSizeState, 'height' | 'cols' | 'fontScale'>>) => {
    const current = draftRef.current
    applyDraft({
      preset: 'custom',
      height: clamp(patch.height ?? current.height, 64, 220),
      cols: snapCols(patch.cols ?? current.cols),
      fontScale: clamp(patch.fontScale ?? current.fontScale, 0.7, 1.8),
    })
  }, [applyDraft])

  const setFontScale = useCallback((v: number) => {
    applyDraft({ ...draftRef.current, fontScale: clamp(v, 0.7, 1.8) })
  }, [applyDraft])

  const reset = useCallback(() => {
    applyDraft(getPresetCellSize('md'))
  }, [applyDraft])

  const markSynced = useCallback((value?: CellSizeState) => {
    applySaved(value ?? draftRef.current)
  }, [applySaved])

  const discardDraft = useCallback(() => {
    const normalized = normalizeCellSize(savedRef.current)
    draftRef.current = normalized
    setDraft(normalized)
  }, [])

  const getCurrentSize = useCallback(() => draftRef.current, [])

  // Keyboard shortcut: Ctrl/Cmd +/-/0
  useEffect(() => {
    const order: CellSizePreset[] = ['sm', 'md', 'lg']
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '0') {
        e.preventDefault()
        const current = draftRef.current
        applyDraft(getPresetCellSize('md', current.fontScale))
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        const current = draftRef.current
        const idx = order.indexOf(current.preset)
        const nextIdx = idx === -1 ? order.indexOf('md') : Math.min(order.length - 1, idx + 1)
        const p = order[nextIdx]
        applyDraft(getPresetCellSize(p as 'sm'|'md'|'lg', current.fontScale))
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        const current = draftRef.current
        const idx = order.indexOf(current.preset)
        const nextIdx = idx === -1 ? order.indexOf('md') : Math.max(0, idx - 1)
        const p = order[nextIdx]
        applyDraft(getPresetCellSize(p as 'sm'|'md'|'lg', current.fontScale))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [applyDraft])

  const classes = useMemo(() => {
    const targetMin = Math.round(1100 / Math.max(4, draft.cols))
    const gridStyle: CSSProperties = {
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${targetMin}px), 1fr))`,
    }

    const numberPx = Math.round(clamp(draft.height * 0.23 * draft.fontScale, 16, 42))
    const bodyPx = Math.round(clamp(draft.height * 0.14 * draft.fontScale, 11, 22))
    const captionPx = Math.round(clamp(draft.height * 0.105 * draft.fontScale, 9, 16))
    const badgePx = Math.round(clamp(draft.height * 0.09 * draft.fontScale, 9, 13))
    const numberCls = ''
    const bodyCls = ''
    const captionCls = ''
    const badgeCls = ''
    const labelCls = captionCls
    const dotPx = draft.height >= 140 ? 'h-6 w-6' : draft.height >= 100 ? 'h-5 w-5' : 'h-4 w-4'
    const numberStyle: CSSProperties = { fontSize: numberPx, lineHeight: 1 }
    const bodyStyle: CSSProperties = { fontSize: bodyPx, lineHeight: 1.12 }
    const captionStyle: CSSProperties = { fontSize: captionPx, lineHeight: 1.12 }
    const badgeStyle: CSSProperties = { fontSize: badgePx, lineHeight: 1 }

    return { gridStyle, numberCls, bodyCls, captionCls, badgeCls, labelCls, dotPx, numberStyle, bodyStyle, captionStyle, badgeStyle }
  }, [draft])

  const summaryLabel = useMemo(() => {
    const name = draft.preset === 'sm' ? 'Nhỏ' : draft.preset === 'lg' ? 'Lớn' : draft.preset === 'md' ? 'Vừa' : 'Tuỳ chỉnh'
    return `${name} · ${draft.height}px · ${draft.cols} cột · ${Math.round(draft.fontScale * 100)}%`
  }, [draft])

  const isDirty = isCellSizeDirty(draft, saved)

  return { size: draft, savedSize: saved, isDirty, setPreset, setCustom, setFontScale, reset, markSynced, discardDraft, getCurrentSize, classes, summaryLabel, allowedCols: ALLOWED_COLS as readonly number[] }
}
