import { describe, expect, it } from 'vitest';
import { defaultTenantDirectoryRequest, readTenantDirectory, tenantDirectoryArguments } from './admin-tenant-directory';

const empty = { items: [], total: 0, page: 0, page_size: 25, checked_at: '2026-10-18T00:00:00Z', plans: [] };
describe('tenant directory DTO', () => {
  it('retains a real empty result and normalizes only the request text', () => {
    expect(readTenantDirectory(empty)).toEqual(empty);
    expect(tenantDirectoryArguments({ ...defaultTenantDirectoryRequest, searchQuery: '  100%_hotel  ' }))
      .toMatchObject({ p_search: '100%_hotel', p_plan: null });
  });
  it.each([
    { total: 1 }, { page: 1 }, { page_size: 101 }, { total: -1 },
    { checked_at: null }, { items: [{}] }, { plans: [{ id: 'bad', name: 'x' }] },
  ])('rejects missing rows, invalid bounds and incompatible shapes: %j', change => {
    expect(() => readTenantDirectory({ ...empty, ...change })).toThrow();
  });
});
