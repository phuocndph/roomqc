import { z } from 'zod'

/**
 * Shared Zod schema for Inbound (Nhập kho) form.
 *
 * Used by both desktop (`src/pages/inventory/InboundPage.tsx`) and mobile
 * (`src/components/inventory/MobileInboundForm.tsx`) to prevent schema drift.
 *
 * Key invariants (Sprint 1 audit /inventory):
 *  - `to_warehouse_id` is a REAL warehouse UUID — never a free-text location.
 *    Mobile must auto-pick the default warehouse on mount via `useDefaultWarehouse`.
 *  - `items` is required (>=1 item) and every quantity must be > 0.
 *  - All Zod fields render on a single page (Core rule: no wizard hiding).
 */
export const inboundFormSchema = z.object({
  transaction_category: z.enum(['purchase', 'return', 'laundry', 'other']),
  from_location: z.string().trim().min(1, 'Vui lòng nhập nguồn nhập (NCC, người gửi, …)'),
  to_warehouse_id: z.string().uuid('Vui lòng chọn kho nhập'),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid('Vui lòng chọn đồ dùng'),
        quantity: z.number().int().min(1, 'Số lượng phải > 0'),
        notes: z.string().optional(),
      }),
    )
    .min(1, 'Phải có ít nhất 1 đồ dùng'),
  documents: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
  notes: z.string().optional(),
  related_type: z.string().optional(),
  related_id: z.string().optional(),
})

export type InboundFormData = z.infer<typeof inboundFormSchema>

/** Default values used by both desktop and mobile forms. */
export function buildInboundDefaults(opts?: {
  defaultWarehouseId?: string
  prefill?: {
    items?: Array<{ item_id: string; quantity: number }>
    notes?: string
    relatedType?: string
    relatedId?: string
    fromLocation?: string
  }
}): InboundFormData {
  const prefill = opts?.prefill
  return {
    transaction_category: 'purchase',
    from_location: prefill?.fromLocation ?? '',
    to_warehouse_id: opts?.defaultWarehouseId ?? '',
    items:
      prefill?.items && prefill.items.length > 0
        ? prefill.items.map((i) => ({ item_id: i.item_id, quantity: i.quantity, notes: '' }))
        : [],
    documents: [],
    photos: [],
    notes: prefill?.notes ?? '',
    related_type: prefill?.relatedType,
    related_id: prefill?.relatedId,
  }
}
