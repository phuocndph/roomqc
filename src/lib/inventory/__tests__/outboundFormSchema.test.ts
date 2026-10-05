import { describe, it, expect } from 'vitest';
import { buildOutboundSchema } from '../outboundFormSchema';

const t = (k: string) => k;
const schema = buildOutboundSchema(t);
const WH = '11111111-1111-1111-1111-111111111111';
const ITEM = '22222222-2222-2222-2222-222222222222';
const VENDOR = '33333333-3333-3333-3333-333333333333';
const STAFF = '44444444-4444-4444-4444-444444444444';

describe('buildOutboundSchema', () => {
  it('room_assign: bỏ qua from_warehouse/items', () => {
    const r = schema.safeParse({ transaction_category: 'room_assign' });
    expect(r.success).toBe(true);
  });

  it('disposal/other: bắt buộc from_warehouse_id UUID', () => {
    const r = schema.safeParse({ transaction_category: 'disposal' });
    expect(r.success).toBe(false);
  });

  it('disposal: hợp lệ khi đủ warehouse + items', () => {
    const r = schema.safeParse({
      transaction_category: 'disposal',
      from_warehouse_id: WH,
      to_location: 'Bãi rác',
      items: [{ item_id: ITEM, quantity: 1, available_quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });

  it('disposal: chặn khi quantity > tồn', () => {
    const r = schema.safeParse({
      transaction_category: 'disposal',
      from_warehouse_id: WH,
      to_location: 'X',
      items: [{ item_id: ITEM, quantity: 10, available_quantity: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it('laundry: yêu cầu vendor/date/staff/receiver + laundry_items', () => {
    const r = schema.safeParse({
      transaction_category: 'laundry',
      from_warehouse_id: WH,
      vendor_id: VENDOR,
      delivery_date: new Date(),
      expected_return_date: new Date(),
      delivery_staff_id: STAFF,
      receiver_name: 'A',
      laundry_items: [{ item_id: ITEM, quantity: 2, weight_kg: 1.5, available_quantity: 10 }],
    });
    expect(r.success).toBe(true);
  });

  it('maintenance: chấp nhận to_location hoặc maintenance_request_id', () => {
    const r = schema.safeParse({
      transaction_category: 'maintenance',
      from_warehouse_id: WH,
      to_location: 'Phòng 101',
      items: [{ item_id: ITEM, quantity: 1, available_quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });

  it('reject business_type không hợp lệ', () => {
    const r = schema.safeParse({ transaction_category: 'invalid_type' as any });
    expect(r.success).toBe(false);
  });
});
