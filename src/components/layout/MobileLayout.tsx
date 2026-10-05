import { Outlet } from 'react-router-dom'
import { MobileBottomNav } from './MobileBottomNav'
import { InstallPWA } from '@/components/pwa/InstallPWA'

export const MobileLayout = () => {
  return (
    <div className="min-h-dvh bg-background safe-area-x">
      <main className="safe-area-top" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>
      <MobileBottomNav />
      <InstallPWA />
    </div>
  )
}
