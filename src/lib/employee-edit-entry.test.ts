import { describe, expect, it } from 'vitest'
import { getEmployeeEditEntry } from './employee-edit-entry'

const actor = { id: 'actor', tenant_id: 'tenant-a' }
const target = { id: 'target', tenant_id: 'tenant-a', user_level_code: 'staff', is_primary_owner: false, is_super_admin: false }

describe('employee edit entry disposition, not server authorization', () => {
  it.each(['tenant_owner', 'manager', 'department_manager', 'staff', 'super_admin'])('routes own %s profile separately', user_level_code => {
    expect(getEmployeeEditEntry({ ...target, id: actor.id, user_level_code }, actor)).toEqual({ kind: 'profile' })
  })
  it.each(['manager', 'department_manager', 'staff'])('keeps the %s employee form reachable', user_level_code => {
    expect(getEmployeeEditEntry({ ...target, user_level_code }, actor)).toEqual({ kind: 'employee' })
  })
  it.each([
    { user_level_code: 'tenant_owner' }, { user_level_code: 'super_admin' },
    { is_primary_owner: true }, { is_super_admin: true }, { user_level_code: null },
    { tenant_id: 'tenant-b' },
  ])('does not send unsupported or other-tenant targets to employee RPC: %j', delta => {
    expect(getEmployeeEditEntry({ ...target, ...delta }, actor).kind).toBe('blocked')
  })
  it('does not invent an actor or tenant before queries are ready', () => {
    expect(getEmployeeEditEntry(target, null).kind).toBe('blocked')
    expect(getEmployeeEditEntry(target, { ...actor, tenant_id: null }).kind).toBe('blocked')
  })
})
