import type { NavigateFunction } from 'react-router-dom'

/**
 * Return to the entry screen that opened the current route.
 * React Router stores an in-app index in history.state.idx.  Using it avoids
 * leaving the SPA when the current page was opened directly in a new tab;
 * callers can provide the relevant list as a safe deep-link fallback.
 */
export function navigateBack(navigate: NavigateFunction, fallback = '/') {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  if (idx > 0) {
    navigate(-1)
    return
  }
  navigate(fallback, { replace: true })
}
