import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../scripts/control-backend-hotel-delete-checks.mjs',import.meta.url),'utf8');
const migration=await readFile(new URL('../../supabase/migrations/20261021045309_protect_workspace_receipt_hotel_delete.sql',import.meta.url),'utf8');
test('hotel deletion drill uses actual REST and GoTrue with nonempty receipt and room draft controls',()=>{
  for(const value of ['/auth/v1/logout?scope=global','/rest/v1/hotels','get_workspace_provisioning','save_hotel_room_setup',
    'ownerMovedWithinTenant:checks.includes','receiptFixtureNonempty:checks.includes','23503','ten-protected-deletes-one-stable-receipt'])assert.ok(source.includes(value),value);
  assert.match(source,/self-owner-primary-hotel-patch-refused-no-effects/);
  assert.match(source,/ownerMoveIsInstallerFixture:true/);
});
test('hotel deletion drill includes live-state denials, allowed unbound deletion and actual two-order lock races',()=>{
  for(const value of ['locked','inactive','auth-deleted','banned','unconfirmed','expired-session','role-revoked',
    'live-owner-empty-unbound-delete-positive','pg_blocking_pids','revoke-first-delete-waits','delete-first-revoke-waits'])assert.ok(source.includes(value),value);
  assert.match(source,/findings\.length===0/);assert.doesNotMatch(source,/TRUNCATE|DISABLE TRIGGER|DROP CONSTRAINT/);
});

test('hotel DELETE narrows existing policies using live authority locks and a private minimal-grant predicate',()=>{
  assert.match(migration,/AS RESTRICTIVE\s+FOR DELETE TO authenticated/);
  assert.match(migration,/private\.lock_live_role_actor\('owner'\)/);
  assert.match(migration,/u\.id=v_actor AND u\.tenant_id=p_tenant_id/);
  assert.match(migration,/VOLATILE SECURITY DEFINER SET search_path=''/);
  assert.match(migration,/FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION private\.live_hotel_delete_owner\(uuid\) TO authenticated/);
  assert.doesNotMatch(migration,/DISABLE ROW LEVEL|GRANT ALL|user_metadata/);
});

test('receipt protection and actual constraint-specific refusals do not rely on an unrelated hotel FK',()=>{
  assert.match(migration,/workspace_provisioning_hotel_id_fkey[\s\S]*REFERENCES public\.hotels\(id\) ON DELETE NO ACTION/);
  assert.match(source,/receipt-hotel-fk-no-action-catalog/);
  assert.match(source,/workspace_provisioning_hotel_id_fkey\/.test/);
  assert.match(source,/outcomes\.every\(receiptRefusal\)/);
});

test('hotel deletion setup failures retain structured incomplete evidence without reporting verification',()=>{
  assert.match(source,/verified:false,incomplete:true,failedPhase:phase/);
  assert.match(source,/quotaExceeded/);assert.match(source,/tenantMissing/);
  assert.match(source,/INSERT INTO public\.subscription_plans/);
  assert.match(source,/owned-bounded-plan-quota-enabled/);
  assert.doesNotMatch(source,/UPDATE public\.subscription_plans/);
});
