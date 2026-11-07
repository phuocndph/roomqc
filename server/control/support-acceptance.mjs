// Auth-side acceptance component. A receipt is scoped evidence, not a bearer
// credential, a directory result or proof that the command has committed.
import {ControlError,uuidPattern} from './errors.mjs';
export const supportAcceptanceOperations=Object.freeze(['cluster_command','register_cluster','acknowledge_alert','recheck_workspace','reconcile_workspace']);
const hash=/^[a-f0-9]{64}$/,target=/^[a-z0-9][a-z0-9-]{1,47}$/;
const fail=()=>new ControlError(503,'SUPPORT_ACCEPTANCE_INVALID','Chưa xác nhận được biên nhận quyền cho lệnh. Giữ nguyên mã lệnh để đối soát.');
export function supportAcceptanceContext(actor,scope){
 if(typeof actor?.id!=='string'||!uuidPattern.test(actor.id)||typeof actor.clusterId!=='string'||!scope||Array.isArray(scope)
  ||Object.keys(scope).sort().join(',')!=='attemptId,audience,key,operation,payloadHash,target'
  ||!['attemptId','audience','key','operation','payloadHash','target'].every(key=>typeof scope[key]==='string')
  ||!uuidPattern.test(scope.attemptId??'')||!uuidPattern.test(scope.audience??'')||!uuidPattern.test(scope.key??'')
  ||!supportAcceptanceOperations.includes(scope.operation)||!target.test(scope.target??'')||!hash.test(scope.payloadHash??''))throw fail();
 return Object.freeze({actorId:actor.id.toLowerCase(),authorityClusterId:actor.clusterId,attemptId:scope.attemptId.toLowerCase(),audience:scope.audience.toLowerCase(),
  operation:scope.operation,target:scope.target,key:scope.key,payloadHash:scope.payloadHash});
}
export function supportAcceptanceReceipt(value,context,sessionId){
 if(!value||Array.isArray(value)||value.protocolVersion!==1||typeof value.acceptanceId!=='string'||!uuidPattern.test(value.acceptanceId)
  ||typeof sessionId!=='string'||!uuidPattern.test(sessionId)
  ||value.actorId!==context.actorId||value.sessionId!==sessionId||value.attemptId!==context.attemptId||value.audience!==context.audience
  ||value.operation!==context.operation||value.target!==context.target||value.requestKey!==context.key||value.payloadSha256!==context.payloadHash
  ||!Number.isSafeInteger(value.acceptedAtMs)||value.acceptedAtMs<=0||!Number.isSafeInteger(value.observedAtMs)||!Number.isSafeInteger(value.expiresAtMs)
  ||value.observedAtMs<value.acceptedAtMs||value.observedAtMs>=value.expiresAtMs
  ||value.expiresAtMs<=value.acceptedAtMs||value.expiresAtMs-value.acceptedAtMs>5000)throw fail();
 return Object.freeze(Object.fromEntries(['protocolVersion','acceptanceId','actorId','sessionId','attemptId','audience','operation','target','requestKey',
  'payloadSha256','acceptedAtMs','observedAtMs','expiresAtMs'].map(key=>[key,value[key]])));
}
