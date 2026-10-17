import { CapacitorHttp } from '@capacitor/core'
import { isNativeApp, nativePublicOrigin } from './native/platform'
/** No Supabase/App imports here: this module runs before a cluster client exists. */
export interface WorkspaceBootstrap {
  version: 1
  workspace: { id: string; slug: string; displayName: string; tenantId: string | null; status: 'reserved' | 'provisioning' | 'active'; routingVersion: number; reservationExpiresAt?: string | null }
  cluster: { id: string; url: string; publishableKey: string; vapidPublicKey: string }
}

export const directoryEnabled = import.meta.env.VITE_ROOMQC_DIRECTORY_ENABLED === 'true'
export function workspaceSlug(pathname: string): string | null {
  if (!/^\/app(?:\/|$)/.test(pathname)) return null
  const match = pathname.match(/^\/app\/([a-z][a-z0-9-]{2,47})(?:\/|$)/)
  if (!match || match[1].endsWith('-') || match[1].includes('--')) throw new Error('Địa chỉ doanh nghiệp không hợp lệ.')
  return match[1]
}

export function workspaceBase(pathname = window.location.pathname): string {
  const slug = workspaceSlug(pathname)
  return slug ? `/app/${slug}` : ''
}

export function workspacePath(path: string, pathname = window.location.pathname): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || Array.from(path).some(c => c.charCodeAt(0) < 32)) throw new Error('Đường dẫn nội bộ không hợp lệ.')
  // Reject ambiguous path segments before a browser normalizes away the workspace.
  let decoded: string
  try { decoded = decodeURIComponent(path.split(/[?#]/)[0]) } catch { throw new Error('Đường dẫn nội bộ không hợp lệ.') }
  if (decoded.includes('\\') || decoded.includes('//') || decoded.split('/').some(segment => segment === '.' || segment === '..')
    || Array.from(decoded).some(c => c.charCodeAt(0) < 32)) throw new Error('Đường dẫn nội bộ không hợp lệ.')
  const base = workspaceBase(pathname)
  if (path.startsWith('/app/')) {
    if (base && !(path === base || path.startsWith(`${base}/`))) throw new Error('Không thể chuyển doanh nghiệp bằng điều hướng nội bộ.')
    return path
  }
  return `${base}${path}`
}

export function clusterOrigins(): string[] {
  return String(import.meta.env.VITE_ROOMQC_CLUSTER_ORIGINS || import.meta.env.VITE_SUPABASE_URL || '')
    .split(',').map(value => value.trim()).filter(Boolean).map(value => new URL(value).origin)
}

/** A React Router destination: basename is applied by the router, not twice. */
export function workspaceNext(path: string | null, pathname = window.location.pathname): string | null {
  if (!path) return null
  try {
    const scoped = workspacePath(path, pathname)
    const route = scoped.slice(workspaceBase(pathname).length)
    return route.startsWith('/') ? route : `/${route}`
  } catch { return null }
}

export function validateBootstrap(value: unknown, slug: string, allowedOrigins: string[]): WorkspaceBootstrap {
  const data = value as WorkspaceBootstrap
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (data?.version !== 1 || data.workspace?.slug !== slug || !uuid.test(data.workspace.id)
    || !['reserved','provisioning','active'].includes(data.workspace.status)
    || !Number.isInteger(data.workspace.routingVersion) || data.workspace.routingVersion < 1
    || typeof data.workspace.displayName !== 'string' || typeof data.cluster?.id !== 'string'
    || typeof data.cluster.publishableKey !== 'string' || typeof data.cluster.vapidPublicKey !== 'string'
    || (data.workspace.tenantId !== null && !uuid.test(data.workspace.tenantId))
    || (data.workspace.status === 'active' && !data.workspace.tenantId)
    || (data.workspace.reservationExpiresAt != null && (typeof data.workspace.reservationExpiresAt !== 'string'
      || !Number.isFinite(Date.parse(data.workspace.reservationExpiresAt))))) throw new Error('Cấu hình doanh nghiệp không hợp lệ.')
  const url = new URL(data.cluster.url)
  if (data.cluster.url !== url.origin || !allowedOrigins.includes(url.origin)) throw new Error('Cụm dữ liệu chưa được cho phép trong phiên bản ứng dụng này.')
  return data
}

export async function controlRequest(path: string, options: RequestInit = {}) {
  if (isNativeApp()) {
    // Explicit native transport for the control service. Keep the web CSRF
    // origin policy intact and never enable a blanket CORS wildcard.
    if (!/^\/workspaces\/[a-z0-9-]+\/(bootstrap|provision)$/.test(path) && path !== '/signup-intents') throw new Error('Yêu cầu doanh nghiệp không hợp lệ.')
    const origin = nativePublicOrigin()
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await CapacitorHttp.request({
      url: `${origin}/api/control${path}`, method: options.method || 'GET',
      headers: { ...Object.fromEntries(new Headers(options.headers).entries()), 'Content-Type': 'application/json', Origin: origin },
      ...(options.body ? { data: JSON.parse(String(options.body)) } : {}),
      connectTimeout: 15000, readTimeout: 30000, disableRedirects: true,
    })
    const body = response.data
    if (response.status < 200 || response.status >= 300) throw new Error(`${body?.message || 'Không thể kết nối dịch vụ doanh nghiệp.'}${body?.requestId ? ` (Mã hỗ trợ: ${body.requestId})` : ''}`)
    return body
  }
  const response = await fetch(`/api/control${path}`, { ...options, cache: 'no-store',
    credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...options.headers } })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${body?.message || 'Không thể kết nối dịch vụ doanh nghiệp.'}${body?.requestId ? ` (Mã hỗ trợ: ${body.requestId})` : ''}`)
  return body
}

export async function resolveWorkspace(pathname = window.location.pathname): Promise<WorkspaceBootstrap | null> {
  const slug = workspaceSlug(pathname)
  if (!slug) return null
  if (!directoryEnabled) throw new Error('Đường dẫn doanh nghiệp chưa được bật trên hệ thống này.')
  return validateBootstrap(await controlRequest(`/workspaces/${slug}/bootstrap`), slug, clusterOrigins())
}
