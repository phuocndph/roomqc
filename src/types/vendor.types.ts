export type VendorCategory = 'supplier' | 'service_provider' | 'contractor';
export type VendorStatus = 'active' | 'inactive' | 'suspended';

export interface Vendor {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  category: VendorCategory;
  products_services: string[];
  logo_url?: string;
  
  address: string;
  city?: string;
  phone: string;
  email?: string;
  website?: string;
  contact_person: string;
  contact_position?: string;
  contact_phone?: string;
  
  tax_code?: string;
  bank_account?: string;
  bank_name?: string;
  bank_branch?: string;
  
  payment_terms: string;
  delivery_time?: string;
  minimum_order_value?: number;
  contract_start_date?: string;
  contract_end_date?: string;
  
  rating: number;
  total_orders: number;
  total_value: number;
  on_time_delivery_rate: number;
  
  documents: string[];
  notes?: string;
  status: VendorStatus;
  
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface VendorStats {
  total_vendors: number;
  active_vendors: number;
  new_this_month: number;
  average_rating: number;
  total_orders_30d: number;
  total_value_30d: number;
}

export interface VendorFilters {
  search?: string;
  category?: VendorCategory | 'all';
  status?: VendorStatus | 'all';
  products_services?: string[];
  min_value?: number;
  max_value?: number;
  min_rating?: number;
  sort_by?: 'name' | 'rating' | 'orders' | 'value' | 'recent';
  sort_order?: 'asc' | 'desc';
}
