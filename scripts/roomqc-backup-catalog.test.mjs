import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBackupInventories, supportTargetCheckDefinitions} from './roomqc-backup-catalog.mjs';
const row = {kind: 'constraint', table: 'private.platform_support_acceptances',
  name: 'platform_support_acceptances_target_check', valid: true, definition: supportTargetCheckDefinitions[0]};
const flat = {...row, definition: supportTargetCheckDefinitions[1]};
test('reviewed PostgreSQL 17 CHECK round trip preserves raw inventory and records the exact delta', () => {
  const before = structuredClone(row), after = structuredClone(flat);
  const result = compareBackupInventories([row], [flat]);
  assert.equal(result.matches, true); assert.equal(result.reviewedDeparserDeltas.length, 1);
  assert.equal(result.reviewedDeparserDeltas[0].sourceDefinition, row.definition);
  assert.deepEqual(row, before); assert.deepEqual(flat, after);
  assert.deepEqual(compareBackupInventories([row], [row]), {matches: true, reviewedDeparserDeltas: []});
});
test('bounds, regex, validation state and the object identity remain exact', () => {
  for (const value of [
    {...flat, definition: flat.definition.replace('<= 48', '<= 49')},
    {...flat, definition: flat.definition.replace('>= 2', '>= 1')},
    {...flat, definition: flat.definition.replace('[a-z0-9-]', '[a-z0-9_-]')},
    {...flat, valid: false}, {...flat, table: 'public.platform_support_acceptances'},
    {...flat, name: 'another_constraint'}, {...flat, unexpected: true},
    {...flat, definition: flat.definition.replace(' AND ', ' OR ')},
  ]) assert.equal(compareBackupInventories([row], [value]).matches, false);
  assert.equal(compareBackupInventories([{...row, table: 'other'}], [{...flat, table: 'other'}]).matches, false);
});
test('missing/extra/reordered objects and changed table data or ACL still fail', () => {
  const data = {kind: 'data', name: 'auth.users', count: 2, hash: 'a'};
  const acl = {kind: 'table', name: 'public.hotels', acl: ['owner=arwdDxt/owner']};
  assert.equal(compareBackupInventories([row], []).matches, false);
  assert.equal(compareBackupInventories([row], [flat, data]).matches, false);
  assert.equal(compareBackupInventories([row, data], [data, flat]).matches, false);
  assert.equal(compareBackupInventories([row, data], [flat, {...data, hash: 'b'}]).matches, false);
  assert.equal(compareBackupInventories([row, acl], [flat, {...acl, acl: ['PUBLIC=r/owner']}]).matches, false);
});
