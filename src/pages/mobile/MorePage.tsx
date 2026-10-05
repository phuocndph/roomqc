import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  DoorOpen,
  Shirt,
  Wrench,
  ShoppingCart,
  TrendingUp,
  Building2,
  Users,
  Settings,
  List,
  ChevronRight,
  LogOut,
  HelpCircle,
  User,
  ClipboardList,
  CalendarDays,
  SlidersHorizontal,
} from 'lucide-react'
import { MobileNavCustomizeSheet } from '@/components/mobile/MobileNavCustomizeSheet'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { useUserModulePermissions } from '@/hooks/useUserModulePermissions'
import { MobileModuleCard } from '@/components/mobile'
import { APP_VERSION } from '@/lib/app-version'

interface ModuleItem {
  icon: typeof Package
  label: string
  path: string
  module?: string
  color: string
}

export function MorePage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { user, role } = useUser()
  const { data: modulePermissions } = useUserModulePermissions()
  const [customizeOpen, setCustomizeOpen] = useState(false)


  const modules: ModuleItem[] = [
    { icon: CalendarDays, label: 'Đặt phòng', path: '/bookings', module: 'bookings', color: 'text-primary' },
    { icon: Package, label: 'Kho & Tài sản', path: '/inventory', module: 'inventory,items', color: 'text-blue-600' },
    { icon: DoorOpen, label: 'Phòng', path: '/rooms', module: 'rooms', color: 'text-green-600' },
    { icon: Shirt, label: 'Laundry', path: '/laundry', module: 'laundry', color: 'text-cyan-600' },
    { icon: Wrench, label: 'Bảo trì', path: '/maintenance', module: 'maintenance', color: 'text-orange-600' },
    { icon: ShoppingCart, label: 'Đơn mua hàng', path: '/purchase-orders', module: 'purchase_orders', color: 'text-purple-600' },
    { icon: TrendingUp, label: 'Báo cáo', path: '/reports', module: 'reports', color: 'text-indigo-600' },
    { icon: Building2, label: 'Khách sạn', path: '/hotels', module: 'hotels', color: 'text-rose-600' },
    { icon: Users, label: 'Nhân viên', path: '/users', module: 'users', color: 'text-teal-600' },
    { icon: List, label: 'Nhà cung cấp', path: '/vendors', module: 'vendors', color: 'text-amber-600' },
  ]

  const quickLinks = [
    { icon: ClipboardList, label: 'Công việc của tôi', path: '/my-tasks' },
    { icon: User, label: 'Hồ sơ cá nhân', path: '/settings/profile' },
    { icon: Settings, label: 'Cài đặt', path: '/settings' },
    { icon: HelpCircle, label: 'Trợ giúp & Hỗ trợ', path: '/help' },
  ]

  const hasModuleAccess = (moduleCode?: string): boolean => {
    if (!moduleCode) return true
    if (role === 'super_admin' || role === 'owner') return true
    
    const modules = moduleCode.split(',')
    return modules.some(module => {
      const permission = modulePermissions?.find(p => p.module === module)
      if (!permission) return false
      return permission.can_view || permission.can_create || permission.can_update || permission.can_delete
    })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="p-4">
          <h1 className="text-2xl font-bold">Thêm</h1>
          <p className="text-sm text-muted-foreground">
            Truy cập các chức năng khác
          </p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Modules Grid */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            CHỨC NĂNG
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {modules.filter(m => hasModuleAccess(m.module)).map((module) => (
              <MobileModuleCard
                key={module.path}
                icon={module.icon}
                label={module.label}
                path={module.path}
                color={module.color}
                onClick={() => navigate(module.path)}
              />
            ))}
          </div>
        </section>

        <Separator />

        {/* Quick Links */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            LIÊN KẾT NHANH
          </h2>
          <Card>
            <CardContent className="p-0">
              <button
                onClick={() => setCustomizeOpen(true)}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors"
              >
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-left">Tùy chỉnh thanh dưới</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <Separator />
              {quickLinks.map((link, index) => {
                const Icon = link.icon
                return (
                  <div key={link.path}>
                    <button
                      onClick={() => navigate(link.path)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors"
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="flex-1 text-left">{link.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {index < quickLinks.length - 1 && <Separator />}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>

        <MobileNavCustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />

        {/* App Info */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            THÔNG TIN
          </h2>
          <Card>
            <CardContent className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => navigate('/whats-new')}
                className="flex justify-between items-center text-sm w-full hover:text-primary"
              >
                <span className="text-muted-foreground">Phiên bản</span>
                <span className="font-medium flex items-center gap-1">
                  v{APP_VERSION}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Người dùng</span>
                <span className="font-medium">{user?.full_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vai trò</span>
                <span className="font-medium capitalize">{role?.replace('_', ' ')}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sign Out */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Đăng xuất
        </Button>
      </div>
    </div>
  )
}
