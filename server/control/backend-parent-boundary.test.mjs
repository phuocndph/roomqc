import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildParentBoundaryChecks} from '../../scripts/control-backend-parent-boundary-checks.mjs';
import {parentBoundaryForeignKeys} from '../../scripts/control-backend-parent-boundary-review.mjs';
const actor=n=>({id:n.repeat(8)+'-1111-4111-8111-'+n.repeat(12),
  tenantId:n.repeat(8)+'-2222-4222-8222-'+n.repeat(12),
  hotelId:n.repeat(8)+'-3333-4333-8333-'+n.repeat(12),
  sessionId:n.repeat(8)+'-4444-4444-8444-'+n.repeat(12)});
const fixture={owner:actor('1'),admin:actor('2')};
test('parent boundary drill rejects missing, reused and injected fixture identities',()=>{
  for(const input of [undefined,{}, {owner:fixture.owner,admin:fixture.owner},
    {...fixture,owner:{...fixture.owner,tenantId:"'; RESET ROLE;--"}}])
    assert.throws(()=>buildParentBoundaryChecks(input));
});
test('populated FK parent tests assume actual roles and always roll back unexpected mutations',()=>{
  const sql=buildParentBoundaryChecks(fixture);
  assert.match(sql,/actual_catalog IS DISTINCT FROM reviewed_catalog/);
  assert.match(sql,/"deferrable" boolean/);
  assert.match(sql,/PREPARE roomqc_parent_snapshot AS/);
  assert.match(sql,/snapshot_sql:='EXECUTE roomqc_parent_snapshot'/);
  assert.match(sql,/observer_checks=3/);
  assert.match(sql,/PARENT_BOUNDARY_SNAPSHOT_OBSERVER_FAILED/);
  assert.match(sql,/PARENT_BOUNDARY_UNSCOPED_PARENT_GRANT/);
  assert.match(sql,/checked=jsonb_array_length\(reviewed_catalog\) AND denied=expected_denials/);
  assert.match(sql,/format\('%I IS NOT NULL',col\)/);
  assert.match(sql,/password_fks=1 AND password_denials=8/);
  assert.match(sql,/n.nspname IN \('public','private'\)/);
  assert.match(sql,/'snapshotTables',snapshot_tables/);
  assert.match(sql,/PARENT_HOTEL_OWNER_ROW_NOT_VISIBLE/);
  const roleAttempts=sql.slice(sql.indexOf('FOREACH actor_label'),sql.indexOf('-- Distinguish blocked browser access'));
  assert.ok(roleAttempts.indexOf('PARENT_BOUNDARY_ROLE_NOT_ASSUMED')<roleAttempts.indexOf('OWNED_PARENT_ROLLBACK'));
  assert.match(sql,/GET DIAGNOSTICS affected=ROW_COUNT/);assert.match(sql,/workspace_provisioning_hotel_id_fkey/);
  assert.match(sql,/PARENT_BOUNDARY_SNAPSHOT_CHANGED/);
  assert.match(sql,/PARENT_TRUSTED_ROLLBACK_CHANGED_SNAPSHOT/);
  assert.match(sql,/'sqlActorAssumptionOnly',true/);
  assert.match(sql,/'parentKeyUpdateBoundariesVerified',true/);
  assert.match(sql,/'fullIndirectDispositionVerified',false/);
  assert.match(sql,/'productionOffboardingApproved',false/);
  assert.ok(sql.trim().endsWith('ROLLBACK;'));
  assert.doesNotMatch(sql,/DISABLE|DROP CONSTRAINT|TRUNCATE|GRANT ALL/);
});
test('parent key updates use a new UUID, validate the actual referenced FK and fail closed on null positives',()=>{
  const sql=buildParentBoundaryChecks(fixture);
  assert.match(sql,/ARRAY\['delete','update_key'\]/);
  assert.match(sql,/format\('%I=gen_random_uuid\(\)'/);
  assert.match(sql,/DELETE FROM %I.%I WHERE %s/);
  assert.match(sql,/UPDATE %I.%I SET %s WHERE %s/);
  assert.match(sql,/unnest\(fk.parent_columns\) WITH ORDINALITY/);
  assert.match(sql,/parent.relname=fk.parent_table AND c.confupdtype/);
  assert.match(sql,/hotel_id' IS DISTINCT FROM/);
});
test('reviewed catalog binds tuple order, actions and deferral, including both composite references',()=>{
  const byName=new Map(parentBoundaryForeignKeys.map(f=>[f.constraint_name,f]));
  assert.equal(byName.size,parentBoundaryForeignKeys.length);
  assert.equal(parentBoundaryForeignKeys.length,29);
  assert.ok(Object.isFrozen(parentBoundaryForeignKeys));
  const booking=byName.get('booking_notification_events_actor_id_command_id_fkey');
  assert.deepEqual(booking.child_columns,['actor_id','command_id']);
  assert.deepEqual(booking.parent_columns,['actor_id','command_id']);
  assert.equal(booking.deferrable,false);
  const invoice=byName.get('guest_invoice_checkout_source_fk');
  assert.deepEqual(invoice.child_columns,['checkout_actor_id','checkout_command_id']);
  assert.deepEqual(invoice.parent_columns,booking.parent_columns);
  assert.equal(invoice.source_schema,'public');assert.equal(invoice.initially_deferred,true);
  assert.equal(invoice.deferrable,true);assert.equal(invoice.delete_action,'a');
  for(const f of parentBoundaryForeignKeys){assert.equal(f.child_columns.length,f.parent_columns.length);
    assert.equal(f.uuid_columns,true);assert.ok(Object.isFrozen(f.child_columns));}
  const sql=buildParentBoundaryChecks(fixture);
  assert.match(sql,/composite_integrity=4 AND deferred_staged=2 AND composite_denials=32/);
  assert.match(sql,/SET CONSTRAINTS %I.%I IMMEDIATE/);
  assert.match(sql,/SET CONSTRAINTS ALL IMMEDIATE/);
  assert.match(sql,/inserted=fk.initially_deferred/);
  assert.match(sql,/error_constraint=fk.constraint_name/);
  assert.match(sql,/PARENT_BOUNDARY_COMPOSITE_SIBLING_MISSING/);
  assert.match(sql,/EXISTS\(SELECT 1 FROM %I.%I sibling WHERE sibling.%I=c.%I AND sibling.%I<>c.%I\)/);
  assert.match(sql,/ARRAY\['delete','update_key_1','update_key_2','update_key'\]/);
});
test('owned positives exercise setup and case APIs before the denial snapshot, with missing-data guards',()=>{
  const sql=buildParentBoundaryChecks(fixture);
  const snapshot=sql.indexOf('CREATE TEMP TABLE roomqc_parent_snapshot_observer');
  assert.ok(snapshot>sql.indexOf('SELECT public.complete_hotel_room_setup('));
  assert.ok(snapshot>sql.indexOf('SELECT public.admin_mutate_subscription_reconciliation_case('));
  assert.match(sql,/d.confirmed_by='11111111-1111-4111-8111-111111111111'::uuid/);
  assert.match(sql,/e.actor_id='22222222-1111-4111-8111-222222222222'::uuid/);
  assert.match(sql,/PARENT_BOUNDARY_ROOM_FIXTURE_REQUIRED/);
  assert.match(sql,/PARENT_BOUNDARY_CASE_FIXTURE_REQUIRED/);
  assert.doesNotMatch(sql,/UPDATE private.hotel_room_setup SET|INSERT INTO private.subscription_reconciliation_case_events/);
});
test('runner requires parent boundary evidence and draft cascade positive in candidate comparison',async()=>{
  const runner=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.match(runner,/buildParentBoundaryChecks\(access.sessionFixtures\)/);
  assert.match(runner,/previous.parentBoundaryControls\?\.verified,true/);
  assert.match(runner,/previous.parentBoundarySourceHash,state.parentBoundarySourceHash/);
  assert.match(runner,/diagnostic==='parent-boundary'/);
  assert.match(runner,/diagnostic!=='parent-boundary'/);
  assert.match(runner,/buildParentBoundaryChecks\(access.sessionFixtures\),\{privateDiagnostics:true,timeout:150000\}/);
  assert.match(runner,/parentBoundaryFailureCodes.includes\(code\)/);
  const hotel=await readFile(new URL('../../scripts/control-backend-hotel-delete-checks.mjs',import.meta.url),'utf8');
  assert.match(hotel,/live-owner-unbound-draft-delete-cascades-positive/);
});
