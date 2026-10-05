import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Lean draft autosave — localStorage, 24h TTL, debounced.
 * KHÔNG dùng server-side draft table. KHÔNG silent restore.
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const TTL_MS = 24 * 60 * 60 * 1000

export interface LeanDraftEnvelope<T> {
  version: 1
  savedAt: number
  data: T
}

export function leanDraftKey(roomId: string) {
  return `room-check-${roomId}`
}

export function readLeanDraft<T>(roomId: string): LeanDraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(leanDraftKey(roomId))
    if (!raw) return null
    const env = JSON.parse(raw) as LeanDraftEnvelope<T>
    if (!env?.savedAt || Date.now() - env.savedAt > TTL_MS) {
      localStorage.removeItem(leanDraftKey(roomId))
      return null
    }
    return env
  } catch {
    return null
  }
}

export function clearLeanDraft(roomId: string) {
  try {
    localStorage.removeItem(leanDraftKey(roomId))
  } catch { /* draft cleanup is best effort */ }
}

/**
 * useLeanDraft — autosave debounced 800ms.
 * Trả về { status, savedAt, saveNow, clear }.
 */
export function useLeanDraft<T>(
  roomId: string | undefined,
  data: T,
  enabled: boolean,
  debounceMs = 800,
) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  const firstRun = useRef(true)

  const persist = useCallback(
    (payload: T) => {
      if (!roomId) return
      try {
        setStatus('saving')
        const env: LeanDraftEnvelope<T> = {
          version: 1,
          savedAt: Date.now(),
          data: payload,
        }
        localStorage.setItem(leanDraftKey(roomId), JSON.stringify(env))
        setSavedAt(env.savedAt)
        setStatus('saved')
      } catch {
        setStatus('error')
      }
    },
    [roomId],
  )

  useEffect(() => {
    if (!enabled || !roomId) return
    // Bỏ qua lần render đầu để không lưu state rỗng
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => persist(data), debounceMs)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [data, enabled, roomId, debounceMs, persist])

  const saveNow = useCallback(() => persist(data), [persist, data])
  const clear = useCallback(() => {
    if (roomId) clearLeanDraft(roomId)
    setSavedAt(null)
    setStatus('idle')
  }, [roomId])

  return { status, savedAt, saveNow, clear }
}
