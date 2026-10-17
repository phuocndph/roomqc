import { App } from '@capacitor/app'
import { isNativeApp, nativePublicOrigin } from './platform'
import { parseNativeAuthLink } from './auth-links'
import { directoryEnabled, workspaceBase, workspaceSlug } from '@/lib/workspace'

const LAST_WORKSPACE = 'roomqc-native-workspace-v1'

/** Before loading the router and workspace-scoped Supabase singleton. */
export async function prepareNativeApp(): Promise<void> {
  if (!isNativeApp()) return
  nativePublicOrigin()
  document.documentElement.classList.add('roomqc-native')
  const launch = parseNativeAuthLink((await App.getLaunchUrl())?.url || '')
  if (window.location.pathname === '/') {
    let base = ''
    if (directoryEnabled) {
      let saved: string | null = null
      try { saved = localStorage.getItem(LAST_WORKSPACE) } catch { /* optional preference */ }
      const slug = launch?.workspace || saved
      try { if (slug && workspaceSlug(`/app/${slug}/`) === slug) base = `/app/${slug}` } catch { /* ignore invalid saved slug */ }
    }
    window.history.replaceState(null, '', base ? `${base}/auth/login` : directoryEnabled ? '/start?mode=login' : '/auth/login')
  }
  const base = workspaceBase()
  try {
    if (base) localStorage.setItem(LAST_WORKSPACE, workspaceSlug(`${base}/`)!)
    else localStorage.removeItem(LAST_WORKSPACE)
  } catch { /* preference must not block login */ }
}
