import { workspaceBase, workspaceNext, workspacePath, workspaceSlug } from '@/lib/workspace'
import { isNativeApp } from './platform'

export const NATIVE_AUTH_SCHEME = 'com.roomqc.app:'
export type NativeAuthLink = { code: string | null; error: boolean; workspace: string | null; route: string }

/** PKCE codes only. Never accept bearer/refresh tokens from arbitrary deep links. */
export function parseNativeAuthLink(value: string): NativeAuthLink | null {
  try {
    const url = new URL(value)
    if (url.protocol !== NATIVE_AUTH_SCHEME || url.hostname !== 'auth' || url.port
      || url.username || url.password || url.hash
      || !['/callback', '/change-password'].includes(url.pathname)) return null
    const workspace = url.searchParams.get('workspace')
    if (workspace === '') return null
    if (['code', 'workspace', 'next', 'error'].some(key => url.searchParams.getAll(key).length > 1)) return null
    const base = workspace ? `/app/${workspace}` : ''
    if (workspace && workspaceSlug(`${base}/`) !== workspace) return null
    const rawNext = url.searchParams.get('next')
    const next = workspaceNext(rawNext, `${base}/`)
    if (rawNext && !next) return null
    // A callback without a workspace cannot introduce one through its destination.
    if (!workspace && next && workspaceSlug(next)) return null
    const code = url.searchParams.get('code')
    if (!code && !url.searchParams.has('error')) return null
    if (code && (code.length > 2048 || /\s/.test(code) || Array.from(code).some(c => c.charCodeAt(0) < 32))) return null
    return { code, error: url.searchParams.has('error'), workspace,
      route: `/auth${url.pathname}${next ? `?next=${encodeURIComponent(next)}` : ''}` }
  } catch { return null }
}

export function authRedirectUrl(path: '/auth/callback' | '/auth/change-password', next?: string | null): string {
  const safeNext = workspaceNext(next || null)
  if (!isNativeApp()) {
    return `${window.location.origin}${workspacePath(path)}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`
  }
  const url = new URL(`com.roomqc.app://auth/${path.split('/').pop()}`)
  const base = workspaceBase()
  if (base) url.searchParams.set('workspace', workspaceSlug(`${base}/`)!)
  if (safeNext) url.searchParams.set('next', safeNext)
  return url.toString()
}
