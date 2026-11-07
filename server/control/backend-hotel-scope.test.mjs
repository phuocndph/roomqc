import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {expectedHotelScope,evaluateHotelScopeObservation,hotelScopeTables,hotelScopeProfileLevel,
  hotelScopeExpectedKeys,hotelScopeCompleteness,businessActorStates,businessActorActions,
  businessActorExpectedKeys,businessActorCompleteness} from '../../scripts/control-backend-hotel-scope-checks.mjs';

const row={tenantId:'a',hotelId:'a1'};
test('legacy business manager role maps to the existing manager user-level FK, not hotel_manager',()=>{
  assert.equal(hotelScopeProfileLevel('hotel_manager'),'manager');
  assert.equal(hotelScopeProfileLevel('department_manager'),'department_manager');
  assert.equal(hotelScopeProfileLevel('staff'),'staff');
  assert.throws(()=>hotelScopeProfileLevel('owner'));
});
test('hotel boundary contract limits tenant owners and assigned manager/staff without assuming platform semantics',()=>{
  assert.equal(hotelScopeTables.length,5);
  for(const role of ['hotel_manager','department_manager','staff']){
    assert.equal(expectedHotelScope({role,tenantId:'a',hotelIds:['a1']},row),true);
    assert.equal(expectedHotelScope({role,tenantId:'a',hotelIds:[]},row),false);
    assert.equal(expectedHotelScope({role,tenantId:'b',hotelIds:['a1']},row),false);
  }
  assert.equal(expectedHotelScope({role:'owner',tenantId:'a',hotelIds:[]},row),true);
  assert.equal(expectedHotelScope({role:'owner',tenantId:'b',hotelIds:['a1']},row),false);
  assert.equal(expectedHotelScope(null,row),false);
  assert.throws(()=>expectedHotelScope({role:'super_admin',tenantId:'a',hotelIds:[]},row));
  assert.throws(()=>expectedHotelScope(null,{tenantId:'a',hotelId:null}));
});
const observation=()=>({allowed:false,method:'GET',status:200,returnedRows:0,returnedTargetMatches:false,effectsUnchanged:true,targetEffectMatches:true});
test('hidden row and explicit permission refusal require unchanged data, not transport or constraint errors',()=>{
  assert.equal(evaluateHotelScopeObservation(observation()).passed,true);
  for(const status of [404,409,429,500,503])assert.equal(evaluateHotelScopeObservation({...observation(),status}).passed,false);
  assert.equal(evaluateHotelScopeObservation({...observation(),status:403,sqlstate:'42501'}).passed,true);
  assert.equal(evaluateHotelScopeObservation({...observation(),status:403,sqlstate:'23503'}).passed,false);
  assert.equal(evaluateHotelScopeObservation({...observation(),effectsUnchanged:false}).passed,false);
  assert.equal(evaluateHotelScopeObservation({...observation(),returnedRows:1,returnedTargetMatches:true}).passed,false);
  assert.equal(evaluateHotelScopeObservation({...observation(),returnedRows:null}).passed,false);
});
test('positive controls require exact fixture and effects, and POST cannot pass with empty 200',()=>{
  for(const method of ['GET','POST','PATCH','DELETE']){
    const o={...observation(),allowed:true,method,status:method==='POST'?201:200,returnedRows:1,returnedTargetMatches:true};
    assert.equal(evaluateHotelScopeObservation(o).passed,true);
    assert.equal(evaluateHotelScopeObservation({...o,targetEffectMatches:false}).passed,false);
    assert.equal(evaluateHotelScopeObservation({...o,returnedTargetMatches:false}).passed,false);
    assert.equal(evaluateHotelScopeObservation({...o,returnedRows:0}).passed,false);
  }
  assert.equal(evaluateHotelScopeObservation({...observation(),method:'POST'}).passed,false);
  assert.throws(()=>evaluateHotelScopeObservation({...observation(),allowed:'false'}));
  assert.throws(()=>evaluateHotelScopeObservation({...observation(),method:'TRUNCATE'}));
});
test('only the explicit room tenant/hotel integrity case accepts the exact pre-existing BEFORE guard',()=>{
  const o={...observation(),method:'PATCH',status:400,sqlstate:'23514',returnedRows:null,
    denialContract:'room_hotel_tenant_integrity',guardCode:'ROOM_HOTEL_TENANT_MISMATCH'};
  assert.equal(evaluateHotelScopeObservation(o).passed,true);
  assert.equal(evaluateHotelScopeObservation({...o,denialContract:'authorization'}).passed,false);
  for(const change of [{guardCode:null},{guardCode:'ROOM_QUOTA_EXCEEDED'},{sqlstate:'23503'},
    {status:409},{method:'POST'},{effectsUnchanged:false}])
    assert.equal(evaluateHotelScopeObservation({...o,...change}).passed,false);
});
test('owned harness preserves partial findings and is mandatory in current-source repeatability',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-hotel-scope-checks.mjs',import.meta.url),'utf8');
  const runner=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("const origin='http://127.0.0.1:8000'"));
  for(const s of ['two-tenants-four-hotels-five-tables-populated','actualRest:true','actualAuth:true',
    'verified:false,incomplete:true','UPDATE','update-check-unassigned-hotel','fullPermissionMatrix:false'])assert.ok(source.includes(s));
  assert.doesNotMatch(source,/TRUNCATE|DISABLE TRIGGER|DROP POLICY|UPDATE public\.subscription_plans/);
  assert.match(runner,/previous\.hotelScopeControls\?\.verified,true/);
  assert.match(runner,/previous\.hotelScopeSourceHash,state\.hotelScopeSourceHash/);
  assert.match(runner,/state\.hotelScopeControls=partial;await save/);
  assert.match(runner,/value\?\.contractVersion===2/);
  assert.match(runner,/emit\('backend_hotel_scope_controls',state\.hotelScopeControls\);await save\(\);\s+assert\.equal\(state\.hotelScopeControls\.verified,true/);
});
test('coverage keeps all 180 baseline identities and 100 explicit extension identities without duplicates',()=>{
  const keys=hotelScopeExpectedKeys();assert.equal(keys.length,280);assert.equal(new Set(keys).size,280);
  assert.equal(keys.filter(k=>k.startsWith('baseline|')).length,180);
  const counts={};for(const key of keys)counts[key.split('|')[0]]=(counts[key.split('|')[0]]??0)+1;
  assert.deepEqual(counts,{baseline:180,'owner-writes':52,'action-regression':6,'assignment-revocation':22,'platform-policy-parity':20});
});
test('matrix verification cannot silently drop actors, add observations or hide lost baseline positives',()=>{
  let positives=0;
  const observations=hotelScopeExpectedKeys().map(key=>{
    const [cohort,actorFixture,label,table,scope,method]=key.split('|');
    return {cohort,actorFixture,label,table,scope,method,
      expected:cohort==='baseline'&&positives++<47?'allow_exact_fixture':'deny_without_effects'};
  });
  assert.equal(hotelScopeCompleteness(observations).complete,true);
  assert.equal(hotelScopeCompleteness(observations.slice(1)).complete,false);
  assert.equal(hotelScopeCompleteness([...observations,observations[0]]).complete,false);
  assert.equal(hotelScopeCompleteness([...observations,{...observations[0],actorFixture:'unexpected'}]).complete,false);
  assert.equal(hotelScopeCompleteness(observations.map(o=>({...o,expected:'deny_without_effects'}))).complete,false);
});
test('scope migration only intersects existing action policies with an invoker predicate',async()=>{
  const migration=await readFile(new URL('../../supabase/migrations/20261021112018_hotel_bound_business_scope.sql',import.meta.url),'utf8');
  assert.match(migration,/SECURITY INVOKER/);assert.match(migration,/SET search_path = ''/);
  assert.match(migration,/AS RESTRICTIVE FOR ALL TO authenticated USING/);
  assert.match(migration,/WITH CHECK \(private\.business_hotel_scope\(tenant_id,hotel_id\)\)/);
  assert.match(migration,/a\.attnotnull/);assert.match(migration,/h\.tenant_id = p_tenant_id/);
  assert.match(migration,/ur\.role = 'super_admin'::public\.app_role/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION private\.business_hotel_scope\(uuid,uuid\) TO authenticated/);
  assert.doesNotMatch(migration,/SECURITY DEFINER|DROP POLICY|DISABLE ROW LEVEL|GRANT ALL|CREATE OR REPLACE FUNCTION public\.user_has_hotel_access/);
});

test('business actor matrix locks 49 proven actions, 12 invalid states and positive/deny/recovery identities',()=>{
  assert.equal(businessActorStates.length,12);
  assert.deepEqual(['owner-a','manager','department','staff'].map(a=>businessActorActions(a).length),[17,17,7,8]);
  const keys=businessActorExpectedKeys();assert.equal(keys.length,1764);assert.equal(new Set(keys).size,1764);
  const rows=keys.map(k=>{const [actorFixture,actorState,stage,table,method]=k.split('|');return {actorFixture,actorState,stage,table,method,
    expected:stage==='invalid'?'deny_without_effects':'allow_exact_fixture'}});
  assert.equal(businessActorCompleteness(rows).complete,true);
  assert.equal(rows.filter(o=>o.stage==='invalid').length,588);
  assert.equal(rows.filter(o=>o.expected==='allow_exact_fixture').length,1176);
  assert.equal(businessActorCompleteness(rows.slice(1)).complete,false);
  assert.equal(businessActorCompleteness([...rows,rows[0]]).complete,false);
  assert.equal(businessActorCompleteness(rows.map(o=>({...o,expected:'deny_without_effects'}))).complete,false);
  assert.equal(businessActorCompleteness([...rows,{...rows[0],actorState:'unlisted'}]).complete,false);
  assert.throws(()=>businessActorActions('super_admin'));
});

test('real account-state baseline is mandatory and does not replace the 280 scoped observations',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-hotel-scope-checks.mjs',import.meta.url),'utf8');
  const runner=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  for(const s of ['accountSessionControls:','actualAuthLogin:true','/auth/v1/logout?scope=local',
    "runActorStage(actor,state,'before')","runActorStage(actor,state,'invalid')","runActorStage(actor,state,'restored')",
    'Synthetic invalid state must be confirmed','signedClaimVariants:','concurrentRevocationFencing:false'])assert.ok(source.includes(s),s);
  assert.match(runner,/previous\.businessActorControls\?\.verified,true/);
  assert.match(runner,/state\.businessActorControls=state\.hotelScopeControls\.accountSessionControls/);
  assert.match(runner,/assert\.equal\(state\.businessActorControls\.verified,true/);
});

test('business actor migration keeps caller-bound private Auth lookup and pre-row statement fencing separate from action policies',async()=>{
  const migration=await readFile(new URL('../../supabase/migrations/20261021122115_business_live_actor_boundary.sql',import.meta.url),'utf8');
  assert.match(migration,/CREATE FUNCTION private\.business_actor_is_live\(\)/);
  assert.match(migration,/LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''/);
  assert.match(migration,/a\.id=\(SELECT auth\.uid\(\)\)/);
  assert.match(migration,/s\.id::text=\(SELECT auth\.jwt\(\)->>'session_id'\)/);
  assert.match(migration,/AS RESTRICTIVE FOR ALL TO authenticated USING/);
  assert.match(migration,/WITH CHECK \(\(SELECT private\.business_actor_is_live\(\)\)\)/);
  assert.match(migration,/FOR EACH STATEMENT EXECUTE FUNCTION/);
  assert.match(migration,/current_setting\('role',true\) NOT IN \('authenticated','anon'\)/);
  assert.match(migration,/ORDER BY role FOR SHARE/);
  assert.match(migration,/REVOKE ALL ON FUNCTION private\.enforce_live_business_actor\(\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(migration,/GRANT ALL|GRANT SELECT|FOR EACH ROW|DROP POLICY|DISABLE ROW LEVEL|user_metadata/);
});
