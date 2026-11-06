// Fresh cross-database checks are bounded observations, not distributed locks.
// statement_timeout does not bound deferred work executed during COMMIT.
// lock_timeout separately bounds lock waits, including a deferred trigger's
// COMMIT lock wait. Neither setting is a distributed revocation fence.
import {performance} from 'node:perf_hooks';
import {ControlError,uuidPattern} from './errors.mjs';
import {consumeSupportAcceptance,supportAttemptId} from './support-consumption.mjs';
import {supportIntentTransaction} from './support-intents.mjs';
export const supportAuthorityTimeoutMs=5000;
export const supportStatementTimeoutMs=5000;
export const supportLockTimeoutMs=5000;
export const supportIdleTransactionTimeoutMs=6000;
export function supportCommandAuthorizer(gateway,actor,token){
 const authorize=()=>gateway.supportActor(token,{timeoutMs:supportAuthorityTimeoutMs});
 authorize.sessionId=()=>{
  if(typeof gateway.supportSessionId!=='function')throw new ControlError(503,'SUPPORT_INTENT_SESSION_REQUIRED','Chưa cấu hình phiên nhận lệnh quản trị.');
  return gateway.supportSessionId(token);
 };
 authorize.acceptCommand=scope=>{
  if(typeof gateway.acceptSupportCommand!=='function')throw new ControlError(503,'SUPPORT_ACCEPTANCE_REQUIRED','Chưa cấu hình giao thức nhận lệnh quản trị.');
  return gateway.acceptSupportCommand(actor,token,scope,{timeoutMs:supportAuthorityTimeoutMs});
 };
 return authorize;
}
export async function assertLiveSupportAuthority(actor,authorize){
 if(typeof authorize!=='function')throw new ControlError(403,'SUPPORT_AUTHORITY_REQUIRED','Cần xác minh quyền quản trị hiện hành.');
 if(!uuidPattern.test(actor?.id??'')||typeof actor.clusterId!=='string')
  throw new ControlError(403,'SUPPORT_ACTOR_CHANGED','Phiên quản trị đã thay đổi.');
 let timer;const started=performance.now();
 try{
  const current=await Promise.race([Promise.resolve().then(authorize),new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(new ControlError(503,'SUPPORT_AUTHORITY_UNAVAILABLE','Chưa xác nhận được quyền quản trị hiện hành.')),supportAuthorityTimeoutMs);
  })]);
  if(performance.now()-started>=supportAuthorityTimeoutMs)
   throw new ControlError(503,'SUPPORT_AUTHORITY_UNAVAILABLE','Chưa xác nhận được quyền quản trị hiện hành.');
  if(current?.id!==actor.id||current?.clusterId!==actor.clusterId)
   throw new ControlError(403,'SUPPORT_ACTOR_CHANGED','Phiên quản trị đã thay đổi.');
  return current;
 }catch(error){
  if(error instanceof ControlError)throw error;
  throw new ControlError(503,'SUPPORT_AUTHORITY_UNAVAILABLE','Chưa xác nhận được quyền quản trị hiện hành.');
 }finally{clearTimeout(timer)}
}
export async function beginSupportTransaction(client){
 await client.query('BEGIN');
 // Transaction-local values never leak into the next pooled request.
 await client.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='6s'");
}
export async function prepareSupportCommit(client,actor,authorize,command=null,verifyCommit=null){
 let assertHandoff=()=>{};
 if(command){
  // Auth serializes acceptance against revocation. A previously accepted exact
  // command may complete after revoke; result reads still check current rights.
  assertHandoff=await consumeSupportAcceptance(client,actor,authorize,command);
 }else await assertLiveSupportAuthority(actor,authorize); // Read-only replay.
 return ()=>{
  assertHandoff();
  if(verifyCommit?.()?.then)throw new ControlError(503,'SUPPORT_COMMIT_CHECK_INVALID','Kiểm tra trước commit phải đồng bộ.');
 };
}
export async function commitSupportTransaction(client,actor,authorize,command=null,verifyCommit=null){
 const validate=await prepareSupportCommit(client,actor,authorize,command,verifyCommit);validate();
 // No new remote check after acceptance: never misreport a committed write.
 await client.query('COMMIT');
}
export async function durableSupportTransaction(pool,actor,authorize,command,{lookup,mutate,verifyCommit}){
 await assertLiveSupportAuthority(actor,authorize);
 if(typeof authorize.sessionId!=='function')throw new ControlError(503,'SUPPORT_INTENT_SESSION_REQUIRED','Chưa xác nhận được phiên nhận lệnh.');
 const sessionId=authorize.sessionId();
 const binding={kind:command.kind,operation:command.operation,acceptanceOperation:command.acceptanceOperation,
  target:command.target,key:command.key,payloadHash:command.payloadHash};
 const result=await supportIntentTransaction(pool,{actor,sessionId,command:binding,
  initialAttemptId:supportAttemptId(actor,{...binding,operation:binding.acceptanceOperation}),
  verifyAuthority:()=>assertLiveSupportAuthority(actor,authorize),
  lookup:async client=>{const value=await lookup(client);return value===null||value===undefined?null:{value}},
  mutate:async(client,attempt)=>({value:await mutate(client,attempt)}),
  beforeCommit:(client,attempt,result)=>prepareSupportCommit(client,actor,authorize,{kind:binding.kind,
   commandId:result.value.commandId,operation:binding.acceptanceOperation,target:binding.target,key:binding.key,payloadHash:binding.payloadHash},
   verifyCommit?()=>verifyCommit(result.value):null)});
 return result.value;
}
export async function authorizedSupportTransaction(pool,actor,authorize,run,acceptanceForResult=null){
 await assertLiveSupportAuthority(actor,authorize);const client=await pool.connect();
 try{
  await beginSupportTransaction(client);await client.query('SELECT pg_advisory_xact_lock(727001)');
  await assertLiveSupportAuthority(actor,authorize);const result=await run(client);
  await commitSupportTransaction(client,actor,authorize,acceptanceForResult?.(result)??null);return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
