import {ControlError,uuidPattern} from './errors.mjs';
import {releaseApprovalEndpointFingerprint} from './release-approval.mjs';

const fail=(code,status=409)=>new ControlError(status,code,'Phê duyệt triển khai đã thay đổi hoặc chưa có hiệu lực.');
export function releaseApprovalIdentity(approval){
  if(!approval||typeof approval.approvalId!=='string'||!uuidPattern.test(approval.approvalId)
    ||!Number.isSafeInteger(approval.epoch)||approval.epoch<1||typeof approval.envelopeDigest!=='string'
    ||!/^[a-f0-9]{64}$/.test(approval.envelopeDigest))throw fail('RELEASE_APPROVAL_NOT_CURRENT');
  return Object.freeze({approvalId:approval.approvalId,epoch:approval.epoch,envelopeDigest:approval.envelopeDigest});
}
export const sameReleaseApproval=(a,b)=>!!a&&!!b&&a.approvalId===b.approvalId&&a.epoch===b.epoch&&a.envelopeDigest===b.envelopeDigest;
const codes=new Set(['RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT','RELEASE_APPROVAL_BINDING_CHANGED',
  'RELEASE_APPROVAL_VERSION_CONFLICT','RELEASE_APPROVAL_INSTALL_INVALID','RELEASE_APPROVAL_ID_REUSED','RELEASE_APPROVAL_WITHDRAW_INVALID',
  'RELEASE_KEY_WITHDRAWN','RELEASE_KEY_VERSION_CONFLICT','RELEASE_KEY_ALREADY_WITHDRAWN']);
function command(value){
  if(!value||!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<0||value.expectedVersion>Number.MAX_SAFE_INTEGER-2
    ||!uuidPattern.test(value.key??'')||!uuidPattern.test(value.requestId??'')||typeof value.reason!=='string'
    ||value.reason.trim().length<5||value.reason.trim().length>1000)throw fail('RELEASE_APPROVAL_COMMAND_INVALID',400);
  return {...value,reason:value.reason.trim()};
}

// No pool or credential is constructed here. Callers supply their separate,
// bounded installer/API/runtime pool; no service role or signing key is accepted.
export class ReleaseApprovalStore {
  constructor(pool,trust){this.pool=pool;this.trust=trust}
  async transaction(run){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='5s'");
      await client.query('SELECT pg_advisory_xact_lock(727001)');
      const result=await run(client);await client.query('COMMIT');return result;
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      if(codes.has(error.message))throw fail(error.message);
      throw error;
    }finally{client.release()}
  }
  async execute(client,operation,clusterId,input,options){
    const c=command(options);
    return (await client.query('SELECT roomqc_control.release_approval_command($1,$2,$3,$4,$5,$6,$7::jsonb) AS result',
      [operation,clusterId,c.expectedVersion,c.key,c.reason,c.requestId,JSON.stringify(input)])).rows[0].result;
  }
  async install(envelope,context,options){
    // Authenticate the envelope at its signed not-before instant, without
    // extending its lifetime. The SQL command checks CURRENT primary DB time
    // for every new installation. This also permits effect-free replay of an
    // expired command, whose original receipt must remain recoverable.
    const payload=Object.getOwnPropertyDescriptor(envelope??{},'payload')?.value;
    const notBefore=payload&&Object.getOwnPropertyDescriptor(payload,'notBefore')?.value;
    const verified=this.trust.verify(envelope,context,{now:notBefore});
    return this.transaction(client=>this.execute(client,'install',verified.clusterId,verified,options));
  }
  async withdraw(clusterId,approvalId,options){
    if(!uuidPattern.test(approvalId??''))throw fail('RELEASE_APPROVAL_COMMAND_INVALID',400);
    return this.transaction(client=>this.execute(client,'withdraw',clusterId,{approvalId},options));
  }
  async withdrawKey(keyFingerprint,options){
    const c=command(options);
    if(typeof keyFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(keyFingerprint)||c.expectedVersion>1){
      throw fail('RELEASE_APPROVAL_COMMAND_INVALID',400);
    }
    return this.transaction(async client=>(await client.query(
      'SELECT roomqc_control.release_key_withdrawal_command($1,$2,$3,$4,$5) AS result',
      [keyFingerprint,c.expectedVersion,c.key,c.reason,c.requestId])).rows[0].result);
  }
  async receipt(key){
    if(!uuidPattern.test(key??''))throw fail('RELEASE_APPROVAL_COMMAND_INVALID',400);
    const result=(await this.pool.query('SELECT roomqc_control.release_approval_receipt($1) AS result',[key])).rows[0].result;
    if(!result)throw fail('RELEASE_APPROVAL_RESULT_UNKNOWN',404);
    return result;
  }
}

export const releaseAuthoritySelect=`SELECT a.*,r.epoch AS authority_epoch,r.row_version AS authority_version,r.state AS authority_state,
  EXISTS(SELECT 1 FROM roomqc_control.release_key_revocations k WHERE k.key_fingerprint=a.key_fingerprint) AS authority_key_revoked,
  extract(epoch FROM clock_timestamp())*1000 AS authority_now_ms,
  EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
    AND classid=0 AND objid=727001 AND objsubid=1 AND mode='ExclusiveLock' AND granted) AS authority_lock_held
  FROM roomqc_control.release_authority r JOIN roomqc_control.release_approvals a ON a.approval_id=r.approval_id
  JOIN roomqc_control.clusters c ON c.id=r.cluster_id AND c.host_id=a.host_id AND c.inventory_ref=a.inventory_ref
  JOIN roomqc_control.hosts h ON h.id=c.host_id AND h.environment=a.environment
  WHERE r.cluster_id=$1`;

// The caller must hold 727001 in the SAME transaction as the effect. A detached
// read/cache is useful for preflight/UI, but is never permission for a write.
export function releaseAuthorityMatches(row,verified){
  return !!row&&row.authority_state==='active'&&row.authority_key_revoked===false&&Number(row.authority_epoch)===verified.epoch
    &&Number(row.epoch)===verified.epoch&&row.approval_id===verified.approvalId
    &&row.envelope_digest===verified.envelopeDigest&&row.key_fingerprint===verified.keyFingerprint
    &&row.endpoint_fingerprint===verified.endpointFingerprint&&row.expectation_fingerprint===verified.expectationFingerprint
    &&row.cluster_id===verified.clusterId&&row.host_id===verified.hostId&&row.inventory_ref===verified.inventoryRef
    &&row.environment===verified.environment&&row.issuer_id===verified.issuerId&&row.key_id===verified.keyId
    &&Number(row.not_before_ms)===verified.notBefore&&Number(row.expires_at_ms)===verified.expiresAt
    &&Number.isFinite(Number(row.authority_now_ms))&&Number(row.authority_now_ms)>=verified.notBefore&&Number(row.authority_now_ms)<verified.expiresAt;
}
export async function assertReleaseAuthority(client,verified){
  const row=(await client.query(releaseAuthoritySelect,[verified.clusterId])).rows[0];
  if(row?.authority_lock_held!==true||!releaseAuthorityMatches(row,verified)){
    throw fail('RELEASE_APPROVAL_NOT_CURRENT');
  }
  return {approvalId:row.approval_id,envelopeDigest:row.envelope_digest,epoch:Number(row.authority_epoch),version:Number(row.authority_version)};
}
// A health writer receives only a public proof identity, not trust keys or
// credentials. Compare it with durable installer-verified approval and the
// independently reconstructed endpoint/full-release/target binding under727001.
export async function assertHealthReleaseAuthority(client,identity,binding,target){
  const row=(await client.query(releaseAuthoritySelect,[binding.clusterId])).rows[0];
  const now=Number(row?.authority_now_ms);
  if(!row||row.authority_lock_held!==true||row.authority_state!=='active'||row.authority_key_revoked!==false
    ||!sameReleaseApproval(identity,{approvalId:row.approval_id,epoch:Number(row.authority_epoch),envelopeDigest:row.envelope_digest})
    ||Number(row.epoch)!==identity.epoch||row.expectation_fingerprint!==binding.releaseFingerprint
    ||row.cluster_id!==binding.clusterId||row.inventory_ref!==binding.inventoryRef||row.host_id!==target.hostId||row.environment!==target.environment
    ||row.endpoint_fingerprint!==releaseApprovalEndpointFingerprint({url:binding.url,internalUrl:binding.internalUrl,
      approvedAddresses:binding.approvedAddresses,credentialRef:binding.credentialRef})
    ||!Number.isFinite(now)||now<Number(row.not_before_ms)||now>=Number(row.expires_at_ms))throw fail('RELEASE_APPROVAL_NOT_CURRENT');
  return releaseApprovalIdentity(identity);
}
