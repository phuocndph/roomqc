/** Presentation only: never grants entitlement or changes persisted lifecycle state. */
export interface TenantPresentationInput {
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  registered_rooms?: number | null;
}

export function getTenantPresentation(tenant: TenantPresentationInput, now = new Date()) {
  const timestamp = tenant.subscription_end_date ? Date.parse(tenant.subscription_end_date) : NaN;
  // subscription_end_date is a DATE, valid through its whole UTC calendar day.
  // Keep display/filter semantics aligned with lifecycle and monitor predicates.
  const endDay = Math.floor(timestamp / 86_400_000);
  const today = Math.floor(now.getTime() / 86_400_000);
  const daysUntilExpiry = Number.isFinite(timestamp)
    ? endDay - today
    : null;
  const isExpired = Number.isFinite(timestamp) && endDay < today;
  // Trial, grace, suspended and cancelled are explicit server states. A missing
  // paid room allocation must not relabel a trial as an unregistered customer.
  const status = tenant.subscription_status || 'not_registered';
  return {
    actual_status: status === 'active' && isExpired ? 'expired' : status,
    is_expired: isExpired,
    days_until_expiry: daysUntilExpiry,
    has_subscription: (tenant.registered_rooms || 0) > 0 && Number.isFinite(timestamp),
  };
}

interface FilterableTenant extends TenantPresentationInput {
  name: string;
  email?: string | null;
  actual_status: string;
  days_until_expiry: number | null;
  approval_status?: string | null;
  subscription_plan?: { id: string; name: string; code: string } | null;
}

export interface TenantFilters {
  statusFilter: string;
  planFilter: string;
  approvalFilter: string;
  searchQuery: string;
}

export function filterAdminTenants<T extends FilterableTenant>(tenants: T[], filters: TenantFilters): T[] {
  const query = filters.searchQuery.trim().toLocaleLowerCase('vi');
  return tenants.filter(tenant => {
    const matchesStatus = filters.statusFilter === 'all'
      || (filters.statusFilter === 'expiring_soon'
        ? tenant.actual_status === 'active' && tenant.days_until_expiry !== null
          && tenant.days_until_expiry >= 0 && tenant.days_until_expiry <= 7
        : tenant.actual_status === filters.statusFilter);
    return matchesStatus
      && (filters.planFilter === 'all' || tenant.subscription_plan?.id === filters.planFilter)
      && (filters.approvalFilter === 'all' || tenant.approval_status === filters.approvalFilter)
      && (!query || tenant.name.toLocaleLowerCase('vi').includes(query)
        || !!tenant.email?.toLocaleLowerCase('vi').includes(query));
  });
}

export function getAdminTenantPlanOptions(tenants: FilterableTenant[]) {
  const plans = new Map<string, { id: string; name: string }>();
  for (const tenant of tenants) {
    if (tenant.subscription_plan) plans.set(tenant.subscription_plan.id, tenant.subscription_plan);
  }
  return [...plans.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
