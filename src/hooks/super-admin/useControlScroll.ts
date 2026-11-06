import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** Restore a list only after its rows have loaded, within the layout's actual scroll container. */
export function useControlScroll(ready: boolean) {
  const location = useLocation(), key = location.pathname + location.search
  const root = useRef<HTMLDivElement>(null), positions = useRef(new Map<string, number>())
  const current = useRef({ key, restored: false })
  if (current.current.key !== key) current.current = { key, restored: false }
  if (!ready) current.current.restored = false
  useLayoutEffect(() => {
    const main = root.current?.closest('main')
    if (!main) return
    main.scrollTop = 0
    const save = () => {
      if (current.current.key !== key || !current.current.restored) return
      positions.current.delete(key); positions.current.set(key, main.scrollTop)
      if (positions.current.size > 50) positions.current.delete(positions.current.keys().next().value)
    }
    main.addEventListener('scroll', save, { passive: true })
    return () => main.removeEventListener('scroll', save)
  }, [key])
  useLayoutEffect(() => {
    const main = root.current?.closest('main')
    if (!main || !ready || current.current.restored) return
    main.scrollTop = positions.current.get(key) ?? 0
    current.current.restored = true
  }, [key, ready])
  return root
}
