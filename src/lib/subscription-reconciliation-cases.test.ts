import { describe, expect, it } from 'vitest';
import { readCaseMutation, readCasePage, reconciliationCaseError } from './subscription-reconciliation-cases';

const tenant = '10000000-0000-4000-8000-000000000001';
const payment = '10000000-0000-4000-8000-000000000002';
const id = '10000000-0000-4000-8000-000000000003';
const actor = '10000000-0000-4000-8000-000000000004';
const date = '2026-10-17T00:00:00Z';
const item = { id, payment_id: payment, tenant_id: tenant, invoice_id: null, status: 'open', version: 1,
  created_by: actor, created_at: date, updated_at: date,
  source_snapshot: { captured_at: date, payment_status: 'pending', amount: 90000, currency: 'VND',
    invoice_status: null, invoice_same_tenant: false } };
const event = { id: actor, case_id: id, version: 1, actor_id: actor, request_id: actor, action: 'create',
  note: 'Kiểm tra đơn cũ', before_state: null, after_state: item, created_at: date };
const page = { source: { id: payment, tenant_id: tenant, can_create: true }, case: item, events: [event],
  has_more: false, next_before_version: null, checked_at: date };

describe('reconciliation case contracts (frontend only)', () => {
  it('accepts a server-scoped case and immutable source snapshot', () => {
    expect(readCasePage(page, tenant, payment).case?.source_snapshot.amount).toBe(90000);
    expect(readCaseMutation({ case: item, created: true }, tenant, payment).created).toBe(true);
  });
  it('accepts absence only with explicit source capability and no history', () => {
    expect(readCasePage({ ...page, case: null, events: [] }, tenant, payment).case).toBeNull();
    expect(() => readCasePage({ ...page, case: null }, tenant, payment)).toThrow();
  });
  it('rejects tenant/source mismatches in any nested case or audit state', () => {
    expect(() => readCasePage(page, actor, payment)).toThrow();
    expect(() => readCasePage(page, tenant, actor)).toThrow();
    expect(() => readCasePage({ ...page, case: { ...item, tenant_id: actor } }, tenant, payment)).toThrow();
    expect(() => readCasePage({ ...page, events: [{ ...event, after_state: { ...item, payment_id: actor } }] }, tenant, payment)).toThrow();
    expect(() => readCaseMutation({ case: { ...item, tenant_id: actor }, created: true }, tenant, payment)).toThrow();
  });
  it('rejects a missing newest event, false empty, duplicates and malformed money', () => {
    expect(() => readCasePage({ ...page, events: [] }, tenant, payment)).toThrow();
    expect(() => readCasePage({ ...page, events: [event, event] }, tenant, payment)).toThrow();
    expect(() => readCasePage({ ...page, case: { ...item, source_snapshot: { ...item.source_snapshot, amount: '90000' } } }, tenant, payment)).toThrow();
  });
  it('checks event versions, action preconditions and next-cursor consistency', () => {
    expect(() => readCasePage({ ...page, events: [{ ...event, action: 'note' }] }, tenant, payment)).toThrow();
    expect(() => readCasePage({ ...page, events: [{ ...event, version: 2 }] }, tenant, payment)).toThrow();
    expect(() => readCasePage({ ...page, has_more: true, next_before_version: 1 }, tenant, payment)).toThrow();
    expect(() => readCasePage({ ...page, next_before_version: 1 }, tenant, payment)).toThrow();
    expect(() => readCasePage(page, tenant, payment, 1)).toThrow();
  });
  it('accepts bounded descending history pages and validates cursor boundaries', () => {
    const latest = { ...item, version: 80 };
    const events = Array.from({ length: 50 }, (_, index) => {
      const version = 80 - index;
      return { ...event, id: crypto.randomUUID(), version, action: 'note',
        before_state: { ...item, version: version - 1 }, after_state: { ...item, version } };
    });
    expect(readCasePage({ ...page, case: latest, events, has_more: true, next_before_version: 31 }, tenant, payment).events).toHaveLength(50);
    expect(() => readCasePage({ ...page, case: latest, events, has_more: true, next_before_version: 30 }, tenant, payment)).toThrow();
  });
  it('uses safe, actionable messages without raw error or SQL details', () => {
    expect(reconciliationCaseError({ code: 'PGRST202', message: 'sensitive' })).toContain('chưa được cài đặt');
    expect(reconciliationCaseError({ code: '42501' })).toContain('không còn đủ quyền');
    expect(reconciliationCaseError({ code: 'PT409' })).toContain('Tải lại');
    expect(reconciliationCaseError({ code: 'PT404' })).toContain('Không tìm thấy');
    expect(reconciliationCaseError(new Error('sensitive'))).not.toContain('sensitive');
  });
});
