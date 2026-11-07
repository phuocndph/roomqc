import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptRealtimeRecoveryValue as enc,decryptRealtimeRecoveryValue as dec,realtimeRecoveryPlan} from './roomqc-realtime-recovery.mjs';
const oldKey='0123456789abcdef',newKey='fedcba9876543210';
function fixture(){
 const expectedOldJwt='old-jwt-'.repeat(8),newJwt='new-jwt-'.repeat(8),newPassword='new-password-'.repeat(6),
 expectedOldSettings={db_name:'postgres',db_host:'db',db_user:'supabase_admin',db_password:'old-password-'.repeat(6),db_port:'5432'};
 const tenant={id:'12345678-1234-1234-1234-123456789012',external_id:'realtime-dev',jwt_secret:enc(expectedOldJwt,oldKey),jwt_jwks:null,max_concurrent_users:137};
 const extensions=[{id:'22345678-1234-1234-1234-123456789012',tenant_external_id:'realtime-dev',type:'postgres_cdc_rls',
 settings:{...Object.fromEntries(Object.entries(expectedOldSettings).map(([k,v])=>[k,enc(v,oldKey)])),db_pool:3,subcriber_pool_size:2,subs_pool_size:2,ssl_enforced:false}}];
 return {tenant,extensions,oldKey,newKey,expectedOldJwt,expectedOldSettings,newJwt,newPassword};
}
test('recovery rekeys every persisted connection field and JWT while preserving tenant, limits and pool overrides',()=>{
 const f=fixture(),before=structuredClone(f),p=realtimeRecoveryPlan(f);assert.deepEqual(f,before);
 assert.equal(p.tenantId,f.tenant.id);assert.equal(p.extensionId,f.extensions[0].id);
 for(const [key,value]of Object.entries(f.expectedOldSettings))assert.equal(dec(p.settings[key],newKey),key==='db_password'?f.newPassword:value);
 assert.equal(dec(p.jwtSecret,newKey),f.newJwt);
 for(const key of ['db_pool','subcriber_pool_size','subs_pool_size','ssl_enforced'])assert.equal(p.settings[key],f.extensions[0].settings[key]);
 assert(!/DELETE|TRUNCATE|INSERT/.test(p.sql));assert(p.sql.includes('REALTIME_RECOVERY_SOURCE_CHANGED'));assert(p.sql.includes('pg_advisory_xact_lock'));
 assert(!p.sql.includes(f.newJwt)&&!p.sql.includes(f.newPassword));
});
test('wrong trusted source identity, key reuse, unknown formats or a second extension cannot be adopted',()=>{
 for(const mutate of [f=>f.expectedOldJwt='wrong-'.repeat(10),f=>f.expectedOldSettings.db_host='outside.example',f=>f.newKey=f.oldKey,
  f=>f.newPassword=f.expectedOldSettings.db_password,f=>f.tenant.external_id='foreign',f=>f.tenant.jwt_jwks={},
  f=>f.extensions.push(structuredClone(f.extensions[0])),f=>f.tenant.jwt_secret='g1:unreviewed',f=>f.tenant.jwt_secret+='!']){
  const f=fixture();mutate(f);assert.throws(()=>realtimeRecoveryPlan(f));
 }
 assert.throws(()=>dec(enc('secret',oldKey),newKey),/REALTIME_RECOVERY_DECRYPT_FAILED/);
});
