import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  LayoutDashboard,
  Package,
  Hotel,
  Wind,
  Warehouse,
  FileText,
  Settings,
  Users,
  Building2,
} from 'lucide-react'

interface MobileNavProps {
  open: boolean
  onClose: () => void
}

const navigation = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Kho & Tài sản', href: '/inventory', icon: Warehouse },
  { title: 'Bổ sung đồ', href: '/supplements', icon: Package },
  { title: 'Phòng', href: '/rooms', icon: Hotel },
  { title: 'Giặt là', href: '/laundry', icon: Wind },
  { title: 'Nhân sự', href: '/staff', icon: Users },
  { title: 'Báo cáo', href: '/reports', icon: FileText },
  { title: 'Khách sạn', href: '/hotels', icon: Building2 },
  { title: 'Cài đặt', href: '/settings', icon: Settings },
]

export function MobileNav({ open, onClose }: MobileNavProps) {
  const location = useLocation()

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <span className="font-semibold">Menu</span>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.title}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  )
}
