import type { WorkspaceBootstrap } from './workspace'

const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawPublishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

/** Detect both new secret keys and legacy JWT service-role keys. */
export function isServiceRoleKey(value: string): boolean {
  if (/^(sb_secret_|service_role)/i.test(value) || /service_role/i.test(value)) return true

  const parts = value.split('.')
  if (parts.length !== 3 || typeof atob !== 'function') return false

  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: unknown }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

/** Accept a single public key, never a serialized configuration object. */
export function isPublishableKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false
  try {
    const encoded = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4))).role === 'anon'
  } catch { return false }
}

export const runtimeConfig = {
  supabaseUrl: rawSupabaseUrl,
  supabasePublishableKey: rawPublishableKey,
  vapidPublicKey: String(import.meta.env.VITE_VAPID_PUBLIC_KEY || ''),
  workspace: null as WorkspaceBootstrap | null,
  // Require an explicit opt-in even during dev so a local dev server cannot
  // accidentally seed a remote production project.
  demoDataEnabled: String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? '').toLowerCase() === 'true',
}

/** Called once by main before importing App and its Supabase singleton. */
export function configureWorkspace(bootstrap: WorkspaceBootstrap | null): void {
  if (!bootstrap) return
  if (isServiceRoleKey(bootstrap.cluster.publishableKey)) throw new Error('Không được đưa khóa quản trị vào trình duyệt.')
  runtimeConfig.supabaseUrl = bootstrap.cluster.url
  runtimeConfig.supabasePublishableKey = bootstrap.cluster.publishableKey
  runtimeConfig.vapidPublicKey = bootstrap.cluster.vapidPublicKey
  runtimeConfig.workspace = bootstrap
  assertRuntimeConfig()
}

export function scopedStorageKey(key: string, userId?: string | null): string {
  const workspace = runtimeConfig.workspace
  return workspace ? `roomqc:${workspace.cluster.id}:${workspace.workspace.id}:${userId || 'anonymous'}:${key}` : key
}

/**
 * Fail early with an actionable message instead of surfacing a vague network
 * error when a deployment was built without the public Supabase settings.
 */
export function assertRuntimeConfig(): void {
  if (!runtimeConfig.supabaseUrl) {
    throw new Error('Thiếu VITE_SUPABASE_URL. Hãy kiểm tra file .env trước khi khởi chạy RoomQC.')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(runtimeConfig.supabaseUrl)
  } catch {
    throw new Error('VITE_SUPABASE_URL không hợp lệ. Cần là URL đầy đủ, ví dụ https://project.supabase.co.')
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('VITE_SUPABASE_URL phải dùng http:// hoặc https://.')
  }

  if (!runtimeConfig.supabasePublishableKey) {
    throw new Error('Thiếu VITE_SUPABASE_PUBLISHABLE_KEY. Hãy kiểm tra file .env trước khi khởi chạy RoomQC.')
  }

  if (isServiceRoleKey(runtimeConfig.supabasePublishableKey)) {
    throw new Error('Không được đưa service_role/secret key vào frontend RoomQC.')
  }
  if (!isPublishableKey(runtimeConfig.supabasePublishableKey)) {
    throw new Error('Khóa công khai Supabase không hợp lệ. Chỉ nhập một publishable key hoặc anon JWT.')
  }
}
