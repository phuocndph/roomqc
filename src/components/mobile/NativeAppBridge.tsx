import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Keyboard } from '@capacitor/keyboard'
import { Network } from '@capacitor/network'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { focusManager, onlineManager, useQueryClient } from '@tanstack/react-query'
import type { createBrowserRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { isNativeApp } from '@/lib/native/platform'
import { parseNativeAuthLink } from '@/lib/native/auth-links'
import { workspaceSlug } from '@/lib/workspace'

type Router = ReturnType<typeof createBrowserRouter>

/** Native lifecycle stays outside pages, including login/onboarding. */
export function NativeAppBridge({ router }: { router: Router }) {
  const queryClient = useQueryClient()
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    if (!isNativeApp()) return
    let disposed = false
    const handles: PluginListenerHandle[] = []
    const codes = new Set<string>()
    let exchanging = false
    const track = async (promise: Promise<PluginListenerHandle>) => {
      const handle = await promise
      if (disposed) await handle.remove()
      else handles.push(handle)
    }
    async function openAuthLink(raw: string) {
      const link = parseNativeAuthLink(raw)
      if (disposed || !link || exchanging) return
      if (link.workspace !== workspaceSlug(window.location.pathname)) {
        toast.error('Liên kết thuộc doanh nghiệp khác. Hãy mở đúng doanh nghiệp rồi đăng nhập lại.')
        return
      }
      if (link.error) { toast.error('Đăng nhập chưa hoàn tất. Vui lòng thử lại.'); return }
      if (!link.code || codes.has(link.code)) return
      exchanging = true
      codes.add(link.code)
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(link.code)
        if (error) throw error
        if (Capacitor.getPlatform() === 'ios') await Browser.close().catch(() => undefined)
        if (!disposed) await router.navigate(link.route, { replace: true })
      } catch {
        if (!disposed) toast.error('Liên kết đã hết hạn hoặc được mở trên máy khác. Hãy đăng nhập lại trên điện thoại này.')
      } finally { exchanging = false }
    }
    function connection(connected: boolean) {
      if (disposed) return
      setOffline(!connected)
      onlineManager.setOnline(connected)
    }
    async function initialize() {
      await track(App.addListener('appUrlOpen', event => { void openAuthLink(event.url) }))
      const launch = await App.getLaunchUrl()
      if (launch?.url) await openAuthLink(launch.url)
      await track(App.addListener('appStateChange', ({ isActive }) => {
        if (disposed) return
        focusManager.setFocused(isActive)
        if (isActive) {
          supabase.auth.startAutoRefresh()
          void queryClient.invalidateQueries({ refetchType: 'active' })
        } else supabase.auth.stopAutoRefresh()
      }))
      await track(App.addListener('appRestoredResult', result => {
        if (!disposed && result.pluginId === 'Camera') {
          toast.info('Ứng dụng vừa được hệ thống mở lại. Hãy mở đúng công việc và chụp lại ảnh; ảnh trước chưa được gửi.')
        }
      }))
      await track(Network.addListener('networkStatusChange', status => connection(status.connected)))
      connection((await Network.getStatus()).connected)
      if (Capacitor.getPlatform() === 'ios') {
        await track(Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('native-keyboard-open')))
        await track(Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('native-keyboard-open')))
      }
      if (Capacitor.getPlatform() === 'android') {
        await track(App.addListener('backButton', () => {
          if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
            return
          }
          if ((window.history.state?.idx ?? 0) > 0) { void router.navigate(-1); return }
          const path = router.state.location.pathname
          if (!['/', '/auth/login', '/start', '/my-tasks', '/staff/housekeeping'].includes(path)) {
            void router.navigate('/', { replace: true })
          } else void App.minimizeApp()
        }))
      }
    }
    void initialize().catch(() => { if (!disposed) toast.error('Chưa khởi tạo được đầy đủ tính năng điện thoại. Hãy đóng và mở lại ứng dụng.') })
    return () => {
      disposed = true
      handles.forEach(handle => { void handle.remove() })
      document.documentElement.classList.remove('native-keyboard-open')
      focusManager.setFocused(undefined)
    }
  }, [queryClient, router])

  if (!isNativeApp() || !offline) return null
  return <div role="status" className="native-offline-banner">
    Mất kết nối mạng. Dữ liệu có thể chưa cập nhật; kiểm tra lại trước khi gửi thao tác lần nữa.
  </div>
}
