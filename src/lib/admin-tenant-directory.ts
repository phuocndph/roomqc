import { z } from 'zod';
import type { TenantFilters } from './admin-tenant-presentation';

const count = z.number().int().nonnegative().safe();
const nullableNumber = z.number().finite().nullable();
const nullableText = z.string().nullable();
const plan = z.object({
  id: z.string().uuid(), name: z.string(), code: z.string(),
  price_monthly: nullableNumber, price_yearly: nullableNumber,
  max_hotels: nullableNumber, max_users: nullableNumber, max_storage_gb: nullableNumber,
});
const usage = z.object({
  current_hotels_count: nullableNumber, current_users_count: nullableNumber,
  current_rooms_count: nullableNumber, current_items_count: nullableNumber,
  current_storage_bytes: nullableNumber, peak_hotels_count: nullableNumber,
  peak_users_count: nullableNumber, peak_storage_bytes: nullableNumber,
});
const tenant = z.object({
  id: z.string().uuid(), name: z.string(), email: nullableText,
  created_at: z.string().datetime({ offset: true }),
  subscription_status: nullableText, subscription_plan_id: z.string().uuid().nullable(),
  subscription_end_date: nullableText, subscription_duration_days: nullableNumber,
  registered_rooms: nullableNumber, approval_status: nullableText,
  actual_status: z.string(), is_expired: z.boolean(), days_until_expiry: nullableNumber,
  has_subscription: z.boolean(), subscription_plan: plan.nullable(), tenant_usage: z.array(usage).max(1),
  lifetime_revenue: z.number().finite(), last_activity: z.string().datetime({ offset: true }).nullable(),
}).passthrough();
const directory = z.object({
  items: z.array(tenant).max(100), total: count, page: count,
  page_size: z.number().int().min(1).max(100), checked_at: z.string().datetime({ offset: true }),
  plans: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type AdminTenant = z.infer<typeof tenant>;
export type AdminTenantDirectory = z.infer<typeof directory>;
export interface TenantDirectoryRequest extends TenantFilters {
  page: number;
  pageSize: number;
  sort: 'created_at' | 'name' | 'subscription_end_date';
  descending: boolean;
}
export const defaultTenantDirectoryRequest: TenantDirectoryRequest = {
  page: 0, pageSize: 25, searchQuery: '', statusFilter: 'all', planFilter: 'all', approvalFilter: 'all',
  sort: 'created_at', descending: true,
};
export function tenantDirectoryArguments(input: TenantDirectoryRequest) {
  return {
    p_page: input.page, p_page_size: input.pageSize, p_search: input.searchQuery.trim(),
    p_status: input.statusFilter, p_plan: input.planFilter === 'all' ? null : input.planFilter,
    p_approval: input.approvalFilter, p_sort: input.sort, p_desc: input.descending,
  };
}
export function readTenantDirectory(value: unknown): AdminTenantDirectory {
  const data = directory.parse(value);
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  if (data.page >= pages || data.items.length !== Math.min(data.page_size, data.total - data.page * data.page_size)
    || new Set(data.items.map(item => item.id)).size !== data.items.length
    || new Set(data.plans.map(item => item.id)).size !== data.plans.length) {
    throw new Error('INVALID_TENANT_DIRECTORY_RESPONSE');
  }
  return data;
}
