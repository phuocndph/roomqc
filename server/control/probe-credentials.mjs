import {createHash,randomUUID} from 'node:crypto';
import {releaseExpectation,releaseExpectationFingerprint} from './release-manifest.mjs';
import {exact,probeError} from './probe-secrets.mjs';
import {ControlError,uuidPattern} from './errors.mjs';
import {assertReleaseAuthority} from './release-authority.mjs';

const ref=/^[a-z][a-z0-9-]{1,63}$/;
const jwt=token=>{
  if(typeof token!=='string'||token.length>16000||token.split('.').length!==3)throw probeError('PROBE_BUNDLE_INVALID');
  try{const value=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));if(!value||typeof value!=='object')throw 0;return value}
  catch{throw probeError('PROBE_BUNDLE_INVALID')}
};
export const probeSessionPolicy=Object.freeze({refreshWindowMs:120000,minimumValidityMs:30000,
  refreshedValidityMs:90000,leaseMs:15000,requestTimeoutMs:5000});

// Only a trusted inventory + approved release artifact may construct this input.
// The public signup/admin HTTP body must never supply it.
export function probeBinding(cluster,input){
  const expected=releaseExpectation(input),credentialRef=cluster.credentialRef??cluster.id,inventoryRef=cluster.inventoryRef??cluster.id;
  if(cluster.id!==expected.clusterId||!ref.test(credentialRef)||!ref.test(inventoryRef))throw probeError('PROBE_BINDING_INVALID');
  for(const origin of [cluster.url,cluster.internalUrl??cluster.url]){
    let url;try{url=new URL(origin)}catch{throw probeError('PROBE_BINDING_INVALID')}
    if(url.origin!==origin||url.username||url.password||!['https:','http:'].includes(url.protocol))throw probeError('PROBE_BINDING_INVALID');
  }
  const definition={clusterId:cluster.id,credentialRef,inventoryRef,url:cluster.url,internalUrl:cluster.internalUrl??null,
    approvedAddresses:Object.freeze([...(cluster.approvedAddresses??[])].sort()),releaseFingerprint:releaseExpectationFingerprint(expected)};
  return Object.freeze({...definition,expected,bindingHash:createHash('sha256').update(JSON.stringify(definition)).digest('hex')});
}
// Shape checks are NOT signature verification. Trust comes from installer-only
// seed + authenticated live endpoint checks; metadata claims grant no DB rights.
export function validateProbeBundle(input,{now=Date.now(),allowExpiredAuth=false,minValidityMs=probeSessionPolicy.minimumValidityMs}={}){
  if(!exact(input,['credential','auth'])||!exact(input.credential,['publishableKey','token'])
    ||!exact(input.auth,['token','refreshToken','userId','sessionId']))throw probeError('PROBE_BUNDLE_INVALID');
  const {credential,auth}=input,key=credential.publishableKey;
  if(typeof key!=='string'||!key||key.length>16000||/\s/.test(key)||key.startsWith('sb_secret_')||key===credential.token)throw probeError('PROBE_BUNDLE_INVALID');
  if(key.split('.').length===3&&jwt(key).role==='service_role')throw probeError('PROBE_BUNDLE_INVALID');
  const probe=jwt(credential.token),access=jwt(auth.token);
  if(probe.role!=='roomqc_control_probe'||access.role!=='authenticated'||!Number.isSafeInteger(probe.exp)||!Number.isSafeInteger(access.exp)
    ||!uuidPattern.test(auth.userId)||!uuidPattern.test(auth.sessionId)||access.sub!==auth.userId||access.session_id!==auth.sessionId
    ||typeof auth.refreshToken!=='string'||auth.refreshToken.length<1||auth.refreshToken.length>8192||/\s/.test(auth.refreshToken)
    ||probe.exp*1000<=now+minValidityMs||(!allowExpiredAuth&&access.exp*1000<=now+minValidityMs)
    ||!Number.isSafeInteger(probe.exp*1000)||!Number.isSafeInteger(access.exp*1000)
    ||Math.abs(probe.exp*1000)>8640000000000000||Math.abs(access.exp*1000)>8640000000000000)throw probeError('PROBE_BUNDLE_INVALID');
  return {bundle:{credential:{...credential},auth:{...auth}},authExpiresAt:new Date(access.exp*1000),probeExpiresAt:new Date(probe.exp*1000)};
}
const context=(binding,revision)=>({clusterId:binding.clusterId,credentialRef:binding.credentialRef,bindingHash:binding.bindingHash,revision});
const view=row=>({revision:Number(row.revision),state:row.state,reasonCode:row.reason_code??null});
const checkRevision=revision=>{if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER-2)throw probeError('PROBE_REVISION_INVALID')};

export class ProbeCredentialStore {
  // Reuse one dedicated bounded probe pool; never the metrics-writer login,
  // and never a pool per cluster/token. Both pools count toward the DB budget.
  // Runtime and installer logins have separate grants. No service_role in either.
  constructor(pool,keyring,{transactionTimeoutMs=5000}={}){
    if(!Number.isInteger(transactionTimeoutMs)||transactionTimeoutMs<10||transactionTimeoutMs>10000)throw probeError('PROBE_STORE_INVALID');
    this.pool=pool;this.keyring=keyring;this.transactionTimeoutMs=transactionTimeoutMs;
  }
  async readiness(){
    const {verifyHistory,migrationManifest}=await import('./migrate.mjs');
    const manifest=await migrationManifest();
    if(await verifyHistory(this.pool,manifest)!==manifest.length)throw probeError('CONTROL_SCHEMA_PENDING');
    const {rows}=await this.pool.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR NOT pg_has_role(current_user,'roomqc_control_probe_runtime','USAGE')
      OR pg_has_role(current_user,'roomqc_control_probe_installer','USAGE')
      OR pg_has_role(current_user,'roomqc_control_metrics','USAGE')
      OR has_schema_privilege(current_user,'roomqc_control','CREATE')
      OR has_table_privilege(current_user,'roomqc_control.probe_credentials','INSERT,DELETE')
      OR has_column_privilege(current_user,'roomqc_control.probe_credentials','binding_hash','UPDATE')
      OR has_table_privilege(current_user,'roomqc_control.workspaces','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.schema_migrations','INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.cluster_events','UPDATE,DELETE') AS excessive
      FROM pg_roles r WHERE r.rolname=current_user`);
    if(rows[0]?.excessive!==false)throw probeError('PROBE_RUNTIME_PRIVILEGES');
    return {schemaVersion:manifest.at(-1).version};
  }
  async transaction(run){
    const client=await this.pool.connect();let expired=false;
    const timer=setTimeout(()=>{expired=true;client.release(true)},this.transactionTimeoutMs);
    try{
      await client.query('BEGIN');
      // Same short-transaction lock as admin binding/admission/health mutations.
      // Never keep a connection/lock across the remote refresh request.
      await client.query('SELECT pg_advisory_xact_lock(727001)');
      const result=await run(client);await client.query('COMMIT');return result;
    }catch(error){if(!expired)await client.query('ROLLBACK');if(expired)throw probeError('PROBE_DATABASE_TIMEOUT');throw error}
    finally{clearTimeout(timer);if(!expired)client.release()}
  }
  async target(client,binding){
    const c=(await client.query(`SELECT id,api_url,credential_ref,inventory_ref,release_id,schema_manifest_hash,
      extract(epoch FROM clock_timestamp())*1000 AS now_ms FROM roomqc_control.clusters WHERE id=$1`,[binding.clusterId])).rows[0];
    if(!c||c.api_url!==binding.url||c.credential_ref!==binding.credentialRef||c.inventory_ref!==binding.inventoryRef
      ||c.release_id!==binding.expected.releaseId||c.schema_manifest_hash!==binding.expected.schemaManifestHash)throw probeError('PROBE_TARGET_CHANGED');
    return Number(c.now_ms);
  }
  async assertReleaseApproval(approval){
    return this.transaction(client=>assertReleaseAuthority(client,approval));
  }
  async row(client,binding){
    return (await client.query('SELECT * FROM roomqc_control.probe_credentials WHERE cluster_id=$1 FOR UPDATE',[binding.clusterId])).rows[0];
  }
  check(row,binding){
    if(!row)throw probeError('PROBE_CREDENTIAL_MISSING');
    if(row.credential_ref!==binding.credentialRef||row.binding_hash!==binding.bindingHash)throw probeError('PROBE_TARGET_CHANGED');
    checkRevision(Number(row.revision));
  }
  async audit(client,binding,before,after,type){
    await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source,request_id)
      VALUES($1,$2,$3::jsonb,$4::jsonb,'probe_credentials',$5)`,[binding.clusterId,type,
      JSON.stringify(before?view(before):null),JSON.stringify(view(after)),randomUUID()]);
  }
  async recover(client,binding,row,reason){
    const after=(await client.query(`UPDATE roomqc_control.probe_credentials SET state='needs_recovery',revision=revision+1,
      lease_id=NULL,lease_until=NULL,reason_code=$2,updated_at=clock_timestamp() WHERE cluster_id=$1 RETURNING *`,[binding.clusterId,reason])).rows[0];
    // Usable ciphertext is re-bound on every revision. Recovery is deliberately
    // never decryptable/usable by acquire: leave the old envelope as quarantined
    // historical ciphertext; only an explicit installer reseed can return ready.
    await this.audit(client,binding,row,after,'probe_recovery_required');return {error:'PROBE_RECOVERY_REQUIRED'};
  }
  async install(binding,input,{expectedRevision}={}){
    checkRevision(expectedRevision);
    return this.transaction(async client=>{
      const now=await this.target(client,binding),old=await this.row(client,binding);
      if(Number(old?.revision??0)!==expectedRevision)throw probeError('PROBE_REVISION_CONFLICT');
      const clean=validateProbeBundle(input,{now});
      // Installer recovery may start a NEW session, but never a NEW canary user.
      if(old&&old.auth_user_id!==clean.bundle.auth.userId)throw probeError('PROBE_CANARY_IDENTITY_CHANGED');
      if(old?.state==='disabled'&&old.auth_session_id===clean.bundle.auth.sessionId)throw probeError('PROBE_NEW_SESSION_REQUIRED');
      const revision=expectedRevision+1,envelope=this.keyring.seal(clean.bundle,context(binding,revision));
      const after=(await client.query(`INSERT INTO roomqc_control.probe_credentials(cluster_id,credential_ref,binding_hash,
        revision,state,envelope,auth_user_id,auth_session_id,auth_expires_at,probe_expires_at)
        VALUES($1,$2,$3,$4,'ready',$5::jsonb,$6,$7,$8,$9) ON CONFLICT(cluster_id) DO UPDATE SET
        credential_ref=EXCLUDED.credential_ref,binding_hash=EXCLUDED.binding_hash,revision=EXCLUDED.revision,state='ready',
        envelope=EXCLUDED.envelope,auth_user_id=EXCLUDED.auth_user_id,auth_session_id=EXCLUDED.auth_session_id,
        auth_expires_at=EXCLUDED.auth_expires_at,probe_expires_at=EXCLUDED.probe_expires_at,
        lease_id=NULL,lease_until=NULL,reason_code=NULL,updated_at=clock_timestamp() RETURNING *`,
      [binding.clusterId,binding.credentialRef,binding.bindingHash,revision,JSON.stringify(envelope),clean.bundle.auth.userId,
        clean.bundle.auth.sessionId,clean.authExpiresAt,clean.probeExpiresAt])).rows[0];
      await this.audit(client,binding,old,after,old?'probe_credentials_rotated':'probe_credentials_seeded');return view(after);
    });
  }
  // Directory credential disable is not remote Auth logout. Fence immediately
  // here and at health/admission commit, even if an old JWT remains valid there.
  // No decryption, keyring or live Auth call is needed to disable an expired row.
  async disable(binding,{expectedRevision}={}){
    checkRevision(expectedRevision);
    return this.transaction(async client=>{
      const permitted=(await client.query("SELECT pg_has_role(current_user,'roomqc_control_probe_installer','USAGE') AS allowed")).rows[0]?.allowed;
      if(permitted!==true)throw new ControlError(403,'PROBE_INSTALLER_REQUIRED','Cần quyền cài đặt để vô hiệu phiên giám sát.');
      await this.target(client,binding);const row=await this.row(client,binding);this.check(row,binding);
      if(Number(row.revision)!==expectedRevision)throw probeError('PROBE_REVISION_CONFLICT');
      if(row.state==='disabled')return view(row);
      const after=(await client.query(`UPDATE roomqc_control.probe_credentials SET state='disabled',revision=revision+1,
        lease_id=NULL,lease_until=NULL,reason_code='OPERATOR_DISABLED',updated_at=clock_timestamp()
        WHERE cluster_id=$1 RETURNING *`,[binding.clusterId])).rows[0];
      await this.audit(client,binding,row,after,'probe_credentials_disabled');return view(after);
    });
  }
  async acquire(binding){
    const result=await this.transaction(async client=>{
      const now=await this.target(client,binding),row=await this.row(client,binding);this.check(row,binding);
      if(row.state==='disabled')return {error:'PROBE_CREDENTIAL_DISABLED'};
      if(row.state==='needs_recovery')return {error:'PROBE_RECOVERY_REQUIRED'};
      if(row.state==='refreshing'){
        if(row.lease_until.getTime()<=now)return this.recover(client,binding,row,'REFRESH_LEASE_EXPIRED');
        return {error:'PROBE_REFRESH_BUSY'};
      }
      const revision=Number(row.revision),clean=validateProbeBundle(this.keyring.unseal(row.envelope,context(binding,revision)),{now,allowExpiredAuth:true});
      if(clean.authExpiresAt.getTime()!==row.auth_expires_at.getTime()||clean.probeExpiresAt.getTime()!==row.probe_expires_at.getTime()
        ||clean.bundle.auth.userId!==row.auth_user_id||clean.bundle.auth.sessionId!==row.auth_session_id)throw probeError('PROBE_SECRET_INVALID');
      if(clean.authExpiresAt.getTime()>now+probeSessionPolicy.refreshWindowMs)return {kind:'ready',revision,bundle:clean.bundle};
      const leaseId=randomUUID(),nextRevision=revision+1,envelope=this.keyring.seal(clean.bundle,context(binding,nextRevision));
      const after=(await client.query(`UPDATE roomqc_control.probe_credentials SET state='refreshing',revision=$2,envelope=$3::jsonb,
        lease_id=$4,lease_until=clock_timestamp()+interval '15 seconds',updated_at=clock_timestamp()
        WHERE cluster_id=$1 RETURNING *`,[binding.clusterId,nextRevision,JSON.stringify(envelope),leaseId])).rows[0];
      await this.audit(client,binding,row,after,'probe_refresh_claimed');
      return {kind:'refresh',revision:nextRevision,leaseId,bundle:clean.bundle};
    });
    if(result.error)throw probeError(result.error);return result;
  }
  async complete(binding,claim,input){
    const result=await this.transaction(async client=>{
      const now=await this.target(client,binding),row=await this.row(client,binding);this.check(row,binding);
      if(row.state!=='refreshing'||Number(row.revision)!==claim.revision||row.lease_id!==claim.leaseId)throw probeError('PROBE_REFRESH_FENCED');
      if(row.lease_until.getTime()<=now)return this.recover(client,binding,row,'REFRESH_LEASE_EXPIRED');
      const clean=validateProbeBundle(input,{now,minValidityMs:probeSessionPolicy.refreshedValidityMs});
      if(clean.bundle.auth.userId!==row.auth_user_id||clean.bundle.auth.sessionId!==row.auth_session_id)throw probeError('PROBE_CANARY_IDENTITY_CHANGED');
      const revision=Number(row.revision)+1,envelope=this.keyring.seal(clean.bundle,context(binding,revision));
      const after=(await client.query(`UPDATE roomqc_control.probe_credentials SET revision=$2,state='ready',envelope=$3::jsonb,
        auth_expires_at=$4,probe_expires_at=$5,lease_id=NULL,lease_until=NULL,reason_code=NULL,updated_at=clock_timestamp()
        WHERE cluster_id=$1 RETURNING *`,[binding.clusterId,revision,JSON.stringify(envelope),clean.authExpiresAt,clean.probeExpiresAt])).rows[0];
      await this.audit(client,binding,row,after,'probe_refresh_completed');return {kind:'ready',revision,bundle:clean.bundle};
    });
    if(result.error)throw probeError(result.error);return result;
  }
  async fail(binding,claim){
    return this.transaction(async client=>{
      await this.target(client,binding);const row=await this.row(client,binding);this.check(row,binding);
      if(row.state!=='refreshing'||Number(row.revision)!==claim.revision||row.lease_id!==claim.leaseId)throw probeError('PROBE_REFRESH_FENCED');
      await this.recover(client,binding,row,'REFRESH_UNCERTAIN');
    });
  }
  async assertCurrent(binding,revision){
    return this.transaction(async client=>{
      const now=await this.target(client,binding),row=await this.row(client,binding);this.check(row,binding);
      if(row.state!=='ready'||Number(row.revision)!==revision||row.auth_expires_at.getTime()<=now+probeSessionPolicy.minimumValidityMs
        ||row.probe_expires_at.getTime()<=now+probeSessionPolicy.minimumValidityMs)throw probeError('PROBE_RESULT_FENCED');
    });
  }
}
