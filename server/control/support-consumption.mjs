// Auth receipt -> original directory command, in that command's transaction.
// The runtime gateway is trusted; arbitrary HTTP JSON is never a receipt source.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {ControlError,uuidPattern} from './errors.mjs';
import {supportAcceptanceContext,supportAcceptanceReceipt} from './support-acceptance.mjs';
import {currentSupportIntent,recordSupportIntentResult} from './support-intents.mjs';
const fail=()=>new ControlError(503,'SUPPORT_ACCEPTANCE_REQUIRED','Chưa xác nhận được quyền nhận lệnh. Giữ nguyên mã lệnh để đối soát.');
const expired=()=>new ControlError(503,'SUPPORT_ACCEPTANCE_EXPIRED','Biên nhận nhận lệnh đã hết hạn. Giữ nguyên mã lệnh để đối soát.');
const columns=Object.freeze({control:'control_command_id',recheck:'recheck_command_id',support:'support_action_id'});
export function supportAttemptId(actor,command){
  // Stable across network retries; payload is checked by the Auth attempt row,
  // so changing the body never silently creates a fresh acceptance attempt.
  const hex=createHash('sha256').update(JSON.stringify(['support-v1',actor.id,actor.clusterId,
    command.kind,command.operation,command.target,command.key])).digest('hex');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-8'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
export async function consumeSupportAcceptance(client,actor,authorize,command){
  if(typeof authorize?.acceptCommand!=='function'||!command||!Object.hasOwn(columns,command.kind)
    ||typeof command.commandId!=='string'||!uuidPattern.test(command.commandId))throw fail();
  const identity=(await client.query('SELECT audience FROM roomqc_control.support_authority_identity WHERE singleton=true')).rows[0];
  if(!identity||typeof identity.audience!=='string'||!uuidPattern.test(identity.audience))throw fail();
  const prepared=currentSupportIntent(client);
  if(prepared){
    const c=prepared.context;
    if(c.actorId!==actor.id.toLowerCase()||c.authorityClusterId!==actor.clusterId||c.kind!==command.kind
      ||c.acceptanceOperation!==command.operation||c.target!==command.target||c.key!==command.key||c.payloadHash!==command.payloadHash)throw fail();
  }
  const scope={attemptId:prepared?.attemptId??supportAttemptId(actor,command),audience:identity.audience,operation:command.operation,
    target:command.target,key:command.key,payloadHash:command.payloadHash};
  const context=supportAcceptanceContext(actor,scope),started=performance.now();
  let timer,receipt;
  try{receipt=await Promise.race([Promise.resolve().then(()=>authorize.acceptCommand(scope)),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(fail()),5000);
  })])}finally{clearTimeout(timer)}
  const value=supportAcceptanceReceipt(receipt,context,prepared?.sessionId??receipt?.sessionId);
  const remaining=value.expiresAtMs-value.observedAtMs;
  const assertHandoff=()=>{if(performance.now()-started>=remaining)throw expired()};
  assertHandoff();
  await client.query(`INSERT INTO roomqc_control.support_command_acceptances
    (acceptance_id,protocol_version,audience,actor_id,authority_cluster_id,session_id,attempt_id,operation,target,request_key,payload_hash,
      accepted_at_ms,observed_at_ms,expires_at_ms,${columns[command.kind]})
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [value.acceptanceId,value.protocolVersion,value.audience,value.actorId,actor.clusterId,value.sessionId,value.attemptId,
    value.operation,value.target,value.requestKey,value.payloadSha256,value.acceptedAtMs,value.observedAtMs,value.expiresAtMs,command.commandId]);
  await recordSupportIntentResult(client,value);
  assertHandoff();
  // Checked once more immediately before COMMIT by the transaction helper.
  return assertHandoff;
}
