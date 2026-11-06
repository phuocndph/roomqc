import { useEffect, useRef } from 'react'

/** Refresh only visible consoles, without overlapping requests or stale callbacks. */
export function useControlAutoRefresh(query: { enabled: boolean; isFetching: boolean; refetch: () => unknown }, intervalMs = 20_000) {
  const latest = useRef(query)
  latest.current = query
  useEffect(() => {
    if (!query.enabled) return
    const refresh = () => {
      if (!document.hidden && !latest.current.isFetching) void latest.current.refetch()
    }
    const timer = setInterval(refresh, intervalMs)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [query.enabled, intervalMs])
}
