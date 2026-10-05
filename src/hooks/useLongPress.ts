import { useCallback, useRef } from 'react'

interface Options {
  threshold?: number // ms
  onCancel?: () => void
}

/**
 * Long-press handler hỗ trợ touch + mouse. 
 * Trả về handlers gắn vào element. `prevent` set true sẽ chặn click sau long-press.
 */
export function useLongPress(callback: (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => void, options: Options = {}) {
  const { threshold = 500, onCancel } = options
  const timerRef = useRef<number | null>(null)
  const triggeredRef = useRef(false)

  const start = useCallback(
    (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
      triggeredRef.current = false
      timerRef.current = window.setTimeout(() => {
        triggeredRef.current = true
        callback(e)
      }, threshold)
    },
    [callback, threshold],
  )

  const clear = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
      onCancel?.()
    }
  }, [onCancel])

  const wasTriggered = useCallback(() => triggeredRef.current, [])

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    wasTriggered,
  }
}
