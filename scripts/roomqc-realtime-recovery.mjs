// Explicit recovery of the pinned Realtime 2.143.3 legacy encrypted identity.
// No tenant deletion/reseed, pool reset or runtime-discovered credential trust.
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const keys=['db_name','db_host','db_user','db_password','db_port'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const keyBytes=key=>{assert.equal(typeof key,'string');assert.equal(Buffer.byteLength(key),16,'REALTIME_RECOVERY_KEY_LENGTH');return Buffer.from(key)};
export function encryptRealtimeRecoveryValue(value,key){
 assert.equal(typeof value,'string');assert(value.length>0&&value.length<16384);
 const cipher=createCipheriv('aes-128-ecb',keyBytes(key),null);
 return Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64');
}
export function decryptRealtimeRecoveryValue(value,key){
 assert.equal(typeof value,'string');assert(!value.startsWith('g1:'),'REALTIME_RECOVERY_GCM_REVIEW_REQUIRED');
 const bytes=Buffer.from(value,'base64');assert(bytes.length>0&&bytes.length<=16384&&bytes.length%16===0&&bytes.toString('base64')===value,'REALTIME_RECOVERY_CIPHERTEXT_INVALID');
 try{const cipher=createDecipheriv('aes-128-ecb',keyBytes(key),null);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8')}
 catch{throw new Error('REALTIME_RECOVERY_DECRYPT_FAILED')}
}
export function realtimeRecoveryPlan({tenant,extensions,oldKey,newKey,expectedOldJwt,expectedOldSettings,newJwt,newPassword}){
 assert.match(tenant.id,uuid);assert.equal(tenant.external_id,'realtime-dev');assert.equal(tenant.jwt_jwks,null);
 assert(Array.isArray(extensions)&&extensions.length===1,'REALTIME_RECOVERY_SINGLE_EXTENSION_REQUIRED');
 const extension=extensions[0];assert.match(extension.id,uuid);assert.equal(extension.tenant_external_id,tenant.external_id);assert.equal(extension.type,'postgres_cdc_rls');
 keyBytes(oldKey);keyBytes(newKey);assert.notEqual(newKey,oldKey,'REALTIME_RECOVERY_OLD_KEY_REUSED');
 for(const x of [expectedOldJwt,newJwt,newPassword])assert(typeof x==='string'&&x.length>=32);
 assert.notEqual(newJwt,expectedOldJwt);assert.notEqual(newPassword,expectedOldSettings.db_password);
 assert.equal(decryptRealtimeRecoveryValue(tenant.jwt_secret,oldKey),expectedOldJwt,'REALTIME_RECOVERY_OLD_JWT_MISMATCH');
 const settings={...extension.settings};
 for(const key of keys){
  assert.equal(decryptRealtimeRecoveryValue(settings[key],oldKey),expectedOldSettings[key],'REALTIME_RECOVERY_OLD_TARGET_MISMATCH');
  settings[key]=encryptRealtimeRecoveryValue(key==='db_password'?newPassword:expectedOldSettings[key],newKey);
 }
 const jwtSecret=encryptRealtimeRecoveryValue(newJwt,newKey);
 assert.equal(decryptRealtimeRecoveryValue(jwtSecret,newKey),newJwt);
 assert.equal(decryptRealtimeRecoveryValue(settings.db_password,newKey),newPassword);
 const q=x=>"'"+String(x).replaceAll("'","''")+"'";
 const sql=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s';
 SELECT pg_advisory_xact_lock(1380733763,1431507009);
 DO $recovery$ BEGIN
 IF (SELECT count(*) FROM _realtime.tenants WHERE external_id='realtime-dev')<>1
 OR (SELECT count(*) FROM _realtime.extensions WHERE tenant_external_id='realtime-dev')<>1
 OR NOT EXISTS(SELECT 1 FROM _realtime.tenants WHERE id=${q(tenant.id)}::uuid AND to_jsonb(tenants)=${q(JSON.stringify(tenant))}::jsonb)
 OR NOT EXISTS(SELECT 1 FROM _realtime.extensions WHERE id=${q(extension.id)}::uuid AND to_jsonb(extensions)=${q(JSON.stringify(extension))}::jsonb)
 THEN RAISE EXCEPTION 'REALTIME_RECOVERY_SOURCE_CHANGED'; END IF;
 UPDATE _realtime.tenants SET jwt_secret=${q(jwtSecret)} WHERE id=${q(tenant.id)}::uuid;
 UPDATE _realtime.extensions SET settings=${q(JSON.stringify(settings))}::jsonb WHERE id=${q(extension.id)}::uuid;
 END $recovery$; COMMIT;`;
 return {sql,tenantId:tenant.id,extensionId:extension.id,oldKeyHash:hash(oldKey),newKeyHash:hash(newKey),
  jwtSecret,settings,preservedTenantIdentity:true,preservedLimitsAndPoolSettings:true,credentialsReissued:true};
}
