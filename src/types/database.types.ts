import { Database } from '@/integrations/supabase/types'

// Table types
export type Tenant = Database['public']['Tables']['tenants']['Row']
export type TenantInsert = Database['public']['Tables']['tenants']['Insert']
export type TenantUpdate = Database['public']['Tables']['tenants']['Update']

export type Hotel = Database['public']['Tables']['hotels']['Row']
export type HotelInsert = Database['public']['Tables']['hotels']['Insert']
export type HotelUpdate = Database['public']['Tables']['hotels']['Update']

export type User = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type UserRole = Database['public']['Tables']['user_roles']['Row']
export type UserRoleInsert = Database['public']['Tables']['user_roles']['Insert']

export type ItemCategory = Database['public']['Tables']['item_categories']['Row']
export type ItemCategoryInsert = Database['public']['Tables']['item_categories']['Insert']
export type ItemCategoryUpdate = Database['public']['Tables']['item_categories']['Update']

export type Item = Database['public']['Tables']['items']['Row']
export type ItemInsert = Database['public']['Tables']['items']['Insert']
export type ItemUpdate = Database['public']['Tables']['items']['Update']

export type Room = Database['public']['Tables']['rooms']['Row']
export type RoomInsert = Database['public']['Tables']['rooms']['Insert']
export type RoomUpdate = Database['public']['Tables']['rooms']['Update']

// Extended types with relations
export type UserWithRelations = User & {
  tenant?: Tenant
  hotel?: Hotel
  roles?: UserRole[]
  primaryRole?: AppRole
  userLevel?: {
    code: string
    name: string
    hierarchy_level: number
  }
  position?: {
    id: string
    code: string
    name: string
    user_level_code: string
    department?: string
  }
}

export type ItemWithRelations = Item & {
  category?: ItemCategory
  hotel?: Hotel
}

export type HotelWithRelations = Hotel & {
  tenant?: Tenant
}

// Enums
export type AppRole = 'super_admin' | 'owner' | 'hotel_manager' | 'department_manager' | 'staff'
export type UserLevelCode = 'super_admin' | 'tenant_owner' | 'manager' | 'department_manager' | 'staff'
export type Department = 'housekeeping' | 'laundry' | 'inventory' | 'maintenance'
export type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled'
export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'e_wallet' | 'cash'
