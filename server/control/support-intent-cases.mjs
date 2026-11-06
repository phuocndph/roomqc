// Scoped PostgreSQL evidence for the journal/fence, using an explicit receipt
// double. These tests do NOT prove canonical Auth expiry or HTTP recovery.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {ControlError} from './errors.mjs';
import {supportIntentTransaction,recordSupportIntentResult,supportIntentContext} from './support-intents.mjs';

export function registerSupportIntentCases({dbtest,database,password,cluster,pools,run}){
 let number=0;
 async function fixture(t,{through}={}){
  const name='support_intent_'+(++number),{pool,url}=await database(name);
  const owned=[pool];
  t.after(async()=>{
   await Promise.allSettled(owned.map(p=>p.end()));
   for(const p of owned){const at=pools.indexOf(p);if(at>=0)pools.splice(at,1)}
  });
  if(through){
   const manifest=await migrationManifest(),index=manifest.findIndex(item=>item.version===through);assert(index>=0);
   const root=await mkdtemp(join(tmpdir(),'roomqc-support-intent-upgrade-'));
   t.after(()=>rm(root,{recursive:true,force:true}));
   for(const migration of manifest.slice(0,index+1))await writeFile(join(root,migration.version),migration.sql);
   await migrateDirectory(pool,{location:pathToFileURL(root+sep)});
  }else await migrateDirectory(pool);
  await importInitialRegistry(pool,[cluster]);
  const role=name+'_'+run;await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const target=new URL(url);target.username=role;
  const api=new pg.Pool({connectionString:target.href,max:1,connectionTimeoutMillis:3000,statement_timeout:10000});pools.push(api);
  owned.push(api);return {pool,api,url:target.href,role,owned};
 }
 const input=()=>({actor:{id:randomUUID(),clusterId:cluster.id},sessionId:randomUUID(),initialAttemptId:randomUUID(),
  command:{kind:'control',operation:'close_admission',acceptanceOperation:'cluster_command',target:cluster.id,key:randomUUID(),payloadHash:'a'.repeat(64)}});
 async function state(pool){return Object.fromEntries(await Promise.all(['support_command_intents','support_command_attempts',
  'support_attempt_closures','support_intent_results','support_command_acceptances','control_commands','cluster_events'].map(async table=>
   [table,(await pool.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+table+' t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.row)])))}
 function operation(f,i,{verifyAuthority=async()=>{},mutateHook=async()=>{},commitHook=async()=>{}}={}){
  return supportIntentTransaction(f.api,{...i,verifyAuthority,
   lookup:async client=>{
    const r=(await client.query(`SELECT id,result,payload_hash FROM roomqc_control.control_commands
     WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3`,[i.actor.id,i.command.operation,i.command.key])).rows[0];
    if(!r)return null;if(r.payload_hash!==i.command.payloadHash)throw new ControlError(409,'IDEMPOTENCY_CONFLICT','Owned conflict');
    return {commandId:r.id,...r.result};
   },mutate:async(client,a)=>{
    const id=randomUUID(),result={status:'succeeded',owned:true};
    await client.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,
     payload_hash,expected_version,reason,status,result,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,'Owned intent fixture','succeeded',$8::jsonb,clock_timestamp())`,
    [id,i.actor.id,i.actor.clusterId,i.command.operation,i.command.target,i.command.key,i.command.payloadHash,JSON.stringify(result)]);
    await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,actor_id,source,request_id,command_id)
     VALUES($1,'close_admission',$2,'admin',$3,$4)`,[cluster.id,i.actor.id,randomUUID(),id]);
    await mutateHook(client,a);return {commandId:id,...result};
   },beforeCommit:async(client,a,result)=>{
    await commitHook(client,a,result);
    const acceptanceId=randomUUID(),now=Date.now(),audience=(await client.query('SELECT audience FROM roomqc_control.support_authority_identity')).rows[0].audience;
    await client.query(`INSERT INTO roomqc_control.support_command_acceptances(acceptance_id,protocol_version,audience,actor_id,authority_cluster_id,
     session_id,attempt_id,operation,target,request_key,payload_hash,accepted_at_ms,observed_at_ms,expires_at_ms,control_command_id)
     VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13)`,
    [acceptanceId,audience,i.actor.id,i.actor.clusterId,a.sessionId,a.attemptId,i.command.acceptanceOperation,i.command.target,
     i.command.key,i.command.payloadHash,now,now+5000,result.commandId]);
    await recordSupportIntentResult(client,{attemptId:a.attemptId,sessionId:a.sessionId,acceptanceId});
   }});
 }
 async function clean(f){
  const r=(await f.api.query('SELECT pg_backend_pid() AS pid')).rows[0];
  assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory'",[r.pid])).rows[0].n,0);
  assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n,0);
 }
 dbtest('support intent: poolMax1 keeps durable identity across rollback and commits exactly one receipt/result on retry',async t=>{
  const f=await fixture(t),i=input();
  await assert.rejects(()=>operation(f,i,{mutateHook:async()=>{throw new ControlError(503,'OWNED_ROLLBACK','Owned failure')}}),{code:'OWNED_ROLLBACK'});
  let s=await state(f.pool);assert.equal(s.support_command_intents.length,1);assert.equal(s.support_command_attempts.length,1);
  for(const t of ['control_commands','cluster_events','support_command_acceptances','support_intent_results'])assert.equal(s[t].length,0);
  const original=s.support_command_attempts[0],result=await operation(f,i);s=await state(f.pool);
  assert.equal(s.support_command_attempts.length,1);assert.equal(s.support_command_attempts[0].attempt_id,original.attempt_id);
  for(const t of ['control_commands','cluster_events','support_command_acceptances','support_intent_results'])assert.equal(s[t].length,1);
  for(let n=0;n<3;n++)assert.deepEqual(await operation(f,i),result);
  assert.deepEqual(await state(f.pool),s);await clean(f);
 });
 dbtest('support intent: explicit expiry double closes no-effect predecessor and persists a new linked round before one effect',async t=>{
  const f=await fixture(t),i=input();let calls=0;
  const result=await operation(f,i,{commitHook:async()=>{if(++calls===1)throw new ControlError(503,'SUPPORT_ACCEPTANCE_EXPIRED','Owned expiry double')}});
  assert.equal(result.status,'succeeded');const s=await state(f.pool);
  assert.equal(s.support_command_attempts.length,2);assert.equal(s.support_attempt_closures.length,1);assert.equal(s.support_intent_results.length,1);
  const a=s.support_command_attempts.sort((a,b)=>a.generation-b.generation);
  assert.equal(a[0].attempt_id,i.initialAttemptId);assert.equal(a[1].previous_generation,0);assert.notEqual(a[1].attempt_id,a[0].attempt_id);
  assert.equal(s.support_command_acceptances[0].attempt_id,a[1].attempt_id);assert.equal(s.control_commands.length,1);assert.equal(s.cluster_events.length,1);
  await clean(f);
 });
 dbtest('support intent: generic network503 never rotates and changed body or target keeps the original namespace conflict',async t=>{
  const f=await fixture(t),i=input();
  await assert.rejects(()=>operation(f,i,{commitHook:async()=>{throw new ControlError(503,'CLUSTER_UNAVAILABLE','Owned transport unknown')}}),{code:'CLUSTER_UNAVAILABLE'});
  const before=await state(f.pool);assert.equal(before.support_command_attempts.length,1);assert.equal(before.support_attempt_closures.length,0);
  for(const patch of [{payloadHash:'b'.repeat(64)},{target:'different-target'}])
   await assert.rejects(()=>operation(f,{...i,command:{...i.command,...patch}}),{code:'IDEMPOTENCY_CONFLICT'});
  assert.deepEqual(await state(f.pool),before);await operation(f,i);await clean(f);
 });
 dbtest('support intent: two API pools serialize the same key and the loser replays without adding another round or effect',async t=>{
  const f=await fixture(t),i=input(),second=new pg.Pool({connectionString:f.url,max:1,connectionTimeoutMillis:3000});pools.push(second);f.owned.push(second);
  let resume,entered;const inside=new Promise(r=>entered=r),pause=new Promise(r=>resume=r);
  const first=operation(f,i,{mutateHook:async()=>{entered();await pause}}).then(value=>({value}),error=>({error}));
  await inside;
  let other;
  try{
   other=operation({...f,api:second},i).then(value=>({value}),error=>({error}));
   let waiting=false;
   for(let n=0;n<100;n++){
    waiting=(await f.pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
     WHERE a.datname=current_database() AND a.usename=$1 AND l.locktype='advisory' AND NOT l.granted) AS yes`,[f.role])).rows[0].yes;
    if(waiting)break;await new Promise(r=>setTimeout(r,10));
   }assert.equal(waiting,true,'Actual PostgreSQL same-key waiter required');
  }finally{resume()}
  const [a,b]=await Promise.all([first,other]);assert.equal(a.error,undefined);assert.equal(b.error,undefined);assert.deepEqual(a.value,b.value);
  const s=await state(f.pool);assert.equal(s.control_commands.length,1);assert.equal(s.support_command_attempts.length,1);await clean(f);
 });
 dbtest('support intent: API history is append-only and committed effects cannot be closed or assigned a recovery generation',async t=>{
  const f=await fixture(t),i=input();await operation(f,i);const s=await state(f.pool),a=s.support_command_attempts[0];
  for(const table of ['support_command_intents','support_command_attempts','support_attempt_closures','support_intent_results'])
   for(const verb of ['UPDATE '+table+' SET '+(table==='support_command_intents'?'target=target':table==='support_command_attempts'?'session_id=session_id':table==='support_attempt_closures'?'reason=reason':'acceptance_id=acceptance_id'),
    'DELETE FROM '+table,'TRUNCATE '+table]){
    const sql=verb.replace(table,'roomqc_control.'+table);await assert.rejects(()=>f.api.query(sql),{code:'42501'});
   }
  await assert.rejects(()=>f.api.query("INSERT INTO roomqc_control.support_attempt_closures(intent_id,generation,reason) VALUES($1,0,'acceptance_expired_no_effect')",[a.intent_id]),{code:'42501'});
  await assert.rejects(()=>f.api.query('INSERT INTO roomqc_control.support_command_attempts(intent_id,generation,attempt_id,session_id,previous_generation) VALUES($1,1,$2,$3,0)',[a.intent_id,randomUUID(),i.sessionId]),{code:'42501'});
  assert.deepEqual(await state(f.pool),s);await clean(f);
 });
 dbtest('support intent: old writer receipt is fenced after closure and current round can recover the same original key',async t=>{
  const f=await fixture(t),i=input();let calls=0;
  await assert.rejects(()=>operation(f,i,{commitHook:async()=>{if(++calls===1)throw new ControlError(503,'SUPPORT_ACCEPTANCE_EXPIRED','Owned expiry double');
   throw new ControlError(503,'CLUSTER_UNAVAILABLE','Owned second round unknown')}}),{code:'CLUSTER_UNAVAILABLE'});
  const before=await state(f.pool),old=before.support_command_attempts.find(a=>a.generation===0),client=await f.api.connect();
  try{
   await client.query('BEGIN');const parent=randomUUID(),audience=(await client.query('SELECT audience FROM roomqc_control.support_authority_identity')).rows[0].audience;
   await client.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,
    payload_hash,expected_version,reason,status,result,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,'Owned old writer','succeeded','{}',clock_timestamp())`,
   [parent,i.actor.id,i.actor.clusterId,i.command.operation,i.command.target,i.command.key,i.command.payloadHash]);
   await assert.rejects(()=>client.query(`INSERT INTO roomqc_control.support_command_acceptances(acceptance_id,protocol_version,audience,actor_id,authority_cluster_id,
    session_id,attempt_id,operation,target,request_key,payload_hash,accepted_at_ms,observed_at_ms,expires_at_ms,control_command_id)
    VALUES($1,1,$2,$3,$4,$5,$6,'cluster_command',$7,$8,$9,1000,1001,6000,$10)`,
   [randomUUID(),audience,i.actor.id,i.actor.clusterId,old.session_id,old.attempt_id,i.command.target,i.command.key,i.command.payloadHash,parent]),{code:'42501'});
  }finally{await client.query('ROLLBACK');client.release()}
  assert.deepEqual(await state(f.pool),before);await operation(f,i);const after=await state(f.pool);
  assert.equal(after.control_commands.length,1);assert.equal(after.support_command_attempts.length,2);await clean(f);
 });
 dbtest('support intent: current authority denial cannot open a session recovery round; verified session change keeps predecessor history',async t=>{
  const f=await fixture(t),i=input();
  await assert.rejects(()=>operation(f,i,{mutateHook:async()=>{throw new ControlError(503,'OWNED_STOP','Owned stop')}}),{code:'OWNED_STOP'});
  const before=await state(f.pool),next={...i,sessionId:randomUUID()};
  await assert.rejects(()=>operation(f,next,{verifyAuthority:async()=>{throw new ControlError(403,'OWNED_REVOKED','Owned live denial')}}),{code:'OWNED_REVOKED'});
  assert.deepEqual(await state(f.pool),before);await operation(f,next);const s=await state(f.pool);
  assert.equal(s.support_command_attempts.length,2);assert.equal(s.support_attempt_closures[0].reason,'session_reauthorized_no_effect');
  assert.equal(s.support_command_acceptances[0].session_id,next.sessionId);await clean(f);
 });
 dbtest('support intent: terminating a real backend releases its session fence while the durable intent survives for same-key recovery',async t=>{
  const f=await fixture(t),i=input();let entered;const inside=new Promise(r=>entered=r);
  const pending=operation(f,i,{mutateHook:async client=>{const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   entered(pid);await client.query('SELECT pg_sleep(10)')}}).then(value=>({value}),error=>({error}));
  const pid=await inside;assert.equal((await f.pool.query('SELECT pg_terminate_backend($1) AS done',[pid])).rows[0].done,true);
  assert.ok((await pending).error);const before=await state(f.pool);
  assert.equal(before.support_command_intents.length,1);assert.equal(before.control_commands.length,0);
  await operation(f,i);const s=await state(f.pool);assert.equal(s.control_commands.length,1);assert.equal(s.support_command_attempts.length,1);await clean(f);
 });
 dbtest('support intent: migration adopts populated20 without inventing intent rows or changing existing command history',async t=>{
  // Build the genuine predecessor instead of deleting objects from a newer
  // schema whose deployment triggers also depend on the journal functions.
  const {pool}=await fixture(t,{through:'0020-support-command-acceptances.sql'}),manifest=await migrationManifest();
  const index=manifest.findIndex(item=>item.version==='0021-support-command-intents.sql');assert.equal(index,20);
  const history=(await pool.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version')).rows;
  const actor=randomUUID(),key=randomUUID(),id=randomUUID();
  await pool.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,
   payload_hash,expected_version,reason,status,result,finished_at) VALUES($1,$2,$3,'close_admission',$3,$4,$5,1,'Owned historical command','succeeded','{"historical":true}',clock_timestamp())`,
  [id,actor,cluster.id,key,'c'.repeat(64)]);
  const before=(await pool.query('SELECT to_jsonb(t) AS row FROM roomqc_control.control_commands t')).rows;
  assert.deepEqual((await migrateDirectory(pool)).applied,manifest.slice(index).map(item=>item.version));
  assert.deepEqual((await pool.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version LIMIT 20')).rows,history);
  assert.deepEqual((await pool.query('SELECT to_jsonb(t) AS row FROM roomqc_control.control_commands t')).rows,before);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM roomqc_control.support_command_intents')).rows[0].n,0);
  assert.equal((await migrateDirectory(pool)).applied.length,0);
 });
}
