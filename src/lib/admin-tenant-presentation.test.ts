import { describe, expect, it } from 'vitest';
import { filterAdminTenants, getAdminTenantPlanOptions, getTenantPresentation } from './admin-tenant-presentation';

const now = new Date('2026-10-17T12:00:00Z');
const tenant = (id: string, status = 'active', planId = 'standard') => ({
  id, name: `Hotel ${id}`, email: `${id}@example.invalid`,
  subscription_status: status, actual_status: status, registered_rooms: 0,
  days_until_expiry: 3, approval_status: 'approved',
  subscription_plan: { id: planId, code: 'code', name: `Plan ${planId}` },
});
const filters = { statusFilter: 'all', planFilter: 'all', approvalFilter: 'all', searchQuery: '' };

describe('admin tenant presentation is not entitlement logic', () => {
  it('preserves explicit trial even without paid rooms or an end date', () => {
    expect(getTenantPresentation({ subscription_status: 'trial', registered_rooms: 0 }, now))
      .toMatchObject({ actual_status: 'trial', has_subscription: false, days_until_expiry: null });
  });
  it.each(['trial', 'grace_period', 'suspended', 'cancelled', 'expired'])('preserves %s over an old paid end date', status => {
    expect(getTenantPresentation({ subscription_status: status, subscription_end_date: '2020-01-01' }, now).actual_status).toBe(status);
  });
  it('derives only expired active dates and handles invalid dates without NaN', () => {
    expect(getTenantPresentation({ subscription_status: 'active', subscription_end_date: now.toISOString() }, now).actual_status).toBe('expired');
    expect(getTenantPresentation({ subscription_status: 'active', subscription_end_date: 'bad' }, now))
      .toMatchObject({ actual_status: 'active', days_until_expiry: null, has_subscription: false });
    expect(getTenantPresentation({}, now).actual_status).toBe('not_registered');
  });
  it('applies actual status consistently instead of including expired active tenants', () => {
    const expired = { ...tenant('old'), actual_status: 'expired' };
    expect(filterAdminTenants([tenant('trial', 'trial'), expired], { ...filters, statusFilter: 'trial' }).map(t => t.id)).toEqual(['trial']);
    expect(filterAdminTenants([expired], { ...filters, statusFilter: 'active' })).toEqual([]);
  });
  it('applies actual plan identity, approval and trimmed case-insensitive search together', () => {
    const rows = [tenant('one'), tenant('two', 'active', 'enterprise'), { ...tenant('three'), approval_status: 'pending' }];
    expect(filterAdminTenants(rows, { ...filters, planFilter: 'standard', approvalFilter: 'approved', searchQuery: ' ONE@EXAMPLE ' }).map(t => t.id)).toEqual(['one']);
  });
  it('expiring soon only includes active plans, not cancelled or suspended or trials', () => {
    const rows = ['active', 'trial', 'cancelled', 'suspended', 'grace_period'].map(status => tenant(status, status));
    expect(filterAdminTenants(rows, { ...filters, statusFilter: 'expiring_soon' }).map(t => t.id)).toEqual(['active']);
  });
  it('builds plan options from actual loaded plans once, without fictional tiers', () => {
    expect(getAdminTenantPlanOptions([tenant('one'), tenant('two'), tenant('three', 'active', 'enterprise')])).toEqual([
      { id: 'enterprise', code: 'code', name: 'Plan enterprise' },
      { id: 'standard', code: 'code', name: 'Plan standard' },
    ]);
  });
});
