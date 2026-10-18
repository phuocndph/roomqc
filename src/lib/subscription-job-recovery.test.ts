import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJobRecovery, loadJobRecovery, persistJobRecovery, readJobRecoveryReceipt } from './subscription-job-recovery';
const actor = 'admin-one';
const command = { runId: '00000000-0000-4000-8000-000000000001', requestId: '00000000-0000-4000-8000-000000000002',
  deadlineAt: '2026-10-18T00:00:00Z', reason: 'Đã kiểm tra lượt gián đoạn' };
describe('pending job recovery', () => {
  beforeEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });
  it('retains the exact command per actor across callers and clears only that command', () => {
    persistJobRecovery(actor, command);
    expect(loadJobRecovery(actor)).toEqual(command);
    expect(loadJobRecovery('other-admin')).toBeNull();
    expect(() => clearJobRecovery(actor, { ...command, reason: 'Một lý do khác hoàn toàn' })).toThrow();
    expect(() => persistJobRecovery(actor, { ...command, requestId: crypto.randomUUID() })).toThrow();
    expect(loadJobRecovery(actor)).toEqual(command);
    clearJobRecovery(actor, command); expect(loadJobRecovery(actor)).toBeNull();
  });
  it('fails closed on blocked or silently discarded persistence', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(() => persistJobRecovery(actor, command)).toThrow();
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => loadJobRecovery(actor)).toThrow();
  });
  it('fails closed on corrupted records and failed removal', () => {
    window.sessionStorage.setItem(`roomqc:job-recovery:v1:${actor}`, '{}');
    expect(() => loadJobRecovery(actor)).toThrow();
    window.sessionStorage.clear(); persistJobRecovery(actor, command);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
    expect(() => clearJobRecovery(actor, command)).toThrow();
  });
  it('requires a positive receipt matching both run and request', () => {
    const receipt = { run_id: command.runId, request_id: command.requestId, released: true, replayed: true };
    expect(readJobRecoveryReceipt(receipt, command).released).toBe(true);
    expect(() => readJobRecoveryReceipt({ ...receipt, run_id: crypto.randomUUID() }, command)).toThrow();
    expect(() => readJobRecoveryReceipt({ ...receipt, released: false }, command)).toThrow();
  });
});
