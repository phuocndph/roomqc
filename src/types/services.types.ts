export type ServiceCategory = 'wellness' | 'transport' | 'food_beverage' | 'laundry_extra' | 'other'

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  wellness: 'Sức khỏe & Spa',
  transport: 'Vận chuyển',
  food_beverage: 'Ẩm thực',
  laundry_extra: 'Giặt ủi thêm',
  other: 'Khác',
}

export const SERVICE_CATEGORY_ICONS: Record<ServiceCategory, string> = {
  wellness: '💆',
  transport: '🚗',
  food_beverage: '🍽️',
  laundry_extra: '👔',
  other: '🔧',
}

export interface HotelService {
  id: string
  tenant_id: string
  hotel_id: string
  name: string
  name_en: string | null
  category: ServiceCategory
  description: string | null
  unit: string
  price: number
  is_active: boolean
  icon: string | null
  sort_order: number | null
  created_at: string | null
  updated_at: string | null
}

export interface BookingServiceCharge {
  id: string
  tenant_id: string
  booking_id: string
  service_id: string | null
  service_name: string
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  created_by: string | null
  created_at: string | null
}

export interface HotelServiceFormData {
  name: string
  name_en?: string
  category: ServiceCategory
  description?: string
  unit: string
  price: number
  is_active: boolean
  icon: string
}
