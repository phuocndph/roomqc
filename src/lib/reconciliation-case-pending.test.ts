import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCaseCommand, loadCaseCommand, persistCaseCommand } from './reconciliation-case-pending';

const scope = { actorId: '10000000-0000-4000-8000-000000000001', tenantId: '10000000-0000-4000-8000-000000000002', paymentId: '10000000-0000-4000-8000-000000000003' };
const command = { requestId: '10000000-0000-4000-8000-000000000004', action: 'note' as const, note: 'Nội dung chờ xác nhận', version: 3 };
const key = `roomqc:case-pending:v1:${scope.actorId}:${scope.tenantId}:${scope.paymentId}`;
describe('tab-session reconciliation command journal', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });
  it('preserves exact payload, never writes localStorage, and clears only a matching receipt', () => {
    persistCaseCommand(scope, command);
    expect(loadCaseCommand(scope)).toEqual(command);
    expect(localStorage.length).toBe(0);
    expect(() => clearCaseCommand(scope, { ...command, requestId: scope.actorId })).toThrow('CASE_COMMAND_CHANGED');
    expect(loadCaseCommand(scope)).toEqual(command);
    clearCaseCommand(scope, command);
    expect(loadCaseCommand(scope)).toBeNull();
  });
  it('never overwrites a pending command with a different ID or payload', () => {
    persistCaseCommand(scope, command);
    for (const next of [{ ...command, requestId: scope.actorId }, { ...command, note: 'Nội dung khác' }, { ...command, version: 4 }]) {
      expect(() => persistCaseCommand(scope, next)).toThrow('CASE_COMMAND_ALREADY_PENDING');
    }
    expect(loadCaseCommand(scope)).toEqual(command);
  });
  it('isolates actor, tenant and payment independently without erasing other scopes', () => {
    persistCaseCommand(scope, command);
    expect(loadCaseCommand({ ...scope, actorId: scope.paymentId })).toBeNull();
    expect(loadCaseCommand({ ...scope, tenantId: scope.actorId })).toBeNull();
    expect(loadCaseCommand({ ...scope, paymentId: scope.actorId })).toBeNull();
    expect(loadCaseCommand(scope)).toEqual(command);
  });
  it('rejects corrupt, mismatched and unsupported records without deleting them', () => {
    for (const record of [
      { format: 2, ...scope, command },
      { format: 1, ...scope, actorId: scope.paymentId, command },
      { format: 1, ...scope, command: { ...command, version: null } },
      { format: 1, ...scope, command: { ...command, requestId: 'invalid' } },
      { format: 1, ...scope, command: { ...command, note: ' Changed whitespace ' } },
      { format: 1, ...scope, command, unexpected: 'field' },
    ]) {
      const raw = JSON.stringify(record);
      sessionStorage.setItem(key, raw);
      expect(() => loadCaseCommand(scope)).toThrow();
      expect(sessionStorage.getItem(key)).toBe(raw);
    }
  });
  it('fails closed on inaccessible reads and silent writes or removals', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => loadCaseCommand(scope)).toThrow('denied');
    read.mockRestore();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(() => persistCaseCommand(scope, command)).toThrow('CASE_COMMAND_NOT_PERSISTED');
    write.mockRestore(); persistCaseCommand(scope, command);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
    expect(() => clearCaseCommand(scope, command)).toThrow('CASE_COMMAND_NOT_CLEARED');
  });
});
