import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const migration=()=>readFile(new URL('../../supabase/migrations/20261021133739_employee_profile_atomic_edit.sql',import.meta.url),'utf8');
test('forward audit fix retains every authority/effect check and the existing activity constraint',async()=>{
  const before=await migration(),after=await readFile(new URL('../../supabase/migrations/20261021143251_employee_profile_audit_action.sql',import.meta.url),'utf8');
  const start=before.indexOf('CREATE FUNCTION private.edit_employee_profile'),end=before.indexOf('CREATE FUNCTION public.edit_employee_profile');
  const expected=before.slice(start,end).trim().replace('CREATE FUNCTION private.','CREATE OR REPLACE FUNCTION private.')
    .replace("'updated','Cập nhật hồ sơ nhân viên'","'update','Cập nhật hồ sơ nhân viên'");
  assert.ok(after.includes(expected));assert.doesNotMatch(after,/ALTER TABLE|DISABLE|DROP CONSTRAINT|EXCEPTION WHEN/);
  assert.match(after,/'update','Cập nhật hồ sơ nhân viên'/);
  assert.doesNotMatch(after,/'updated','Cập nhật hồ sơ nhân viên'/);
});
test('employee metadata API has an invoker wrapper and private caller-bound implementation, not role writes',async()=>{
  const sql=await migration();
  assert.match(sql,/CREATE FUNCTION public\.edit_employee_profile[\s\S]*SECURITY INVOKER SET search_path=''/);
  assert.match(sql,/CREATE FUNCTION private\.edit_employee_profile[\s\S]*SECURITY DEFINER SET search_path=''/);
  assert.match(sql,/v_actor_id uuid:=auth\.uid\(\)/);
  assert.match(sql,/current_setting\('role',true\) IS DISTINCT FROM 'authenticated'/);
  assert.match(sql,/s?\.id::text=auth\.jwt\(\)->>'session_id'|id::text=auth\.jwt\(\)->>'session_id'/);
  assert.match(sql,/NOT public\.can_manage_user\(v_actor_id,p_target_id\)/);
  assert.match(sql,/public\.has_user_permission\(v_actor_id,'users','update'\)/);
  assert.match(sql,/v_tenant\.is_read_only IS DISTINCT FROM false/);
  assert.match(sql,/v_target\.tenant_id IS DISTINCT FROM v_actor\.tenant_id/);
  assert.match(sql,/REVOKE ALL ON FUNCTION private\.edit_employee_profile[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(sql,/(?:INSERT INTO|UPDATE|DELETE FROM) public\.user_roles|DISABLE ROW LEVEL|GRANT ALL|user_metadata/);
});
test('edit writes are one transaction with bounded input, version and durable exact replay',async()=>{
  const sql=await migration();
  for(const s of ['jsonb_object_keys(p_changes)','EMPLOYEE_EDIT_STALE_VERSION','EMPLOYEE_EDIT_REQUEST_CONFLICT',
    'v_receipt.payload IS DISTINCT FROM v_payload','RETURN v_receipt.result',
    'INSERT INTO public.activity_logs','INSERT INTO private.employee_profile_edit_receipts',
    'ALTER TABLE private.employee_profile_edit_receipts ENABLE ROW LEVEL SECURITY'])assert.ok(sql.includes(s),s);
  assert.ok(sql.indexOf('pg_advisory_xact_lock')<sql.indexOf('WHERE id=p_target_id FOR UPDATE'));
  assert.ok(sql.indexOf('SELECT * INTO v_receipt')<sql.indexOf('v_target.updated_at IS DISTINCT FROM'));
  assert.doesNotMatch(sql,/EXCEPTION WHEN OTHERS|is_default|is_active|departments/);
});
test('owned runtime checks preserve old matrices and require employee terminal proof for B',async()=>{
  const suite=await readFile(new URL('../../scripts/control-backend-employee-profile-checks.mjs',import.meta.url),'utf8');
  const runner=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  for(const s of ['audit-failure-rolls-back-profile-membership-receipt','two-tab-same-request','two-edits-same-version',
    'lost-response-replay','revoke-first','mutation-first','waitBlocked','fullEmployeeAuthorityMatrix:false'])assert.ok(suite.includes(s),s);
  assert.match(runner,/previous\.employeeProfileControls\?\.verified,true/);
  assert.match(runner,/previous\.employeeProfileSourceHash,state\.employeeProfileSourceHash/);
  assert.match(runner,/assert\.equal\(state\.employeeProfileControls\?\.verified,true/);
});
test('employee diagnostic remains exact-owned and cannot satisfy full integration or B reference',async()=>{
  const runner=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  const scope=await readFile(new URL('../../scripts/control-backend-hotel-scope-checks.mjs',import.meta.url),'utf8');
  assert.match(runner,/diagnosticOnly:Boolean\(diagnostic\),fullIntegratedRun:!diagnostic/);
  assert.match(runner,/previous\.diagnosticOnly\?\?false,false/);
  assert.match(runner,/assert\.ok\(!diagnostic\|\|!expectedBuildState/);
  assert.match(runner,/diagnosticSchemaAfter,state\.schemaManifestHash/);
  assert.match(scope,/if\(input\.diagnosticOnly===true\)/);
  const filename=fileURLToPath(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url));
  for(const args of [['--diagnostic','other'],['--diagnostic','employee-profile','--expected-build-state',filename]]){
    const result=spawnSync(process.execPath,[filename,'--run',...args],{encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);assert.doesNotMatch(result.stdout,/backend_sandbox_prepare/);
  }
});
