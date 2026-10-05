import { ArrowLeft, LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useUser } from '@/hooks/useUser'
import { navigateBack } from '@/lib/navigation'

interface MobileDetailHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  action?: {
    icon: LucideIcon
    onClick: () => void
    label?: string
  }
  rightContent?: React.ReactNode
  className?: string
}

// Trang root của các tab — luôn ẩn back ở đây
const ROOT_PATHS = new Set<string>([
  '/',
  '/my-tasks',
  '/staff/housekeeping',
  '/bookings',
  '/rooms',
  '/laundry',
  '/maintenance',
  '/inventory',
  '/items',
  '/more',
  '/settings',
  '/guests',
  '/vendors',
  '/hotels',
  '/reports',
  '/purchase-orders',
])

// Suy ra module root từ pathname để fallback khi không có history
const inferModuleRoot = (pathname: string, department?: string): string => {
  // Room Check thường mở từ Tasks → ưu tiên về Tasks
  if (/^\/rooms\/[^/]+\/check/.test(pathname)) {
    return department === 'housekeeping' ? '/staff/housekeeping' : '/my-tasks'
  }
  if (pathname.startsWith('/rooms')) return '/rooms'
  if (pathname.startsWith('/bookings')) return '/bookings'
  if (pathname.startsWith('/laundry')) return '/laundry'
  if (pathname.startsWith('/maintenance')) return '/maintenance'
  if (pathname.startsWith('/guests')) return '/guests'
  if (pathname.startsWith('/vendors')) return '/vendors'
  if (pathname.startsWith('/hotels')) return '/hotels'
  if (pathname.startsWith('/reports')) return '/reports'
  if (pathname.startsWith('/purchase-orders')) return '/purchase-orders'
  if (pathname.startsWith('/inventory') || pathname.startsWith('/items')) return '/inventory'
  if (pathname.startsWith('/my-tasks') || pathname.startsWith('/staff/housekeeping')) {
    return department === 'housekeeping' ? '/staff/housekeeping' : '/my-tasks'
  }
  if (pathname.startsWith('/settings')) return '/settings'
  if (pathname.startsWith('/more')) return '/more'
  return '/'
}

export const MobileDetailHeader = ({
  title,
  showBack = true,
  onBack,
  action,
  rightContent,
  className,
}: MobileDetailHeaderProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useUser()

  // Auto-hide back nếu đang ở trang root tab — bất kể prop showBack
  const isRoot = ROOT_PATHS.has(location.pathname)
  const shouldShowBack = showBack && !isRoot

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }

    const fallback = inferModuleRoot(location.pathname, user?.department)
    navigateBack(navigate, fallback)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-20 bg-background border-b shadow-sm safe-area-top',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left: Back Button + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {shouldShowBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 flex-shrink-0"
              onClick={handleBack}
             aria-label="Quay lại">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="font-semibold text-base truncate">{title}</h1>
        </div>

        {/* Right: Action Button or Custom Content */}
        {rightContent ? (
          rightContent
        ) : action && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={action.onClick}
            aria-label={action.label}
          >
            <action.icon className="h-5 w-5" />
          </Button>
        )}
      </div>
    </header>
  )
}
