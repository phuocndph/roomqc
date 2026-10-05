import { Vendor } from './vendor.types';

export type POStatus = 
  | 'draft' 
  | 'submitted' 
  | 'approved' 
  | 'rejected'
  | 'ordered' 
  | 'partial' 
  | 'received' 
  | 'cancelled';

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  hotel_id: string;
  po_code: string;
  
  vendor_id: string;
  vendor?: Vendor;
  
  order_date: string;
  expected_delivery_date: string;
  actual_delivery_date?: string;
  
  shipping_address: string;
  
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  shipping_fee: number;
  total_amount: number;
  
  requested_by: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  
  items?: PurchaseOrderItem[];
  
  notes?: string;
  status: POStatus;
  
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  item_id: string;
  item?: {
    name?: string;
    code?: string;
    unit?: string;
  };
  
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  total_price: number;
  
  notes?: string;
}

export interface POFilters {
  search?: string;
  status?: POStatus | 'all';
  vendor_id?: string;
  date_from?: string;
  date_to?: string;
  created_by?: string;
  approved_by?: string;
  min_amount?: number;
  max_amount?: number;
  sort_by?: 'date' | 'amount' | 'delivery';
  sort_order?: 'asc' | 'desc';
}
