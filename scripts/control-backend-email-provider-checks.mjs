// Executed only by the exact-owned full-vendor runner, on its internal network.
// The sink implements the provider's HTTP contract, not real inbox delivery.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_PROVIDER_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.serviceKey&&input.publishableKey&&input.databasePassword);
const origin='http://127.0.0.1:8000',checks=[],races=[],owned=[];
const secret=Buffer.from('owned-provider-webhook-'+input.run),internal='owned-provider-worker-'+input.run;
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,
  max:5,statement_timeout:12000,connectionTimeoutMillis:5000,application_name:'owned-provider-'+input.run});
let phase='fixtures',sinkMode='ok',lostFinish=false,sinkBarrier;
const accepted=new Map(),sinkCalls=new Map();
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'email_provider_checks_failed',phase,checks,races})+'\n'));
const server=createServer(async(req,res)=>{
  try{
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;assert.ok(size<=65536);chunks.push(chunk)}
    const body=Buffer.concat(chunks);
    if(req.url==='/api/v1/send'){
      assert.equal(req.method,'POST');const payload=JSON.parse(body),id=payload.Headers?.['X-RoomQC-Event'];
      assert.ok(owned.includes(id),'Sink may only accept allowlisted fixture delivery IDs');
      assert.ok(payload.To.every(v=>v.Email.endsWith('@roomqc.invalid')));
      sinkCalls.set(id,(sinkCalls.get(id)??0)+1);
      if(sinkBarrier){sinkBarrier.hit();await sinkBarrier.release}
      if(sinkMode==='retry'||sinkMode==='permanent'||sinkMode==='rate-limit'){
        res.writeHead(sinkMode==='retry'?500:sinkMode==='permanent'?422:429,{'content-type':'application/json','retry-after':'1'});
        res.end('{"error":"owned fixture failure"}');return;
      }
      if(!accepted.has(id))accepted.set(id,'provider-'+id);
      if(sinkMode==='drop-accepted-response'){sinkMode='ok';req.socket.destroy();return}
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ID:accepted.get(id)}));return;
    }
    assert.ok(req.url.startsWith('/rest/v1/'),'Relay must stay on the fixed local REST origin');
    const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
    const upstream=await fetch(origin+req.url,{method:req.method,headers,signal:AbortSignal.timeout(15000),
      ...(['GET','HEAD'].includes(req.method)?{}:{body})});
    const bytes=Buffer.from(await upstream.arrayBuffer());
    if(lostFinish&&req.url==='/rest/v1/rpc/finish_email_delivery'&&upstream.ok){
      lostFinish=false;req.socket.destroy();return;
    }
    res.statusCode=upstream.status;
    for(const [key,value]of upstream.headers)if(!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
    res.end(bytes);
  }catch{if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end('{"error":"OWNED_PROVIDER_RELAY"}')}
});
async function request(path,token,body){
  const r=await fetch(origin+path,{method:'POST',headers:{apikey:input.publishableKey,authorization:'Bearer '+token,
    'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  return {status:r.status,data:await r.json()};
}
const rpc=(name,args,token=input.serviceKey)=>request('/rest/v1/rpc/'+name,token,args);
async function webhook(event,{id=randomUUID(),timestamp=Math.floor(Date.now()/1000),key=secret,body,omit=false,tamper=false}={}){
  const raw=body??JSON.stringify(event),headers={'content-type':'application/json'};
  if(!omit)Object.assign(headers,{'svix-id':id,'svix-timestamp':String(timestamp),
    'svix-signature':'v1,'+createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64')});
  const r=await fetch('http://provider-webhook-test:9000/',{method:'POST',headers,body:tamper?raw+' ':raw,signal:AbortSignal.timeout(15000)});
  assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,data:await r.json()};
}
const event=(provider,type='email.delivered')=>({type,data:{email_id:provider}});
const effectTables=['public.email_deliveries','public.email_provider_events','public.suppressed_emails','public.email_send_log',
  'public.email_admin_actions','pgmq.q_transactional_emails'];
const businessTables=['public.users','public.user_roles','public.user_hotels','public.tenants','public.hotels','public.tenant_usage',
  'private.workspace_provisioning','public.audit_log'];
const snapshot=async(tables=effectTables)=>(await db.query('SELECT jsonb_build_object('+tables.map(t=>"'"+t+"',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+t+' r)').join(',')+') AS hashes')).rows[0].hashes;
const same=(before,after,label)=>{assert.deepEqual(after,before,label);checks.push(label)};
async function delivery({provider=randomUUID(),status='accepted'}={}){
  const id=randomUUID();owned.push(id);
  await db.query("INSERT INTO public.email_deliveries(id,event_key,recipient_email,template_name,status,provider_id) VALUES($1,$2,$3,'system_test',$4,$5)",
    [id,'owned-provider:'+input.run+':'+id,id+'@roomqc.invalid',status,provider]);return {id,provider};
}
const row=async id=>(await db.query('SELECT * FROM public.email_deliveries WHERE id=$1',[id])).rows[0];
async function queued(){
  const key='owned-queue:'+input.run+':'+randomUUID(),args={p_event_key:key,p_tenant_id:null,p_recipient:'queue@roomqc.invalid',p_template:'system_test',p_data:{}};
  const r=await rpc('enqueue_roomqc_email',args);assert.equal(r.status,200);owned.push(r.data);
  const replay=await rpc('enqueue_roomqc_email',args);assert.equal(replay.data,r.data);
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=$1",[r.data])).rows[0].n,1);
  return r.data;
}
async function consumer({token,secret:workerSecret=internal}={}){
  const r=await fetch('http://provider-queue-test:9000/',{method:'POST',headers:{'content-type':'application/json',
    ...(token?{authorization:'Bearer '+token}:{}),...(workerSecret?{'x-internal-secret':workerSecret}:{})},body:'{}',signal:AbortSignal.timeout(20000)});
  return {status:r.status,data:await r.json()};
}
async function retryNow(id){
  await db.query('UPDATE public.email_deliveries SET next_attempt_at=clock_timestamp()-interval \'1 second\' WHERE id=$1',[id]);
  const q=(await db.query("SELECT msg_id FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=$1",[id])).rows;
  assert.equal(q.length,1);await db.query("SELECT pgmq.set_vt('transactional_emails',$1,0)",[q[0].msg_id]);
  await db.query('UPDATE public.email_send_state SET retry_after_until=NULL WHERE id=1');
}
async function bounded(promise,ms=5000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned synchronization deadline')),ms)})])}finally{clearTimeout(timer)}}
async function blockedBy(pid,fragment){
  const deadline=Date.now()+6000;while(Date.now()<deadline){
    const r=await db.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid)) AND query LIKE $2",[pid,'%'+fragment+'%']);
    if(r.rowCount)return r.rows[0].pid;await new Promise(r=>setTimeout(r,20));
  }assert.fail('Actual delivery/event lock overlap was not observed');
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(9082,'0.0.0.0',resolve)});
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM pgmq.q_transactional_emails')).rows[0].n,0,'Provider stage must precede other fixture queues');
  // Nonempty business fixture: callback effect allowlist must not rely on empty tables.
  const email='provider-owner-'+input.run+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const user=await request('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(user.status,200);
  const login=await request('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
  const provision=await rpc('provision_workspace_registration',{p_workspace_id:randomUUID(),p_owner_id:user.data.id,
    p_fields:{fullName:'Owned provider',phone:'0901234567',tenantName:'Owned provider',hotelName:'Owned provider',
      hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:email,totalRooms:3}});
  assert.equal(provision.status,200);assert.equal(provision.data.success,true);
  // Remove only this exact-owned initial welcome message, through the product queue RPC.
  const initial=(await db.query("SELECT q.msg_id,d.id FROM pgmq.q_transactional_emails q JOIN public.email_deliveries d ON d.id::text=q.message->>'delivery_id' WHERE d.recipient_email=$1",[email])).rows;
  assert.equal(initial.length,1);owned.push(initial[0].id);
  assert.equal((await rpc('delete_email',{queue_name:'transactional_emails',message_id:Number(initial[0].msg_id)})).status,200);
  await db.query("UPDATE public.email_deliveries SET status='expired' WHERE id=$1",[initial[0].id]);
  for(const table of ['public.users','public.tenants','public.hotels','private.workspace_provisioning'])assert.ok((await db.query('SELECT count(*)::integer AS n FROM '+table)).rows[0].n>0);
  const protectedBefore=await snapshot(businessTables),first=await delivery(),second=await delivery();
  phase='signature-controls';
  for(const [label,options,status]of [
    ['missing-signature',{omit:true},401],['wrong-signature',{key:Buffer.from('wrong fixture key')},401],
    ['tampered-raw-body',{tamper:true},401],['expired-timestamp',{timestamp:Math.floor(Date.now()/1000)-601},401],
    ['future-timestamp',{timestamp:Math.floor(Date.now()/1000)+601},401],['oversize-body',{body:'x'.repeat(65537)},413],
    ['signed-malformed',{body:'{'},400],['signed-invalid-provider',{body:JSON.stringify({type:'email.delivered',data:{}})},400],
    ['signed-empty-provider',{body:JSON.stringify(event(''))},400]
  ]){const before=await snapshot();assert.equal((await webhook(event(first.provider),options)).status,status,label);same(before,await snapshot(),label)}
  let before=await snapshot();const unsupported=await webhook({type:'email.opened',data:{email_id:first.provider}});
  assert.equal(unsupported.status,200);assert.equal(unsupported.data.ignored,true);same(before,await snapshot(),'signed-unsupported');
  phase='immutable-event-reproduction';
  const eventId=randomUUID();assert.equal((await webhook(event(first.provider),{id:eventId})).status,200);
  assert.equal((await row(first.id)).status,'delivered');checks.push('signed-valid');
  // Repro is evaluated before duplicate no-op: old code must reveal a changed second delivery.
  before=await snapshot();let r=await webhook(event(second.provider,'email.bounced'),{id:eventId});
  const changed=(await row(second.id)).status!=='accepted';
  process.stderr.write(JSON.stringify({event:'provider_duplicate_identity_repro',status:r.status,wrongDeliveryChanged:changed})+'\n');
  assert.equal(r.status,409,'Same signed event ID with a different provider must be a conflict');
  same(before,await snapshot(),'same-event-different-provider-no-effects');
  before=await snapshot();assert.equal((await webhook(event(first.provider,'email.complained'),{id:eventId})).status,409);
  same(before,await snapshot(),'same-event-different-type-no-effects');
  before=await snapshot();assert.equal((await webhook(event(first.provider),{id:eventId})).status,200);
  same(before,await snapshot(),'exact-duplicate-no-effects');
  before=await snapshot();assert.equal((await webhook({type:'email.delivered',data:{email_id:first.provider,
    tenant_id:randomUUID(),workspace_id:randomUUID(),role:'owner',plan:'enterprise'}},{id:eventId})).status,200);
  same(before,await snapshot(),'unused-payload-cannot-change-identity-or-business-state');
  before=await snapshot();const replay=await Promise.all(Array.from({length:20},()=>webhook(event(first.provider),{id:eventId})));
  assert.ok(replay.every(v=>v.status===200));same(before,await snapshot(),'twenty-concurrent-exact-duplicates-no-effects');
  phase='event-precedence-and-bind';
  const early=await delivery({provider:null,status:'queued'}),earlyProvider=randomUUID();
  assert.equal((await webhook(event(earlyProvider))).status,200);
  const claim=randomUUID();assert.equal((await rpc('claim_email_delivery',{p_id:early.id,p_claim:claim})).data.length,1);
  assert.equal((await rpc('finish_email_delivery',{p_id:early.id,p_claim:claim,p_queue_id:-1,p_status:'accepted',p_provider_id:earlyProvider})).data,true);
  assert.equal((await row(early.id)).status,'delivered');checks.push('unknown-before-bind');
  for(const type of ['delivered','delivery_delayed','bounced','complained','failed','suppressed']){
    const d=await delivery();assert.equal((await webhook(event(d.provider,'email.'+type))).status,200);
    assert.equal((await row(d.id)).status,type==='delivery_delayed'?'delayed':type);checks.push('event-'+type);
    if(['bounced','complained'].includes(type))assert.ok((await db.query('SELECT reason FROM public.suppressed_emails WHERE email=$1',[(await row(d.id)).recipient_email])).rowCount===1);
  }
  for(const [sequence,expected]of [
    [['delivery_delayed','delivered','delivery_delayed'],'delivered'],[['bounced','delivered','failed','delivery_delayed'],'bounced'],
    [['complained','bounced','suppressed','delivered'],'complained'],[['failed','delivered'],'failed'],[['suppressed','delivered'],'suppressed']
  ]){const d=await delivery();for(const type of sequence)assert.equal((await webhook(event(d.provider,'email.'+type))).status,200);
    assert.equal((await row(d.id)).status,expected)}checks.push('terminal-precedence');
  phase='lock-order';
  const d=await delivery(),locker=await db.connect();let waiting;
  try{
    await locker.query('BEGIN');const pid=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await locker.query('SELECT id FROM public.email_deliveries WHERE id=$1 FOR UPDATE',[d.id]);
    waiting=webhook(event(d.provider));await blockedBy(pid,'record_email_provider_event');
    await locker.query('COMMIT');assert.equal((await waiting).status,200);checks.push('concurrent-delivery-event-lock-order');
  }finally{await locker.query('ROLLBACK');locker.release();if(waiting)await waiting}
  // A finish that is already holding the delivery row and a webhook with the
  // same event must complete in the same delivery -> event order.
  const pending=await delivery({provider:null,status:'queued'}),provider=randomUUID(),eid=randomUUID(),c=randomUUID();
  assert.equal((await webhook(event(provider),{id:eid})).status,200);
  await rpc('claim_email_delivery',{p_id:pending.id,p_claim:c});
  const concurrent=await Promise.all([rpc('finish_email_delivery',{p_id:pending.id,p_claim:c,p_queue_id:-1,p_status:'accepted',p_provider_id:provider}),webhook(event(provider),{id:eid})]);
  assert.equal(concurrent[0].data,true);assert.equal(concurrent[1].status,200);assert.equal((await row(pending.id)).status,'delivered');
  races.push({case:'finish-versus-early-event-replay',deadlock:false,delivery:'delivered'});
  // Force the unknown-provider interleaving: webhook checked binding but has
  // not inserted its event yet; finish tries to bind that provider concurrently.
  phase='unknown-provider-bind-race';
  const bind=await delivery({provider:null,status:'queued'}),bindProvider=randomUUID(),bindEvent=randomUUID(),bindClaim=randomUUID();
  assert.equal((await rpc('claim_email_delivery',{p_id:bind.id,p_claim:bindClaim})).data.length,1);
  const barrierKey=789104221,gate=await db.connect();let callback,binding,bindResult,callbackPid;
  await db.query(`CREATE FUNCTION private.owned_provider_insert_pause() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN IF NEW.event_id='${bindEvent}' THEN PERFORM pg_catalog.pg_advisory_xact_lock(${barrierKey}::bigint); END IF; RETURN NEW; END; $$;
    CREATE TRIGGER owned_provider_insert_pause BEFORE INSERT ON public.email_provider_events
    FOR EACH ROW EXECUTE FUNCTION private.owned_provider_insert_pause();`);
  try{
    await gate.query('BEGIN');const gatePid=(await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await gate.query('SELECT pg_advisory_xact_lock($1::bigint)',[barrierKey]);
    callback=webhook(event(bindProvider),{id:bindEvent});callbackPid=await blockedBy(gatePid,'record_email_provider_event');
    binding=rpc('finish_email_delivery',{p_id:bind.id,p_claim:bindClaim,p_queue_id:-1,p_status:'accepted',p_provider_id:bindProvider})
      .then(result=>{bindResult=result;return result});
    let coordinated=false;const deadline=Date.now()+5000;
    while(Date.now()<deadline&&!bindResult){
      const waiting=await db.query("SELECT pid FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid)) AND query LIKE '%finish_email_delivery%'",[callbackPid]);
      if(waiting.rowCount){coordinated=true;break}await new Promise(resolve=>setTimeout(resolve,20));
    }
    await gate.query('COMMIT');const [finished,called]=await Promise.all([binding,callback]);
    assert.equal(finished.data,true);assert.equal(called.status,200);
    const status=(await row(bind.id)).status;
    process.stderr.write(JSON.stringify({event:'provider_unknown_bind_race',coordinated,status})+'\n');
    assert.equal(status,'delivered','Concurrent early callback must not be stranded by a provider binding commit');
    assert.equal(coordinated,true,'Actual provider-scoped coordination must cover missing binding');
    races.push({case:'unknown-event-versus-provider-bind',actualLockWait:true,coordinated,delivery:status});
    checks.push('unknown-event-bind-race-no-stranded-event');
  }finally{
    await gate.query('ROLLBACK');gate.release();await Promise.allSettled([binding,callback].filter(Boolean));
    await db.query('DROP TRIGGER owned_provider_insert_pause ON public.email_provider_events; DROP FUNCTION private.owned_provider_insert_pause()');
  }
  const finishFirst=await delivery({provider:null,status:'queued'}),finishProvider=randomUUID(),finishClaim=randomUUID(),finishGate=await db.connect();
  assert.equal((await rpc('claim_email_delivery',{p_id:finishFirst.id,p_claim:finishClaim})).data.length,1);
  let firstFinish,lateCallback;
  try{
    await finishGate.query('BEGIN');const pid=(await finishGate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await finishGate.query('SELECT id FROM public.email_deliveries WHERE id=$1 FOR UPDATE',[finishFirst.id]);
    firstFinish=rpc('finish_email_delivery',{p_id:finishFirst.id,p_claim:finishClaim,p_queue_id:-1,p_status:'accepted',p_provider_id:finishProvider});
    const finishPid=await blockedBy(pid,'finish_email_delivery');lateCallback=webhook(event(finishProvider));
    await blockedBy(finishPid,'record_email_provider_event');await finishGate.query('COMMIT');
    assert.equal((await firstFinish).data,true);assert.equal((await lateCallback).status,200);assert.equal((await row(finishFirst.id)).status,'delivered');
    races.push({case:'provider-bind-first-callback-waits',actualLockWait:true,delivery:'delivered'});
    checks.push('provider-bind-first-callback-serialized');
  }finally{await finishGate.query('ROLLBACK');finishGate.release();await Promise.allSettled([firstFinish,lateCallback].filter(Boolean))}
  phase='queue-auth-and-lease';
  before=await snapshot();for(const options of [{secret:null},{secret:'wrong'},{secret:null,token:login.data.access_token}])assert.equal((await consumer(options)).status,403);
  same(before,await snapshot(),'consumer-unauthorized-no-effects');
  for(const name of ['record_email_provider_event','claim_email_delivery']){
    const args=name==='claim_email_delivery'?{p_id:first.id,p_claim:randomUUID()}:{p_event_id:randomUUID(),p_provider_id:first.provider,p_type:'email.delivered'};
    for(const token of [input.publishableKey,login.data.access_token]){
      const denied=await rpc(name,args,token);assert.ok([401,403].includes(denied.status));assert.equal(denied.data.code,'42501');
    }
  }checks.push('browser-service-rpc-denials');
  const lease=await delivery({provider:null,status:'queued'}),a=randomUUID(),b=randomUUID();
  assert.equal((await rpc('claim_email_delivery',{p_id:lease.id,p_claim:a})).data.length,1);
  assert.equal((await rpc('claim_email_delivery',{p_id:lease.id,p_claim:b})).data.length,0);
  await db.query("UPDATE public.email_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[lease.id]);
  assert.equal((await rpc('claim_email_delivery',{p_id:lease.id,p_claim:b})).data.length,1);
  before=await snapshot();assert.equal((await rpc('finish_email_delivery',{p_id:lease.id,p_claim:a,p_queue_id:-1,p_status:'failed'})).data,false);
  same(before,await snapshot(),'claim-lease-fencing');
  assert.equal((await rpc('finish_email_delivery',{p_id:lease.id,p_claim:b,p_queue_id:-1,p_status:'failed'})).data,true);
  phase='actual-consumer';
  const q=await queued();assert.equal((await consumer()).status,200);assert.equal((await row(q)).status,'accepted');
  assert.equal(accepted.get(q),(await row(q)).provider_id);assert.equal(sinkCalls.get(q),1);checks.push('queue-positive-and-enqueue-dedupe');
  const noQueue=await consumer();assert.equal(noQueue.data.processed,0);assert.equal(sinkCalls.get(q),1);checks.push('accepted-queue-not-replayed');
  for(const mode of ['retry','permanent','rate-limit']){
    const id=await queued();sinkMode=mode;assert.equal((await consumer()).status,200);
    const current=await row(id);assert.equal(current.status,mode==='permanent'?'failed':'queued');
    assert.equal(current.error_code,mode==='retry'?'PROVIDER_HTTP_500':mode==='permanent'?'PROVIDER_HTTP_422':'PROVIDER_HTTP_429');
    if(mode==='rate-limit'){
      assert.equal((await consumer()).data.reason,'busy_or_cooldown');checks.push('queue-rate-limit-global-cooldown');
    }
    if(mode!=='permanent'){sinkMode='ok';await retryNow(id);assert.equal((await consumer()).status,200);assert.equal((await row(id)).status,'accepted')}
    checks.push(mode==='permanent'?'queue-permanent-provider-failure':'queue-retryable-provider-failure');
  }
  const suppressed=await queued();await db.query("INSERT INTO public.suppressed_emails(email,reason) VALUES('queue@roomqc.invalid','bounce') ON CONFLICT(email) DO UPDATE SET reason='bounce'");
  sinkMode='ok';assert.equal((await consumer()).status,200);assert.equal((await row(suppressed)).status,'suppressed');
  assert.equal(sinkCalls.has(suppressed),false);await db.query("DELETE FROM public.suppressed_emails WHERE email='queue@roomqc.invalid'");checks.push('queue-suppression-no-provider-call');
  const expired=await queued();await db.query("UPDATE public.email_deliveries SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired]);
  assert.equal((await consumer()).status,200);assert.equal((await row(expired)).status,'expired');assert.equal(sinkCalls.has(expired),false);checks.push('queue-expiry-no-provider-call');
  const exhausted=await queued();await db.query('UPDATE public.email_deliveries SET attempts=4 WHERE id=$1',[exhausted]);sinkMode='retry';
  assert.equal((await consumer()).status,200);assert.equal((await row(exhausted)).status,'failed');assert.equal((await row(exhausted)).attempts,5);
  checks.push('queue-retry-limit-terminal');sinkMode='ok';
  const legacy=(await db.query("SELECT pgmq.send('transactional_emails',$1::jsonb) AS id",[JSON.stringify({token:'owned-obsolete-token',template:'legacy'})])).rows[0].id;
  assert.equal((await consumer()).status,200);
  const dlq=(await db.query("SELECT message FROM pgmq.q_transactional_emails_dlq WHERE message->>'legacy_queue_id'=$1",[String(legacy)])).rows;
  assert.equal(dlq.length,1);assert.deepEqual(dlq[0].message,{reason:'legacy_payload_requires_review',legacy_queue_id:Number(legacy)});
  checks.push('legacy-queue-quarantined-without-token');
  const lost=await queued();sinkMode='drop-accepted-response';assert.equal((await consumer()).status,200);
  assert.equal(accepted.has(lost),true);assert.equal((await row(lost)).status,'queued');
  await retryNow(lost);assert.equal((await consumer()).status,200);assert.equal((await row(lost)).status,'accepted');
  assert.equal(sinkCalls.get(lost),2);checks.push('accepted-provider-response-loss');
  // Synthetic sink dedupes by delivery ID. This does NOT prove Resend exactly-once.
  const committed=await queued();lostFinish=true;const commitResult=await consumer();assert.equal(commitResult.status,503);
  assert.equal((await row(committed)).status,'accepted');assert.equal(lostFinish,false);
  assert.equal((await consumer()).status,200);assert.equal(sinkCalls.get(committed),1);checks.push('durable-finish-response-loss');
  const parallel=await queued();let hit,release;const reached=new Promise(r=>{hit=r}),released=new Promise(r=>{release=r});
  sinkBarrier={hit,release:released};const active=consumer();
  try{await bounded(reached);assert.equal((await consumer()).data.reason,'busy_or_cooldown');release();assert.equal((await active).status,200)}
  finally{release();sinkBarrier=null;await active}
  assert.equal(sinkCalls.get(parallel),1);checks.push('two-consumers-global-worker-lease');
  same(protectedBefore,await snapshot(businessTables),'callback-business-effect-allowlist');
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM pgmq.q_transactional_emails')).rows[0].n,0);
  process.stdout.write(JSON.stringify({verified:true,checks,races,actualWebhook:true,actualConsumer:true,
    protectedTables:businessTables.length,ownedDeliveries:owned.length,signatureWindowSeconds:300,bodyLimitBytes:65536,
    syntheticSink:true,sinkDeduplicationOnly:true,realInboxDelivery:false,resendExactlyOnceProven:false,
    providerInternet:false,schedulerEnabled:false})+'\n');
}finally{sinkBarrier?.hit();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.end()}
