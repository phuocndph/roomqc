import { z } from 'zod';

/**
 * Schema cho form Xuất kho (OutboundPage / MobileOutboundForm).
 *
 * Trước Sprint 2: schema được tạo mới mỗi render trong `OutboundPage`
 * (createOutboundSchema(t) trong render scope) → invalidates useForm cache.
 * Sau Sprint 2: dùng `buildOutboundSchema(t)` kết hợp với `useMemo` ở caller
 * để giữ identity ổn định theo i18n.language.
 *
 * Giữ nguyên contract field & validation behavior với code cũ.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OutboundCategory = 'room_assign' | 'laundry' | 'maintenance' | 'disposal' | 'other';

export type OutboundFormData = {
  transaction_category: OutboundCategory;
  from_warehouse_id: string;
  to_location?: string;
  vendor_id?: string;
  maintenance_request_id?: string;
  items?: Array<{ item_id: string; quantity: number; available_quantity: number; notes?: string }>;
  recipient_name?: string;
  photos?: string[];
  notes?: string;
  delivery_date?: Date;
  expected_return_date?: Date;
  delivery_staff_id?: string;
  receiver_name?: string;
  laundry_items?: Array<{
    item_id: string;
    quantity: number;
    weight_kg: number;
    available_quantity: number;
    condition_note?: string;
  }>;
};

export type TFunc = (key: string) => string;

export function buildOutboundSchema(t: TFunc) {
  const itemSchema = z.object({
    item_id: z.string().refine(
      (val) => val === '' || UUID_REGEX.test(val),
      { message: t('inventory:validation.itemRequired') },
    ),
    quantity: z.number().min(1, t('inventory:validation.quantityMin')),
    available_quantity: z.number(),
    notes: z.string().optional(),
  });

  const laundryItemSchema = z.object({
    item_id: z.string().refine((val) => val === '' || UUID_REGEX.test(val)),
    quantity: z.number().min(1),
    weight_kg: z.number().min(0),
    available_quantity: z.number(),
    condition_note: z.string().optional(),
  });

  return z
    .object({
      transaction_category: z.enum(['room_assign', 'laundry', 'maintenance', 'disposal', 'other']),
      from_warehouse_id: z.string().optional(),
      to_location: z.string().optional(),
      vendor_id: z.string().uuid().optional(),
      maintenance_request_id: z.string().uuid().optional(),
      items: z.array(itemSchema).optional(),
      recipient_name: z.string().optional(),
      photos: z.array(z.string()).optional(),
      notes: z.string().optional(),
      delivery_date: z.date().optional(),
      expected_return_date: z.date().optional(),
      delivery_staff_id: z.string().uuid().optional(),
      receiver_name: z.string().optional(),
      laundry_items: z.array(laundryItemSchema).optional(),
    })
    .refine(
      (data) => {
        if (data.transaction_category === 'room_assign') return true;
        return !!data.from_warehouse_id && UUID_REGEX.test(data.from_warehouse_id);
      },
      { message: t('inventory:validation.fromRequired'), path: ['from_warehouse_id'] },
    )
    .refine(
      (data) => {
        if (data.transaction_category === 'room_assign') return true;
        if (data.transaction_category === 'laundry') {
          return !!data.laundry_items && data.laundry_items.length > 0 && data.laundry_items.some((i) => i.item_id);
        }
        return !!data.items && data.items.length > 0;
      },
      { message: t('inventory:validation.itemsMin'), path: ['items'] },
    )
    .refine(
      (data) => {
        if (data.transaction_category === 'room_assign') return true;
        if (data.transaction_category === 'laundry') {
          return data.laundry_items?.every((i) => i.quantity <= i.available_quantity) ?? true;
        }
        return data.items?.every((i) => i.quantity <= i.available_quantity) ?? true;
      },
      { message: t('inventory:outbound.stockError'), path: ['items'] },
    )
    .refine(
      (data) => {
        if (data.transaction_category === 'laundry') {
          return (
            !!data.vendor_id &&
            !!data.delivery_date &&
            !!data.expected_return_date &&
            !!data.delivery_staff_id &&
            !!data.receiver_name
          );
        }
        if (data.transaction_category === 'maintenance') {
          return !!data.maintenance_request_id || !!data.to_location;
        }
        return true;
      },
      { message: t('inventory:validation.destinationRequired'), path: ['to_location'] },
    );
}

export type OutboundSchema = ReturnType<typeof buildOutboundSchema>;
