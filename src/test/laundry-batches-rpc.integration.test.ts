/**
 * Integration test: get_laundry_batches_filtered RPC
 *
 * Mục đích: Chặn regression dạng "cột DB không tồn tại" (Postgres error 42703)
 * và các lỗi shape khác (42P01 undefined_table, 42883 undefined_function...)
 * cho RPC mà hook `useLaundryBatches` dựa vào.
 *
 * Bối cảnh: Sprint A3+B drop overload cũ của get_laundry_batches_filtered và
 * tạo lại bản mới reference `lv.logo_url` (cột không tồn tại) → toàn bộ
 * /laundry list trả 500. Test này gọi thẳng RPC qua anon client với mọi tổ
 * hợp tham số mà hook sử dụng để bắt sớm lỗi tương tự.
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

// Các lỗi schema nghiêm trọng (KHÔNG được phép xuất hiện kể cả khi RLS chặn):
//  - 42703: undefined_column
//  - 42P01: undefined_table
//  - 42883: undefined_function (sai signature)
//  - 42P18: indeterminate_datatype
const SCHEMA_ERROR_CODES = new Set(['42703', '42P01', '42883', '42P18']);

function assertNoSchemaError(error: unknown, label: string) {
  if (!error) return;
  const typedError = error as { code?: string; message?: string };
  const code = typedError.code;
  if (code && SCHEMA_ERROR_CODES.has(code)) {
    throw new Error(
      `[${label}] Schema regression detected (code=${code}): ${typedError.message ?? ''}`,
    );
  }
  // Lỗi RLS / auth (PGRST301, 42501...) thì OK — không phải regression schema.
}

describe.skipIf(!INTEGRATION_ENABLED)('get_laundry_batches_filtered (integration)', () => {
  const client = createClient(TEST_ENV.url, TEST_ENV.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const baseParams = {
    p_tenant_id: TEST_ENV.tenantId,
    p_hotel_id: null,
    p_vendor_id: null,
    p_status: null,
    p_search: null,
    p_from_date: null,
    p_to_date: null,
    p_page: 1,
    p_page_size: 25,
  };

  it('không có schema error với params mặc định', async () => {
    const { error } = await client.rpc(
      'get_laundry_batches_filtered',
      baseParams,
    );
    assertNoSchemaError(error, 'default');
  });

  it('không có schema error khi paginate (page=2)', async () => {
    const { error } = await client.rpc('get_laundry_batches_filtered', {
      ...baseParams,
      p_page: 2,
      p_page_size: 5,
    });
    assertNoSchemaError(error, 'page=2');
  });

  it('không có schema error với p_search', async () => {
    const { error } = await client.rpc('get_laundry_batches_filtered', {
      ...baseParams,
      p_search: 'LB',
    });
    assertNoSchemaError(error, 'search');
  });

  it('không có schema error khi filter status', async () => {
    const statuses = ['delivered', 'washing', 'ready', 'received', 'stocked'];
    for (const status of statuses) {
      const { error } = await client.rpc('get_laundry_batches_filtered', {
        ...baseParams,
        p_status: status,
      });
      assertNoSchemaError(error, `status=${status}`);
    }
  });

  it('không có schema error khi filter khoảng ngày', async () => {
    const { error } = await client.rpc('get_laundry_batches_filtered', {
      ...baseParams,
      p_from_date: '2026-01-01',
      p_to_date: '2026-12-31',
    });
    assertNoSchemaError(error, 'date-range');
  });

  it('shape trả về đúng (có total_count) khi có dữ liệu', async () => {
    const { data, error } = await client.rpc(
      'get_laundry_batches_filtered',
      baseParams,
    );
    assertNoSchemaError(error, 'shape');
    if (data && Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      // Các cột UI dựa vào — nếu rename/drop sẽ làm vỡ list.
      const required = [
        'id',
        'batch_code',
        'status',
        'tenant_id',
        'hotel_id',
        'vendor_id',
        'total_count',
      ];
      for (const col of required) {
        expect(row, `thiếu cột "${col}" trong RPC output`).toHaveProperty(col);
      }
    }
  });
});
