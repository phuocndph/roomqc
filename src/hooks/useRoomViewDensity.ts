import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'

export type RoomDensityPreset = 'sm' | 'md' | 'lg'

export interface RoomViewDensityState {
  preset: RoomDensityPreset
  fontScale: number // 0.85 – 1.4
}

const DEFAULT_STATE: RoomViewDensityState = { preset: 'md', fontScale: 1 }
const PRESET_SCALE: Record<RoomDensityPreset, number> = { sm: 0.9, md: 1, lg: 1.2 }

function storageKey(hotelId?: string | null) {
  return `rooms.viewDensity:${hotelId || 'default'}`
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function normalize(p: Partial<RoomViewDensityState> | null | undefined): RoomViewDensityState {
  if (!p) return DEFAULT_STATE
  const preset = (['sm', 'md', 'lg'] as const).includes(p.preset as RoomDensityPreset)
    ? (p.preset as RoomDensityPreset)
    : 'md'
  const fontScale = Number(clamp(typeof p.fontScale === 'number' ? p.fontScale : 1, 0.85, 1.4).toFixed(2))
  return { preset, fontScale }
}

function readStored(hotelId?: string | null): RoomViewDensityState {
  try {
    const raw = localStorage.getItem(storageKey(hotelId))
    if (raw) return normalize(JSON.parse(raw))
  } catch { /* local storage may be unavailable */ }
  return DEFAULT_STATE
}

export function useRoomViewDensity(hotelId?: string | null) {
  const [state, setState] = useState<RoomViewDensityState>(() => readStored(hotelId))

  useEffect(() => {
    setState(readStored(hotelId))
  }, [hotelId])

  const persist = useCallback((next: RoomViewDensityState) => {
    setState(next)
    try { localStorage.setItem(storageKey(hotelId), JSON.stringify(next)) } catch { /* persistence is best effort */ }
  }, [hotelId])

  const setPreset = useCallback((preset: RoomDensityPreset) => {
    persist(normalize({ preset, fontScale: PRESET_SCALE[preset] }))
  }, [persist])

  const setFontScale = useCallback((fontScale: number) => {
    persist(normalize({ ...state, fontScale, preset: 'md' }))
  }, [persist, state])

  const reset = useCallback(() => persist(DEFAULT_STATE), [persist])

  // Keyboard shortcuts Ctrl/Cmd + / - / 0
  useEffect(() => {
    const order: RoomDensityPreset[] = ['sm', 'md', 'lg']
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '0') { e.preventDefault(); persist(DEFAULT_STATE) }
      else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        const idx = Math.min(order.length - 1, order.indexOf(state.preset) + 1)
        setPreset(order[idx])
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        const idx = Math.max(0, order.indexOf(state.preset) - 1)
        setPreset(order[idx])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [persist, setPreset, state.preset])

  const styles = useMemo(() => {
    const s = state.fontScale
    const numberStyle: CSSProperties = { fontSize: Math.round(24 * s), lineHeight: 1 }
    const bodyStyle: CSSProperties = { fontSize: Math.round(12 * s), lineHeight: 1.25 }
    const captionStyle: CSSProperties = { fontSize: Math.round(11 * s), lineHeight: 1.2 }
    const rowPadding = state.preset === 'sm' ? 'py-1.5' : state.preset === 'lg' ? 'py-3' : 'py-2'
    const cellPadding = state.preset === 'sm' ? 'p-2' : state.preset === 'lg' ? 'p-4' : 'p-3'
    return { numberStyle, bodyStyle, captionStyle, rowPadding, cellPadding }
  }, [state])

  return { state, setPreset, setFontScale, reset, styles }
}
