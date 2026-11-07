import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
const migration=()=>read('supabase/migrations/20261021153825_self_profile_live_update_boundary.sql');
test('self-profile forward guard keeps Auth/session locks before users rows without self SHARE upgrades',async()=>{
  const sql=await migration(),statement=sql.slice(0,sql.indexOf('CREATE FUNCTION private.guard_self_profile_update'));
  assert.match(statement,/auth\.users WHERE id=v_actor FOR SHARE/);
  assert.match(statement,/auth\.sessions WHERE user_id=v_actor[\s\S]*FOR SHARE/);
  assert.doesNotMatch(statement,/FROM public\.users|FOR UPDATE|user_metadata/);
  assert.match(statement,/FOR EACH STATEMENT/);
  assert.match(sql,/OLD\.status IS DISTINCT FROM 'active'/);
  assert.match(sql,/COALESCE\(OLD\.account_locked,false\)/);
});
test('trigger functions are private and not exposed as privileged browser RPCs',async()=>{
  const sql=await migration();
  for(const name of ['fence_profile_update_session','guard_self_profile_update'])
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION private.${name}() FROM PUBLIC,anon,authenticated,service_role`));
  assert.equal((sql.match(/SECURITY DEFINER SET search_path=''/g)||[]).length,2);
  assert.doesNotMatch(sql,/GRANT|DISABLE ROW LEVEL|ALTER POLICY|DROP CONSTRAINT/);
});
test('self guard preserves first-owner onboarding and explicitly defers the existing password acknowledgement',async()=>{
  const sql=await migration();
  for(const text of ['OLD.id IS DISTINCT FROM auth.uid()','OLD.tenant_id IS NULL',"NEW.user_level_code='tenant_owner'",
    "roomqc.registration_user_id","'full_name','phone','avatar_url'",'OLD.must_change_password IS TRUE AND NEW.must_change_password IS FALSE'])
    assert.ok(sql.includes(text),text);
  assert.match(sql,/EC05 must review\/replace/);
});
test('actual self-profile proof includes real Storage bytes, parallel writes and observed revocation barriers',async()=>{
  const suite=await read('scripts/control-backend-self-profile-checks.mjs');
  for(const text of ['http://127.0.0.1:8000','readBytes.equals(bytes)','pg_blocking_pids','revoke-first','mutation-first',
    'next-request-denied-','parallelControls.verified','passwordAcknowledgement:false','fullCallerMatrix:false'])assert.ok(suite.includes(text),text);
  assert.doesNotMatch(suite,/process\.env\.(SUPABASE_URL|DATABASE_URL)|DISABLE TRIGGER/);
});
test('default integrated runner and passing B references require self-profile checks and identical source',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  assert.match(runner,/previous\.selfProfileControls\?\.verified,true/);
  assert.match(runner,/previous\.selfProfileSourceHash,state\.selfProfileSourceHash/);
  assert.match(runner,/assert\.equal\(state\.selfProfileControls\?\.verified,true/);
  assert.match(runner,/previous\.diagnosticOnly\?\?false,false/);
});
