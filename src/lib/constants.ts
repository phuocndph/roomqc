import { AppRole } from '@/types/database.types'

export const APP_NAME = 'Hotel Asset Manager'
// Keep one source of truth for the cache-buster and release announcements.
export { APP_VERSION } from './app-version'

// Role definitions
export const ROLES: Record<AppRole, { label: string; description: string }> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full system access across all tenants',
  },
  owner: {
    label: 'Owner',
    description: 'Full access to tenant and all hotels',
  },
  hotel_manager: {
    label: 'Hotel Manager',
    description: 'Manage specific hotel operations',
  },
  department_manager: {
    label: 'Department Manager',
    description: 'Manage specific department',
  },
  staff: {
    label: 'Staff',
    description: 'Basic operational access',
  },
}

// Department definitions
export const DEPARTMENTS = {
  housekeeping: 'Housekeeping',
  laundry: 'Laundry',
  inventory: 'Inventory',
  maintenance: 'Maintenance',
}

// Navigation items
export const NAV_ITEMS = [
  {
    title: 'Dashboard',
    href: '/',
    icon: 'LayoutDashboard',
    roles: ['super_admin', 'owner', 'hotel_manager', 'department_manager', 'staff'],
  },
  {
    title: 'Inventory',
    href: '/inventory',
    icon: 'Package',
    roles: ['super_admin', 'owner', 'hotel_manager', 'department_manager', 'staff'],
  },
  {
    title: 'Rooms',
    href: '/rooms',
    icon: 'Bed',
    roles: ['super_admin', 'owner', 'hotel_manager', 'department_manager'],
  },
  {
    title: 'Laundry',
    href: '/laundry',
    icon: 'Shirt',
    roles: ['super_admin', 'owner', 'hotel_manager', 'department_manager'],
  },
  {
    title: 'Maintenance',
    href: '/maintenance',
    icon: 'Wrench',
    roles: ['super_admin', 'owner', 'hotel_manager', 'department_manager'],
  },
  {
    title: 'Reports',
    href: '/reports',
    icon: 'BarChart3',
    roles: ['super_admin', 'owner', 'hotel_manager'],
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: 'Settings',
    roles: ['super_admin', 'owner', 'hotel_manager'],
  },
]

// Status badges
export const STATUS_STYLES = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

// Booking sources
export const BOOKING_SOURCES = [
  { value: 'walk_in', label: 'Khách vãng lai' },
  { value: 'phone', label: 'Điện thoại' },
  { value: 'website', label: 'Website' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'agoda', label: 'Agoda' },
  { value: 'traveloka', label: 'Traveloka' },
  { value: 'expedia', label: 'Expedia' },
  { value: 'corporate', label: 'Doanh nghiệp' },
  { value: 'agent', label: 'Đại lý du lịch' },
  { value: 'other', label: 'Khác' },
]

// OTA sources that require payment handling
export const OTA_SOURCES = ['booking_com', 'agoda', 'traveloka', 'expedia']

// Default OTA commission rates (%)
export const OTA_DEFAULT_COMMISSION: Record<string, number> = {
  booking_com: 15,
  agoda: 18,
  traveloka: 12,
  expedia: 15,
}

// OTA payment types
export const OTA_PAYMENT_TYPES = [
  { value: 'prepaid', label: 'OTA thu toàn bộ (Prepaid)' },
  { value: 'pay_at_hotel', label: 'Khách trả tại KS' },
  { value: 'partial_prepaid', label: 'OTA thu một phần' },
]

// Check-in/out time options
export const TIME_OPTIONS = [
  '05:00', '06:00', '07:00', '08:00', '09:00', '10:00',
  '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
  '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
]
