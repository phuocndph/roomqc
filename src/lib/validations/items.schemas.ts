import { z } from 'zod'

export const itemFormSchema = z.object({
  // Basic info
  name: z.string().trim().min(2, 'Tên phải có ít nhất 2 ký tự').max(200, 'Tên không được vượt quá 200 ký tự'),
  name_en: z.string().trim().max(200, 'Tên tiếng Anh không được vượt quá 200 ký tự').optional(),
  category_id: z.string().uuid('Vui lòng chọn danh mục'),
  hotel_id: z.string().uuid('Vui lòng chọn khách sạn'),
  description: z.string().trim().max(1000, 'Mô tả không được vượt quá 1000 ký tự').optional(),
  
  // Pricing
  unit: z.string().trim().min(1, 'Vui lòng nhập đơn vị').max(50, 'Đơn vị không được vượt quá 50 ký tự'),
  unit_price: z.number().min(0, 'Giá phải >= 0').max(999999999, 'Giá quá lớn'),
  brand: z.string().trim().max(100, 'Thương hiệu không được vượt quá 100 ký tự').optional(),
  model: z.string().trim().max(100, 'Model không được vượt quá 100 ký tự').optional(),
  
  // Chargeable settings (for consumables)
  is_chargeable: z.boolean().default(false),
  is_complimentary: z.boolean().default(true),
  charge_price: z.number().min(0, 'Giá bán phải >= 0').max(999999999, 'Giá quá lớn').nullable().optional(),
  
  // Quantity
  quantity_total: z.number().int().min(0, 'Số lượng phải >= 0').max(999999, 'Số lượng quá lớn'),
  minimum_stock: z.number().int().min(0, 'Ngưỡng cảnh báo phải >= 0').max(999999, 'Ngưỡng quá lớn'),
  reorder_point: z.number().int().min(0, 'Điểm đặt hàng phải >= 0').max(999999, 'Điểm đặt hàng quá lớn').optional(),
  
  // Specifications
  specifications: z.record(z.any()).optional(),
  
  // Lifecycle
  expected_lifetime_days: z.number().int().positive('Tuổi thọ phải > 0').max(36500, 'Tuổi thọ quá lớn').optional(),
  max_wash_cycles: z.number().int().positive('Số lần giặt phải > 0').max(10000, 'Số lần giặt quá lớn').optional(),
  
  // Images
  images: z.array(z.string().url('URL ảnh không hợp lệ')).max(10, 'Tối đa 10 ảnh').optional(),
  
  status: z.enum(['active', 'discontinued']).default('active'),
})

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, 'Tên danh mục phải có ít nhất 2 ký tự').max(100, 'Tên không được vượt quá 100 ký tự'),
  name_en: z.string().trim().max(100, 'Tên tiếng Anh không được vượt quá 100 ký tự').optional(),
  description: z.string().trim().max(500, 'Mô tả không được vượt quá 500 ký tự').optional(),
  icon: z.string().trim().min(1, 'Vui lòng chọn icon').max(50, 'Icon không hợp lệ'),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Màu không hợp lệ (format: #RRGGBB)'),
  sort_order: z.number().int().min(0, 'Thứ tự phải >= 0').max(999, 'Thứ tự quá lớn').optional(),
})

export type ItemFormData = z.infer<typeof itemFormSchema>
export type CategoryFormData = z.infer<typeof categoryFormSchema>
