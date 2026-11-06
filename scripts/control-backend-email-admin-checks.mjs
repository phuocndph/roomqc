// Exact-owned Docker only. The real Edge handler uses this fixed-origin relay
// to pause a service request AFTER caller preflight. No production test hooks.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_EMAIL_ADMIN_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
const origin='http://127.0.0.1:8000',checks=[],races=[];let phase='fixtures',barrier;
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'email_admin_checks_failed',phase,checks,races})+'\n'));
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:4,statement_timeout:10000,connectionTimeoutMillis:5000,application_name:'owned-email-admin-'+input.run});
const server=createServer(async(req,res)=>{
  try{
    assert.ok(req.url.startsWith('/auth/v1/')||req.url.startsWith('/rest/v1/'));
    const parts=[];let size=0;for await(const part of req){size+=part.length;assert.ok(size<=65536);parts.push(part)}
    const body=Buffer.concat(parts),current=barrier,path=req.url.split('?')[0];
    const service=req.headers.authorization==='Bearer '+input.serviceKey;
    const paths=current?.action==='status'?['/rest/v1/email_deliveries','/rest/v1/email_send_state']:
      ['/rest/v1/rpc/'+(current?.action==='retry'?'retry_roomqc_email':'enqueue_roomqc_email')];
    if(current&&service&&(paths.includes(path)||path==='/rest/v1/rpc/execute_email_admin_action')){
      current.hits++;current.hit();await current.release;
    }
    const headers={...req.headers};delete headers.host;delete headers['content-length'];delete headers.connection;
    const upstream=await fetch(origin+req.url,{method:req.method,headers,signal:AbortSignal.timeout(10000),
      ...(['GET','HEAD'].includes(req.method)?{}:{body})});
    res.statusCode=upstream.status;
    for(const [key,value]of upstream.headers)if(!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end('{"error":"FIXTURE_RELAY_FAILED"}')}
});
async function bounded(promise,milliseconds=10000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Fixture synchronization timeout')),milliseconds)})])}finally{clearTimeout(timer)}}
function arm(action){let hit,release;const hitPromise=new Promise(r=>{hit=r}),released=new Promise(r=>{release=r});
  barrier={action,hits:0,hit,release:released,unpause:release};return {...barrier,reached:hitPromise};}
async function request(path,token,body,method=body===undefined?'GET':'POST'){
  const r=await fetch(origin+path,{method,signal:AbortSignal.timeout(10000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await r.json()}catch{data=null}return {status:r.status,data};
}
async function login(user){const r=await request('/auth/v1/token?grant_type=password',input.publishableKey,{email:user.email,password:user.password});
  assert.equal(r.status,200);user.token=r.data.access_token;user.sessionId=JSON.parse(Buffer.from(user.token.split('.')[1],'base64url')).session_id;}
async function actor(label){
  const email='email-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const r=await request('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(r.status,200);
  const user={id:r.data.id,email,password};await login(user);
  const p=await request('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:user.id,
    p_fields:{fullName:'Owned email fixture',phone:'0901234567',tenantName:'Owned email fixture',hotelName:'Owned email fixture',
      hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:email,totalRooms:3}});
  assert.equal(p.status,200);assert.equal(p.data.success,true);return user;
}
async function edge(user,body,{disabled=false}={}){
  const r=await fetch('http://email-admin-'+(disabled?'test':'race-test')+':9000/',{method:'POST',signal:AbortSignal.timeout(12000),
    headers:{authorization:'Bearer '+(user?.token??input.publishableKey),'content-type':'application/json',Origin:'http://127.0.0.1:8082'},body:JSON.stringify(body)});
  assert.equal(r.headers.get('cache-control'),'no-store');let data;try{data=await r.json()}catch{data=null}return {status:r.status,data};
}
const tables=['public.email_deliveries','public.email_send_state','public.email_send_log','public.email_provider_events',
  'public.email_admin_actions','pgmq.q_transactional_emails','public.tenants','public.hotels','public.tenant_usage','public.audit_log'];
const snapshot=async()=>(await db.query('SELECT jsonb_build_object('+tables.map(t=>"'"+t+"',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+t+' r)').join(',')+') AS hashes')).rows[0].hashes;
async function failedDelivery(){const id=randomUUID();await db.query("INSERT INTO public.email_deliveries(id,event_key,recipient_email,template_name,status,expires_at) VALUES($1,$2,'email-admin@roomqc.invalid','system_test','failed',now()+interval '1 hour')",[id,'owned-retry:'+input.run+':'+id]);return id;}
const same=(a,b,label)=>{assert.deepEqual(b,a,label);checks.push(label)};
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(9080,'0.0.0.0',resolve)});
  const admin=await actor('admin');await db.query('UPDATE public.users SET is_super_admin=true WHERE id=$1',[admin.id]);
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[admin.id])).rows[0].n,0);
  assert.equal((await edge(admin,{action:'status'})).status,200);checks.push('profile-email-admin-without-platform-role-positive');
  phase='preflight-service-session-races';
  for(const action of ['status','retry','test']){
    const body={action,...(action==='retry'?{id:await failedDelivery()}:action==='test'?{email:'email-admin@roomqc.invalid'}:{})};
    const paused=arm(action),pending=edge(admin,body).then(value=>({value}),error=>({error}));
    try{
      await bounded(paused.reached);assert.ok(barrier.hits>=1);
      assert.equal((await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[admin.sessionId,admin.id])).rowCount,1);
      const before=await snapshot();paused.unpause();barrier=null;
      const result=await pending;assert.ifError(result.error);const after=await snapshot();
      const changedTables=tables.filter(t=>before[t]!==after[t]);
      races.push({action,authorityChange:'actual-session-delete-after-preflight',status:result.value.status,
        denied:result.value.status===403,changedTables,noBusinessSideEffects:changedTables.length===0});
    }finally{paused.unpause();barrier=null;await login(admin)}
  }
  process.stderr.write(JSON.stringify({event:'email_admin_preflight_races',races})+'\n');
  assert.ok(races.every(r=>r.denied&&r.noBusinessSideEffects),'All real Edge actions must deny a session revoked after preflight without business effects');
  const retryId=await failedDelivery(),bodyFor=action=>({action,...(action==='retry'?{id:retryId}:action==='test'?{email:'email-admin@roomqc.invalid'}:{})});
  const argsFor=(user,action)=>({p_actor:user.id,p_session:user.sessionId,p_action:action,p_delivery_id:action==='retry'?retryId:null,
    p_recipient:action==='test'?'email-admin@roomqc.invalid':null});
  const rpcAction=(args,token=input.serviceKey)=>request('/rest/v1/rpc/execute_email_admin_action',token,args);
  const denyEdge=(r,label)=>{assert.ok([401,403].includes(r.status),label+' must deny');assert.equal(typeof r.data?.error,'string');
    assert.equal(r.data.logs,undefined);assert.equal(r.data.success,undefined);checks.push(label)};
  const denyRpc=(r,label)=>{assert.ok([401,403].includes(r.status)&&r.data?.code==='42501',label+' must be a permission denial');checks.push(label)};
  phase='live-state-matrix';
  const states=[
    ['unconfirmed','auth.users','email_confirmed_at',null],
    ['banned','auth.users','banned_until',new Date(Date.now()+3600000).toISOString()],
    ['auth-deleted','auth.users','deleted_at',new Date().toISOString()],
    ['profile-deleted','public.users','deleted_at',new Date().toISOString()],
    ['locked','public.users','account_locked',true],
    ['inactive','public.users','status','inactive'],
    ['null-status','public.users','status',null],
    ['email-admin-revoked','public.users','is_super_admin',false],
    ['expired-session','auth.sessions','not_after',new Date(Date.now()-1000).toISOString()]
  ];
  for(const [label,table,key,value]of states){
    const id=table==='auth.sessions'?admin.sessionId:admin.id,old=(await db.query('SELECT '+key+' AS value FROM '+table+' WHERE id=$1',[id])).rows[0];
    assert.ok(old);await db.query('UPDATE '+table+' SET '+key+'=$2 WHERE id=$1',[id,value]);
    try{
      const before=await snapshot();
      for(const action of ['status','retry','test']){
        denyEdge(await edge(admin,bodyFor(action)),label+'-edge-'+action);
        denyRpc(await rpcAction(argsFor(admin,action)),label+'-service-'+action);
      }
      same(before,await snapshot(),label+'-no-side-effects');
    }finally{await db.query('UPDATE '+table+' SET '+key+'=$2 WHERE id=$1',[id,old.value])}
    assert.equal((await edge(admin,{action:'status'})).status,200);checks.push(label+'-restore-positive');
  }
  phase='authority-and-context';
  const other=await actor('role-only');
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[other.id]);
  assert.equal((await db.query('SELECT is_super_admin FROM public.users WHERE id=$1',[other.id])).rows[0].is_super_admin,false);
  for(const action of ['status','retry','test']){
    const before=await snapshot();
    denyEdge(await edge(other,{...bodyFor(action),actor:admin.id,session_id:admin.sessionId}), 'platform-role-only-not-email-'+action);
    denyEdge(await edge(null,bodyFor(action)),'anonymous-'+action);
    denyRpc(await rpcAction(argsFor(admin,action),admin.token),'browser-direct-service-action-'+action);
    denyRpc(await rpcAction(argsFor(admin,action),input.publishableKey),'anonymous-direct-service-action-'+action);
    for(const fields of [{p_session:randomUUID()},{p_session:other.sessionId},{p_actor:other.id},{p_actor:null,p_session:null}]){
      denyRpc(await rpcAction({...argsFor(admin,action),...fields}),'service-invalid-context-'+action);
    }
    same(before,await snapshot(),'authority-context-no-side-effects-'+action);
  }
  assert.equal((await request('/rest/v1/rpc/lock_live_email_administrator',admin.token,{p_actor:admin.id,p_session:admin.sessionId})).status,404);
  checks.push('private-helper-not-browser-endpoint');
  phase='business-contracts';
  let before=await snapshot();
  assert.equal((await edge(admin,{action:'test',email:'outside@roomqc.invalid'})).status,400);
  assert.equal((await edge(admin,{action:'test',email:'email-admin@roomqc.invalid'},{disabled:true})).status,409);
  same(before,await snapshot(),'provider-disabled-and-recipient-allowlist-no-effects');
  const retried=await Promise.all([edge(admin,bodyFor('retry')),edge(admin,bodyFor('retry'))]);
  assert.deepEqual(retried.map(r=>r.status).sort(),[200,409]);checks.push('concurrent-retry-one-success');
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.email_admin_actions WHERE delivery_id=$1',[retryId])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=$1",[retryId])).rows[0].n,1);
  checks.push('retry-one-queue-and-audit');
  before=await snapshot();assert.equal((await edge(admin,bodyFor('retry'))).status,409);
  same(before,await snapshot(),'retry-replay-no-effects');
  // Avoid crossing a real minute boundary in the existing dedupe contract.
  const second=(await db.query("SELECT extract(second FROM clock_timestamp())::float AS s")).rows[0].s;
  if(second>56)await new Promise(resolve=>setTimeout(resolve,Math.ceil((60-second)*1000)+100));
  const tested=await Promise.all([edge(admin,bodyFor('test')),edge(admin,bodyFor('test'))]);
  assert.ok(tested.every(r=>r.status===200&&r.data.success));assert.equal(tested[0].data.id,tested[1].data.id);
  const testId=tested[0].data.id;
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=$1",[testId])).rows[0].n,1);
  checks.push('same-minute-test-deduped-one-queue');
  const state=await edge(admin,{action:'status'});assert.equal(state.status,200);assert.equal(state.data.provider,'resend');
  assert.ok(state.data.logs.length<=100);assert.equal(typeof state.data.queue.pending,'number');checks.push('status-dto-positive-bounded');
  phase='transaction-lock-races';
  async function blockedBy(pid,fragment){
    const end=Date.now()+5000;while(Date.now()<end){
      const rows=await db.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid)) AND query LIKE $2",[pid,'%'+fragment+'%']);
      if(rows.rowCount)return rows.rows[0].pid;await new Promise(resolve=>setTimeout(resolve,20));
    }assert.fail('Expected actual email authority lock overlap');
  }
  for(const action of ['status','retry','test']){
    const paused=arm(action),pending=edge(admin,bodyFor(action)).then(value=>({value}),error=>({error})),writer=await db.connect();
    try{
      await bounded(paused.reached);await writer.query('BEGIN');
      const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await writer.query('UPDATE public.users SET account_locked=true WHERE id=$1',[admin.id]);
      const before=await snapshot();paused.unpause();barrier=null;
      await blockedBy(pid,'execute_email_admin_action');await writer.query('COMMIT');
      const result=await pending;assert.ifError(result.error);denyEdge(result.value,'profile-lock-race-'+action);
      same(before,await snapshot(),'profile-lock-race-no-effects-'+action);
      races.push({action,authorityChange:'profile-lock-after-preflight',denied:true,noBusinessSideEffects:true,actualLockWait:true});
    }finally{paused.unpause();barrier=null;await writer.query('ROLLBACK');writer.release();await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[admin.id])}
  }
  const business=await db.connect(),revoker=await db.connect(),lastRetryId=await failedDelivery();let mutating,revoking;
  try{
    await business.query('BEGIN');const businessPid=(await business.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await business.query('SELECT id FROM public.email_deliveries WHERE id=$1 FOR UPDATE',[lastRetryId]);
    mutating=edge(admin,{action:'retry',id:lastRetryId}).then(value=>({value}),error=>({error}));
    const mutationPid=await blockedBy(businessPid,'execute_email_admin_action');
    await revoker.query('BEGIN');revoking=revoker.query('UPDATE public.users SET account_locked=true WHERE id=$1',[admin.id]).then(()=>({ok:true}),error=>({error}));
    await blockedBy(mutationPid,'UPDATE public.users SET account_locked');
    await business.query('COMMIT');const result=await mutating;assert.ifError(result.error);assert.equal(result.value.status,200);
    const revoked=await revoking;assert.ifError(revoked.error);await revoker.query('COMMIT');
    denyEdge(await edge(admin,{action:'status'}),'mutation-first-next-command-denied');
    races.push({action:'retry',authorityChange:'mutation-first-profile-revoke-waits',mutationCommittedBeforeRevocation:true,nextCommandDenied:true,actualLockWait:true});
  }finally{await business.query('ROLLBACK');await revoker.query('ROLLBACK');business.release();revoker.release();await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[admin.id])}
  process.stdout.write(JSON.stringify({verified:true,checks,races,snapshotTables:tables.length,invalidStates:states.length,
    edgeStateDenials:states.length*3,serviceStateDenials:states.length*3,profileAuthorityNotPlatformRole:true,
    retryConcurrentOneQueueOneAudit:true,testMinuteDedupeVerified:true,providerDelivery:false})+'\n');
}finally{barrier?.unpause();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.end()}
