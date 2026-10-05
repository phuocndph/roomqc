import { useEffect } from 'react'

type Handler = (key: 'overview' | 'inbound' | 'outbound' | 'adjustments' | 'search') => void

/**
 * Keyboard shortcuts for the Inventory Hub.
 *   `/`     → focus quick search
 *   g o     → Tổng quan
 *   g i     → Nhập kho
 *   g x     → Xuất kho
 *   g k     → Kiểm kê
 *
 * Disabled when the user is typing in an input/textarea/contenteditable.
 */
export function useInventoryHubShortcuts(onTrigger: Handler) {
  useEffect(() => {
    let pendingG = false
    let timer: number | null = null

    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      )
    }

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e)) return

      if (e.key === '/') {
        e.preventDefault()
        onTrigger('search')
        return
      }

      if (e.key === 'g') {
        pendingG = true
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          pendingG = false
        }, 800)
        return
      }

      if (pendingG) {
        pendingG = false
        if (timer) window.clearTimeout(timer)
        if (e.key === 'o') onTrigger('overview')
        else if (e.key === 'i') onTrigger('inbound')
        else if (e.key === 'x') onTrigger('outbound')
        else if (e.key === 'k') onTrigger('adjustments')
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (timer) window.clearTimeout(timer)
    }
  }, [onTrigger])
}
