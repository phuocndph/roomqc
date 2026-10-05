import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { 
  Home,
  Package,
  LayoutDashboard,
  Shirt,
  Wrench,
  ShoppingCart,
  TrendingUp,
  Building2,
  Users,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  DoorOpen,
  Boxes,
  List,
  Download,
  CheckCircle,
  CalendarDays,
  FileText
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { useUserModulePermissions } from '@/hooks/useUserModulePermissions'
import { useHotelContext } from '@/contexts/HotelContext'
import { usePendingCounts, type PendingCounts } from '@/hooks/usePendingCounts'
import { useUsageMode, type UsageMode } from '@/hooks/useUsageMode'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { useToast } from '@/hooks/use-toast'
import { InstallGuideSheet } from '@/components/pwa/InstallGuideSheet'

type PendingCountKey = keyof PendingCounts

interface MenuItem {
  title: string
  icon: typeof Home
  path: string
  module?: string
  badgeKey?: PendingCountKey
  minMode?: UsageMode
  roles?: string[]
}

interface MenuSection {
  title?: string
  items: MenuItem[]
}

interface MobileSidebarProps {
  onClose: () => void
}

export const MobileSidebar = ({ onClose }: MobileSidebarProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const { user, role, tenantId } = useUser()
  const { data: modulePermissions } = useUserModulePermissions()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { canInstall, installPWA, isInstalled } = usePWAInstall()
  const { toast } = useToast()
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const { data: pendingCounts } = usePendingCounts()
  const { hasMode } = useUsageMode()

  // Inventory links live in the global menu so the inventory page does not
  // need a second, competing navigation panel on mobile.
  const inventoryMenuItems: MenuItem[] = [
    { title: 'Tổng quan kho', icon: LayoutDashboard, path: '/inventory', module: 'inventory,items', badgeKey: 'inventoryTotal', minMode: 'standard' },
    { title: 'Danh sách tài sản', icon: Package, path: '/items', module: 'items', minMode: 'standard' },
    { title: 'Danh mục', icon: Package, path: '/items/categories', module: 'items', minMode: 'standard' },
    { title: 'Nhập kho', icon: Package, path: '/inventory/inbound', module: 'inventory', minMode: 'standard' },
    { title: 'Xuất kho', icon: Package, path: '/inventory/outbound', module: 'inventory', minMode: 'standard' },
    { title: 'Chuyển kho', icon: Package, path: '/inventory?tab=operations&sub=transfer', module: 'inventory', minMode: 'standard' },
    { title: 'Kiểm kê', icon: Package, path: '/inventory/adjustments', module: 'inventory', minMode: 'standard' },
    { title: 'Phân phối', icon: Package, path: '/inventory/distributions', module: 'inventory', minMode: 'standard' },
    { title: 'Lịch sử giao dịch', icon: Package, path: '/inventory?tab=operations&sub=transactions', module: 'inventory', minMode: 'standard' },
    { title: 'Đề xuất bổ sung', icon: Package, path: '/inventory/reorder', module: 'inventory', minMode: 'standard' },
    { title: 'Tồn kho ứ đọng', icon: Package, path: '/inventory/dead-stock', module: 'inventory', minMode: 'standard' },
    { title: 'Phân tích tiêu thụ', icon: Package, path: '/inventory/analytics', module: 'inventory', minMode: 'standard' },
    { title: 'Yêu cầu bổ sung', icon: Package, path: '/inventory?tab=settings&sub=supplements', module: 'inventory', minMode: 'standard' },
    { title: 'Quản lý kho', icon: Package, path: '/settings/warehouses', module: 'inventory', minMode: 'standard', roles: ['owner', 'hotel_manager'] },
    { title: 'Nhà cung cấp', icon: Building2, path: '/vendors', module: 'vendors', minMode: 'standard' },
    { title: 'So sánh nhà cung cấp', icon: Building2, path: '/vendors/compare', module: 'vendors', minMode: 'full' },
    { title: 'Đơn đặt hàng', icon: ShoppingCart, path: '/purchase-orders', module: 'purchase_orders', minMode: 'full' },
  ]
  // Handle PWA install
  const handleInstallApp = async () => {
    if (isInstalled) return
    
    if (canInstall) {
      const success = await installPWA()
      if (success) {
        toast({
          title: "Cài đặt thành công!",
          description: "Ứng dụng đã được thêm vào màn hình chính.",
        })
        onClose()
      } else {
        toast({
          title: "Không thể cài đặt",
          description: "Vui lòng làm theo hướng dẫn thủ công.",
          variant: "destructive",
        })
        setShowInstallGuide(true)
      }
    } else {
      // Show install guide sheet with illustrations (don't close sidebar)
      setShowInstallGuide(true)
    }
  }

  // Owner-specific menu (strategic focus)
  const ownerMenuSections: MenuSection[] = [
    {
      items: [
        { title: 'Dashboard', icon: Home, path: '/' },
        { title: 'Đặt phòng', icon: CalendarDays, path: '/bookings' },
        { title: 'Danh sách phòng', icon: DoorOpen, path: '/rooms' },
      ]
    },
    {
      title: 'Kho & Tài sản',
      items: inventoryMenuItems,
    },
    {
      title: 'Báo cáo & Thống kê',
      items: [
        { title: 'Tổng hợp', icon: TrendingUp, path: '/reports', minMode: 'standard' },
        { title: 'Tài chính', icon: FileText, path: '/reports/finance', minMode: 'standard' },
        { title: 'Vận hành phòng', icon: LayoutDashboard, path: '/reports/operations', minMode: 'standard' },
        { title: 'Buồng & Giặt là', icon: DoorOpen, path: '/reports/housekeeping', minMode: 'standard' },
        { title: 'Kho & Bảo trì', icon: Package, path: '/reports/inventory', minMode: 'standard' },
      ]
    },
    {
      title: 'Quản lý',
      items: [
        { title: 'Khách sạn', icon: Building2, path: '/settings/hotels' },
        { title: 'Nhân sự', icon: Users, path: '/settings/users', minMode: 'standard' },
      ]
    },
    {
      title: 'Cài đặt',
      items: [
        { title: 'Cài đặt chung', icon: Settings, path: '/settings' },
        { title: 'Hỗ trợ', icon: HelpCircle, path: '/help' },
      ]
    }
  ]

  // Manager/Staff menu (operational details)
  const managerMenuSections: MenuSection[] = [
    {
      items: [
        { title: 'Dashboard', icon: Home, path: '/' },
      ]
    },
    {
      title: 'Vận hành',
      items: [
        { title: 'Phòng', icon: DoorOpen, path: '/rooms', module: 'rooms' },
        { title: 'Laundry', icon: Shirt, path: '/laundry', module: 'laundry', badgeKey: 'laundryTotal', minMode: 'standard' },
        { title: 'Bảo trì', icon: Wrench, path: '/maintenance', module: 'maintenance', badgeKey: 'maintenanceTotal', minMode: 'standard' },
      ]
    },
    {
      title: 'Kho & Tài sản',
      items: inventoryMenuItems,
    },
    {
      title: 'Quản lý',
      items: [
        { title: 'Khách sạn', icon: Building2, path: '/hotels', module: 'hotels' },
        { title: 'Nhân viên', icon: Users, path: '/users', module: 'users', minMode: 'standard' },
        { title: 'Nhà cung cấp', icon: Users, path: '/vendors', module: 'vendors', minMode: 'full' },
      ]
    },
    {
      title: 'Cài đặt',
      items: [
        { title: 'Cài đặt', icon: Settings, path: '/settings' },
        { title: 'Hỗ trợ', icon: HelpCircle, path: '/help' },
      ]
    }
  ]

  // Select menu based on role
  const menuSections = role === 'owner' ? ownerMenuSections : managerMenuSections

  const handleNavigation = (path: string) => {
    navigate(path)
    onClose()
  }

  const handleSignOut = async () => {
    await signOut()
    onClose()
    navigate('/auth/login')
  }

  // Check if user has module access
  const hasModuleAccess = (moduleCode?: string): boolean => {
    if (!moduleCode) return true
    if (role === 'super_admin' || role === 'owner') return true
    
    // Support multiple modules separated by comma
    const modules = moduleCode.split(',')
    return modules.some(module => {
      const permission = modulePermissions?.find(p => p.module === module)
      if (!permission) return false
      
      return permission.can_view || permission.can_create || permission.can_update || permission.can_delete
    })
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    const [pathname, query] = path.split('?')
    if (!location.pathname.startsWith(pathname)) return false
    if (!query) return true
    const expected = new URLSearchParams(query)
    const current = new URLSearchParams(location.search)
    return Array.from(expected.entries()).every(([key, value]) => current.get(key) === value)
  }

  const getBadgeCount = (badgeKey?: PendingCountKey): number => {
    if (!badgeKey || !pendingCounts) return 0
    return pendingCounts[badgeKey] || 0
  }

  return (
    <div className="flex flex-col h-full">
      {/* User Profile Section */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user?.full_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {user?.full_name || 'User'}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {role?.replace('_', ' ') || 'User'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAllHotelsMode ? 'Tất cả khách sạn' : selectedHotel?.name || 'Chưa chọn khách sạn'}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => handleNavigation('/settings/profile')}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Hotel Switcher Button */}
        <Button
          variant="outline"
          className="w-full mt-3 justify-between"
          onClick={() => handleNavigation('/hotels')}
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="text-sm">
              {isAllHotelsMode ? 'Tất cả khách sạn' : selectedHotel?.name || 'Chọn khách sạn'}
            </span>
          </div>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Menu Items */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {menuSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="mb-4">
              {section.title && (
                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </h3>
              )}
              <div className="space-y-1">
                {section.items
                  .filter((item) => hasModuleAccess(item.module) && (!item.minMode || hasMode(item.minMode)) && (!item.roles || item.roles.includes(role || '')))
                  .map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.path)
                    const badgeCount = getBadgeCount(item.badgeKey)

                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigation(item.path)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg relative",
                          "transition-colors duration-200",
                          "hover:bg-accent",
                          "active:scale-98",
                          active && "bg-accent text-accent-foreground font-medium"
                        )}
                      >
                        <Icon className={cn(
                          "h-5 w-5 flex-shrink-0",
                          active ? "text-primary" : "text-muted-foreground"
                        )} />
                        <span className="flex-1 text-left">{item.title}</span>
                        {badgeCount > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </Badge>
                        )}
                        {active && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Install App Button - Always visible */}
      <div className="px-4 py-2 border-t">
        <button aria-label="Xác nhận"
          onClick={handleInstallApp}
          disabled={isInstalled}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
            "transition-colors duration-200",
            isInstalled 
              ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 cursor-default" 
              : "hover:bg-accent active:scale-98"
          )}
        >
          {isInstalled ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500" />
              <span className="flex-1 text-left">Đã cài đặt</span>
            </>
          ) : (
            <>
              <Download className="h-5 w-5 text-primary" />
              <span className="flex-1 text-left">Tải ứng dụng</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                PWA
              </Badge>
            </>
          )}
        </button>
      </div>

      {/* Sign Out */}
      <div className="p-4 border-t safe-area-bottom">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>

      {/* PWA Install Guide Sheet */}
      <InstallGuideSheet 
        open={showInstallGuide} 
        onOpenChange={setShowInstallGuide} 
      />
    </div>
  )
}
