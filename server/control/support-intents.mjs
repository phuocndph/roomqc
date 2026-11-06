// Transaction coordinator for durable same-key recovery. Not a source of Auth
// authority: verifyAuthority and beforeCommit must use the canonical gateway.
// One checked-out connection holds the fence across journal and effect commits.
import {createHash,randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {supportAcceptanceOperations} from './support-acceptance.mjs';

const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const invalid=()=>new ControlError(503,'SUPPORT_INTENT_INVALID','Chưa xác nhận được mã lệnh phục hồi. Giữ nguyên mã lệnh để đối soát.');
const conflict=()=>new ControlError(409,'IDEMPOTENCY_CONFLICT','Mã lệnh đã được dùng cho nội dung hoặc phạm vi khác.');
const exhausted=()=>new ControlError(409,'SUPPORT_INTENT_NEEDS_REVIEW','Lệnh cần được hỗ trợ đối soát. Giữ nguyên mã lệnh.');
const contexts=new WeakMap();
export function supportIntentContext(actor,sessionId,command){
 if(typeof actor?.id!=='string'||!uuidPattern.test(actor.id)||typeof actor.clusterId!=='string'||!(/^[a-z][a-z0-9-]{1,39}$/).test(actor.clusterId)
  ||typeof sessionId!=='string'||!uuidPattern.test(sessionId)||!command||Array.isArray(command)
  ||Object.keys(command).sort().join(',')!=='acceptanceOperation,key,kind,operation,payloadHash,target'
  ||!Object.values(command).every(v=>typeof v==='string')
  ||!['control','recheck','support'].includes(command.kind)||!(/^[a-z][a-z0-9_]{1,63}$/).test(command.operation??'')
  ||!supportAcceptanceOperations.includes(command.acceptanceOperation)||!(/^[a-z0-9][a-z0-9-]{1,47}$/).test(command.target??'')
  ||typeof command.key!=='string'||!uuidPattern.test(command.key)||!(/^[a-f0-9]{64}$/).test(command.payloadHash??''))throw invalid();
 if(command.kind==='control'&&!['cluster_command','register_cluster','acknowledge_alert'].includes(command.acceptanceOperation)
  ||command.kind==='recheck'&&(command.operation!=='recheck'||command.acceptanceOperation!=='recheck_workspace')
  ||command.kind==='support'&&(command.operation!=='reconcile'||command.acceptanceOperation!=='reconcile_workspace'))throw invalid();
 const identity=[command.kind,actor.id.toLowerCase(),command.operation,
  ...(command.kind==='control'?[]:[actor.clusterId,command.target]),command.key];
 return Object.freeze({...command,actorId:actor.id.toLowerCase(),authorityClusterId:actor.clusterId,sessionId:sessionId.toLowerCase(),namespaceKey:digest(identity)});
}
async function begin(client){
 await client.query('BEGIN');
 await client.query("SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='5s';SET LOCAL idle_in_transaction_session_timeout='6s'");
}
async function lockCommand(client,c){
 if(c.kind==='recheck'){
  await client.query('SELECT pg_advisory_xact_lock_shared(727001)');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,727005))',[
   JSON.stringify([c.actorId,c.authorityClusterId,'recheck',c.target,c.key])]);
 }else await client.query('SELECT pg_advisory_xact_lock(727001)');
}
async function prepare(client,c,initialAttemptId,renew){
 let row=(await client.query('SELECT * FROM roomqc_control.support_command_intents WHERE namespace_key=$1 FOR UPDATE',[c.namespaceKey])).rows[0];
 if(!row){
  if(renew)throw invalid();
  row=(await client.query(`INSERT INTO roomqc_control.support_command_intents
   (id,namespace_key,kind,actor_id,authority_cluster_id,operation,acceptance_operation,target,request_key,payload_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
  [randomUUID(),c.namespaceKey,c.kind,c.actorId,c.authorityClusterId,c.operation,c.acceptanceOperation,c.target,c.key,c.payloadHash])).rows[0];
 }
 for(const [column,key]of Object.entries({kind:'kind',actor_id:'actorId',authority_cluster_id:'authorityClusterId',operation:'operation',
  acceptance_operation:'acceptanceOperation',target:'target',request_key:'key',payload_hash:'payloadHash'}))if(row[column]!==c[key])throw conflict();
 let attempt=(await client.query('SELECT * FROM roomqc_control.support_command_attempts WHERE intent_id=$1 ORDER BY generation DESC LIMIT 1',[row.id])).rows[0];
 if(!attempt){
  if(renew)throw invalid();
  attempt=(await client.query(`INSERT INTO roomqc_control.support_command_attempts(intent_id,generation,attempt_id,session_id)
   VALUES($1,0,$2,$3) RETURNING *`,[row.id,initialAttemptId,c.sessionId])).rows[0];
 }else if(renew||attempt.session_id!==c.sessionId){
  if(renew&&(renew.intentId!==row.id||renew.generation!==attempt.generation||renew.attemptId!==attempt.attempt_id))throw invalid();
  if(attempt.generation>=127)throw exhausted();
  // The SQL closure guard independently rejects any committed parent/effect,
  // result or consumption; its row lock also fences in-flight old consumers.
  await client.query(`INSERT INTO roomqc_control.support_attempt_closures(intent_id,generation,reason) VALUES($1,$2,$3)`,
   [row.id,attempt.generation,renew?'acceptance_expired_no_effect':'session_reauthorized_no_effect']);
  attempt=(await client.query(`INSERT INTO roomqc_control.support_command_attempts(intent_id,generation,attempt_id,session_id,previous_generation)
   VALUES($1,$2,$3,$4,$5) RETURNING *`,[row.id,attempt.generation+1,randomUUID(),c.sessionId,attempt.generation])).rows[0];
 }
 return Object.freeze({intentId:row.id,generation:attempt.generation,attemptId:attempt.attempt_id,sessionId:attempt.session_id,context:c});
}
export function currentSupportIntent(client){return contexts.get(client)??null}
export async function recordSupportIntentResult(client,acceptance){
 const a=currentSupportIntent(client);if(!a)return;
 if(acceptance.attemptId!==a.attemptId||acceptance.sessionId!==a.sessionId)throw invalid();
 await client.query('INSERT INTO roomqc_control.support_intent_results(intent_id,generation,acceptance_id) VALUES($1,$2,$3)',
  [a.intentId,a.generation,acceptance.acceptanceId]);
}
export async function supportIntentTransaction(pool,{actor,sessionId,command,initialAttemptId,verifyAuthority,lookup,mutate,beforeCommit}){
 const c=supportIntentContext(actor,sessionId,command);
 if(typeof initialAttemptId!=='string'||!uuidPattern.test(initialAttemptId)||![verifyAuthority,lookup,mutate,beforeCommit].every(v=>typeof v==='function'))throw invalid();
 await verifyAuthority();
 const client=await pool.connect();let locked=false,broken=false;
 // A terminated checked-out backend can emit 'error' after its query rejects,
 // before ROLLBACK runs. Own that event and destroy the session on release.
 const onError=()=>{broken=true};client.on('error',onError);
 const rollback=async()=>{if(broken)return;try{await client.query('ROLLBACK')}catch{broken=true}};
 try{
  await begin(client);
  // If acquiring the fence loses its response, still attempt scoped unlock
  // (or destroy the client) rather than returning an uncertain session.
  locked=true;await client.query('SELECT pg_advisory_lock(hashtextextended($1,727006))',[c.namespaceKey]);
  await client.query('COMMIT');
  let renew=null;
  // One recovery round per HTTP request. Another expiry remains a stable,
  // inspectable intent; never spin indefinitely or retry a generic503.
  for(let round=0;round<2;round++){
   await begin(client);await lockCommand(client,c);await verifyAuthority();
   const prior=await lookup(client);
   if(prior!==null&&prior!==undefined){await verifyAuthority();await client.query('COMMIT');return prior}
   const attempt=await prepare(client,c,initialAttemptId,renew);
   await client.query('COMMIT'); // Durable before any Auth acceptance/effect.
   try{
    await begin(client);await lockCommand(client,c);await verifyAuthority();
    const replay=await lookup(client);
    if(replay!==null&&replay!==undefined){await verifyAuthority();await client.query('COMMIT');return replay}
    contexts.set(client,attempt);
    const result=await mutate(client,attempt);
    // beforeCommit acquires/records the scoped Auth receipt in this transaction
    // and may return a final synchronous TTL/fence check. The coordinator owns
    // COMMIT; callbacks must never leave an open transaction in the pool.
    const validate=await beforeCommit(client,attempt,result);
    if(!(await client.query('SELECT 1 FROM roomqc_control.support_intent_results WHERE intent_id=$1 AND generation=$2',
     [attempt.intentId,attempt.generation])).rowCount)
     throw new ControlError(503,'SUPPORT_INTENT_RESULT_REQUIRED','Chưa xác nhận được kết quả lệnh. Giữ nguyên mã lệnh để đối soát.');
    if(validate!==undefined){if(typeof validate!=='function')throw invalid();if(validate()?.then)throw invalid()}
    if(broken)throw new ControlError(503,'SUPPORT_INTENT_UNAVAILABLE','Mất kết nối khi đối soát. Giữ nguyên mã lệnh.');
    await client.query('COMMIT');return result;
   }catch(error){
    await rollback();contexts.delete(client);
    if(!broken&&error instanceof ControlError&&error.code==='SUPPORT_ACCEPTANCE_EXPIRED'&&round===0){renew=attempt;continue}
    throw error;
   }finally{contexts.delete(client)}
  }
  throw exhausted();
 }catch(error){await rollback();throw error}
 finally{
  contexts.delete(client);
  if(locked&&!broken){
   try{const r=await client.query('SELECT pg_advisory_unlock(hashtextextended($1,727006)) AS unlocked',[c.namespaceKey]);
    if(r.rows[0]?.unlocked!==true)broken=true;
   }catch{broken=true}
  }
  // Never return a session with an uncertain fence/transaction to the pool.
  client.release(broken);client.removeListener('error',onError);
 }
}
