import {
  Home,
  DoorOpen,
  Shirt,
  Wrench,
  ClipboardList,
  CalendarDays,
  Package,
  MoreHorizontal,
  TrendingUp,
  Building2,
  Users,
  List,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react'

export type PendingCountKey =
  | 'tasks'
  | 'bookings'
  | 'rooms'
  | 'laundry'
  | 'maintenance'
  | 'inventory'

export interface NavTabDef {
  id: string
  label: string
  icon: LucideIcon
  path: string
  modules?: string[]
  badgeKey?: PendingCountKey
  alwaysShow?: boolean
  /** Cố định ở vị trí đầu/cuối, không cho user ẩn/đổi chỗ */
  pinned?: 'start' | 'end'
}

// Pool đầy đủ — Home (pinned start) + module + More (pinned end).
export const NAV_TABS_POOL: NavTabDef[] = [
  { id: 'home', label: 'Home', icon: Home, path: '/', alwaysShow: true, pinned: 'start' },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: ClipboardList,
    path: '/my-tasks',
    badgeKey: 'tasks',
    modules: ['housekeeping_tasks', 'room_checks', 'maintenance_requests', 'distribution_orders'],
  },
  { id: 'bookings', label: 'Đặt phòng', icon: CalendarDays, path: '/bookings', modules: ['bookings'] },
  { id: 'rooms', label: 'Phòng', icon: DoorOpen, path: '/rooms', modules: ['rooms'] },
  { id: 'laundry', label: 'Giặt là', icon: Shirt, path: '/laundry', modules: ['laundry'] },
  { id: 'maintenance', label: 'Bảo trì', icon: Wrench, path: '/maintenance', modules: ['maintenance_requests', 'maintenance'] },
  { id: 'inventory', label: 'Kho', icon: Package, path: '/inventory', modules: ['inventory', 'items'] },
  { id: 'reports', label: 'Báo cáo', icon: TrendingUp, path: '/reports', modules: ['reports'] },
  { id: 'hotels', label: 'Khách sạn', icon: Building2, path: '/hotels', modules: ['hotels'] },
  { id: 'users', label: 'Nhân viên', icon: Users, path: '/users', modules: ['users'] },
  { id: 'vendors', label: 'NCC', icon: List, path: '/vendors', modules: ['vendors'] },
  { id: 'purchase_orders', label: 'Mua hàng', icon: ShoppingCart, path: '/purchase-orders', modules: ['purchase_orders'] },
  { id: 'more', label: 'Thêm', icon: MoreHorizontal, path: '/more', alwaysShow: true, pinned: 'end' },
]

export const MAX_NAV_TABS = 5
