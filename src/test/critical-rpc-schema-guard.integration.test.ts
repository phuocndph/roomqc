/**
 * Integration test: Critical RPC schema guard
 *
 * Mục đích: Chặn regression dạng "cột/bảng/function không tồn tại" (Postgres
 * 42703 / 42P01 / 42883 / 42P18) cho các RPC critical mà toàn bộ flow vận
 * hành dựa vào. Mỗi RPC được gọi qua anon client với tham số tối thiểu hợp
 * lệ về type. Test KHÔNG kiểm tra business logic — chỉ assert lỗi trả về
 * (nếu có) KHÔNG phải lỗi schema.
 *
 * Bối cảnh: Sprint A3+B đã từng để lọt `lv.logo_url` (cột không tồn tại)
 * trong RPC mới làm /laundry trả 500. Test này bắt sớm các regression
 * tương tự ở 10 RPC critical:
 *   - create_distribution_order
 *   - create_inbound_transaction
 *   - create_outbound_transaction
 *   - create_laundry_loss_transaction
 *   - create_laundry_return_transaction
 *   - perform_checkin
 *   - perform_checkout
 *   - prepare_checkout_amounts
 *   - prepare_group_checkout_amounts
 *   - perform_group_checkout
 *
 * Liên quan: docs/architecture/09-refactor/findings.md → F-RPC-OVERLOAD-02.
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const TEST_ENV = {
  url: process.env.SUPABASE_TEST_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '',
  key: process.env.SUPABASE_TEST_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  tenantId: process.env.SUPABASE_TEST_TENANT_ID ?? '',
};
const INTEGRATION_ENABLED = Boolean(TEST_ENV.url && TEST_ENV.key && TEST_ENV.tenantId);
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

// Postgres error codes báo hiệu schema/binding regression — KHÔNG được phép.
//  - 42703: undefined_column
//  - 42P01: undefined_table
//  - 42883: undefined_function (sai signature / overload bị drop)
//  - 42P18: indeterminate_datatype
//  - 42P17: invalid_object_definition (function body hỏng)
const SCHEMA_ERROR_CODES = new Set(['42703', '42P01', '42883', '42P18', '42P17']);

function assertNoSchemaError(error: unknown, label: string) {
  if (!error) return;
  const err = error as { code?: string; message?: string };
  if (err.code && SCHEMA_ERROR_CODES.has(err.code)) {
    throw new Error(
      `[${label}] Schema regression detected (code=${err.code}): ${err.message}`,
    );
  }
  // Cũng bắt schema error qua message khi PostgREST không gắn code.
  const msg = (err.message || '').toLowerCase();
  if (
    msg.includes('does not exist') &&
    (msg.includes('column') || msg.includes('relation') || msg.includes('function'))
  ) {
    throw new Error(
      `[${label}] Schema regression detected (message): ${err.message}`,
    );
  }
}

describe.skipIf(!INTEGRATION_ENABLED)('Critical RPC schema guard (integration)', () => {
  const client = createClient(TEST_ENV.url, TEST_ENV.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it('create_distribution_order: không có schema error', async () => {
    const { error } = await client.rpc('create_distribution_order', {
      p_tenant_id: TEST_ENV.tenantId,
      p_hotel_id: FAKE_UUID,
      p_created_by: FAKE_UUID,
      p_assigned_to: FAKE_UUID,
      p_rooms: [],
      p_notes: null,
      p_auto_release: false,
      p_supplement_request_ids: null,
    });
    assertNoSchemaError(error, 'create_distribution_order');
  });

  it('create_inbound_transaction: không có schema error', async () => {
    const { error } = await client.rpc('create_inbound_transaction', {
      p_tenant_id: TEST_ENV.tenantId,
      p_hotel_id: FAKE_UUID,
      p_transaction_category: 'purchase',
      p_from_location: 'Test',
      p_to_location: 'Test',
      p_created_by: FAKE_UUID,
      p_items: [],
      p_related_type: null,
      p_related_id: null,
      p_documents: null,
      p_photos: null,
      p_notes: null,
      p_to_warehouse_id: null,
    });
    assertNoSchemaError(error, 'create_inbound_transaction');
  });

  it('create_outbound_transaction: không có schema error', async () => {
    const { error } = await client.rpc('create_outbound_transaction', {
      p_tenant_id: TEST_ENV.tenantId,
      p_hotel_id: FAKE_UUID,
      p_transaction_category: 'consumption',
      p_from_location: 'Test',
      p_to_location: 'Test',
      p_created_by: FAKE_UUID,
      p_items: [],
      p_related_type: null,
      p_related_id: null,
      p_recipient_name: null,
      p_recipient_signature: null,
      p_documents: null,
      p_photos: null,
      p_notes: null,
      p_from_warehouse_id: null,
    });
    assertNoSchemaError(error, 'create_outbound_transaction');
  });

  it('create_laundry_loss_transaction: không có schema error', async () => {
    const { error } = await client.rpc('create_laundry_loss_transaction', {
      p_tenant_id: TEST_ENV.tenantId,
      p_hotel_id: FAKE_UUID,
      p_created_by: FAKE_UUID,
      p_items: [],
      p_loss_type: 'lost',
      p_related_id: null,
      p_notes: null,
    });
    assertNoSchemaError(error, 'create_laundry_loss_transaction');
  });

  it('create_laundry_return_transaction: không có schema error', async () => {
    const { error } = await client.rpc('create_laundry_return_transaction', {
      p_tenant_id: TEST_ENV.tenantId,
      p_hotel_id: FAKE_UUID,
      p_from_location: 'Đơn vị giặt',
      p_to_location: 'Test',
      p_created_by: FAKE_UUID,
      p_items: [],
      p_related_id: null,
      p_notes: null,
    });
    assertNoSchemaError(error, 'create_laundry_return_transaction');
  });

  it('perform_checkin: không có schema error', async () => {
    const { error } = await client.rpc('perform_checkin', {
      p_booking_id: FAKE_UUID,
      p_room_id: FAKE_UUID,
      p_early_checkin_charge: 0,
    });
    assertNoSchemaError(error, 'perform_checkin');
  });

  it('perform_checkout: không có schema error', async () => {
    const { error } = await client.rpc('perform_checkout', {
      p_booking_id: FAKE_UUID,
      p_room_id: FAKE_UUID,
      p_late_checkout_charge: 0,
      p_service_charges: 0,
      p_subtotal: 0,
      p_damage_charges: 0,
      p_damage_notes: null,
      p_damage_items: [],
      p_new_amount_paid: null,
      p_check_out_date: null,
    });
    assertNoSchemaError(error, 'perform_checkout');
  });

  it('prepare_checkout_amounts: không có schema error', async () => {
    const { error } = await client.rpc('prepare_checkout_amounts', {
      p_booking_id: FAKE_UUID,
      p_room_id: FAKE_UUID,
      p_late_checkout_charge: 0,
      p_service_charges: 0,
      p_subtotal: 0,
      p_damage_charges: 0,
      p_damage_notes: null,
      p_damage_items: [],
    });
    assertNoSchemaError(error, 'prepare_checkout_amounts');
  });

  it('prepare_group_checkout_amounts: không có schema error', async () => {
    const { error } = await client.rpc('prepare_group_checkout_amounts', {
      p_checkouts: [{
        booking_id: FAKE_UUID,
        room_id: FAKE_UUID,
        subtotal: 0,
        damage_charges: 0,
        damage_items: [],
      }],
    });
    assertNoSchemaError(error, 'prepare_group_checkout_amounts');
  });

  it('perform_group_checkout: không có schema error', async () => {
    const { error } = await client.rpc('perform_group_checkout', {
      p_checkouts: [{
        booking_id: FAKE_UUID,
        room_id: FAKE_UUID,
        subtotal: 0,
        damage_charges: 0,
        damage_items: [],
        check_out_date: null,
      }],
    });
    assertNoSchemaError(error, 'perform_group_checkout');
  });
});
