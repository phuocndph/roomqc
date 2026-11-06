// Actual pinned Deno runtime, Auth/REST/Postgres, and a fixed internal AI sink.
// This standalone client runs only in the exact-owned gateway network namespace.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHmac,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import pg from '/control/node_modules/pg/lib/index.js';
import {createAdvicePolicyFixture} from '/control/testing/advice-policy-fixture.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_EDGE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(['exercise','resume','upgrade','clock-upgrade','closure-upgrade','interrupt','authority'].includes(input.phase));
const origin='http://127.0.0.1:8000',checks=[],callerChecks=[],races=[],owned=new Set(),modes=new Map(),calls=new Map(),projections=new Map();
const frontendRequests=[],frontendLoss=new Map(),frontendJournal=new Map();
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,
  max:5,statement_timeout:20000,connectionTimeoutMillis:5000,application_name:'owned-advice-edge-'+input.run});
const advice=Array.from({length:3},(_,i)=>({title:'Đối soát '+i,description:'Kiểm tra số liệu tổng hợp.',action:'Đối chiếu chứng từ.',priority:'medium'}));
const success=()=>({choices:[{message:{tool_calls:[{function:{name:'submit_advice',arguments:JSON.stringify({advice})}}]}}]});
let stage='start',serial=0,relayFailure=false,dropFinish=null,dispatchHook=null,releaseHook=null,interruptControl=null,interruptedRequestObserved=false,closedForRestart=null;
const sockets=new Set(),barriers=new Map(),keyKinds={userAuth:0,userRpc:0,serviceRpc:0};
const record=(label,passed,details={})=>{checks.push({label:'advice-edge-'+label,passed,actualEdge:true,...details});assert.equal(passed,true,label)};
const callerRecord=(label,passed)=>{callerChecks.push({label:'advice-caller-'+label,passed,productionClient:true,actualEdge:true});assert.equal(passed,true,label)};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
async function bounded(promise,ms=8000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('OWNED_BARRIER_TIMEOUT')),ms)})])}finally{clearTimeout(timer)}}
function barrier(id,timeout=15000){const hit=deferred(),release=deferred();const b={hit:hit.promise,release:release.resolve,wait:release.promise,mark:hit.resolve,timeout};barriers.set(id,b);return b}
const count=id=>calls.get(id)??0;
const command=()=>{const id=randomUUID();owned.add(id);return id};
const allowedRpc=new Set(['get_operations_advice_command','prepare_operations_advice','cancel_operations_advice','close_operations_advice','dispatch_operations_advice','finish_operations_advice']);
const server=createServer(async(req,res)=>{
  try{
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;assert.ok(bytes<=65536);chunks.push(chunk)}
    const raw=Buffer.concat(chunks),body=raw.length?JSON.parse(raw):null;
    if(req.url==='/_fixture/advice-interruption-release'){
      assert.equal(input.phase,'interrupt');assert.equal(req.method,'POST');assert.equal(req.headers['x-roomqc-fixture-owner'],input.run);
      assert.ok(interruptControl&&!interruptControl.released);interruptControl.released=true;interruptControl.resolve();
      res.writeHead(200,{'content-type':'application/json'});res.end('{"released":true}');return;
    }
    if(req.url==='/functions/v1/operations-advisor'){
      assert.equal(req.method,'POST');assert.equal(req.headers.apikey,input.publishableKey);
      assert.ok(req.headers.authorization?.startsWith('Bearer '));assert.notEqual(req.headers.authorization,'Bearer '+input.serviceKey);
      assert.ok(owned.has(body.command_id));
      frontendRequests.push({id:body.command_id,action:body.action,keys:Object.keys(body).sort().join(',')});
      const journal=frontendJournal.get(body.command_id);if(journal)journal.observed.push(JSON.stringify([...journal.entries]));
      const loss=frontendLoss.get(body.command_id);
      if(body.action==='generate'&&loss==='before'){frontendLoss.delete(body.command_id);req.socket.destroy();return}
      let upstream;
      try{upstream=await fetch('http://operations-advice-test:9000/',{method:'POST',redirect:'error',
        signal:AbortSignal.timeout(60000),headers:{authorization:req.headers.authorization,'content-type':'application/json'},body:raw});}
      catch(e){if(loss==='interrupted'){interruptedRequestObserved=true;req.socket.destroy();return}throw e}
      const response=Buffer.from(await upstream.arrayBuffer());
      if(body.action==='generate'&&loss==='after'){frontendLoss.delete(body.command_id);req.socket.destroy();return}
      if(body.action==='close'&&loss==='close-after'){frontendLoss.delete(body.command_id);req.socket.destroy();return}
      res.statusCode=upstream.status;
      for(const[key,value]of upstream.headers)if(!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
      res.end(response);return;
    }
    if(req.url==='/v1/chat/completions'){
      const id=req.headers['x-roomqc-command'];assert.equal(req.method,'POST');assert.ok(owned.has(id));
      assert.equal(req.headers['x-roomqc-fixture-owner'],input.run);assert.equal(req.headers.authorization,undefined);
      assert.equal(req.headers.apikey,undefined);assert.equal(body.tool_choice.function.name,'submit_advice');
      const projected=JSON.parse(body.messages[1].content);projections.set(id,projected);calls.set(id,count(id)+1);
      const b=barriers.get(id);if(b){b.mark();await bounded(b.wait,b.timeout)}
      if(res.destroyed)return;
      const mode=modes.get(id)??'ok';
      if(mode==='drop'){req.socket.destroy();return}
      res.writeHead(mode==='error'?500:200,{'content-type':'application/json'});
      res.end(mode==='error'?'{"error":"fixture unavailable"}':mode==='malformed'?'{':mode==='oversize'?'x'.repeat(32769):
        mode==='invalid'?JSON.stringify({choices:[]}):JSON.stringify(success()));return;
    }
    const name=req.url?.startsWith('/rest/v1/rpc/')?req.url.slice('/rest/v1/rpc/'.length):null;
    assert.ok(req.url==='/auth/v1/user'||allowedRpc.has(name),'Fixed relay endpoint allowlist');
    if(req.url==='/auth/v1/user'){
      assert.equal(req.method,'GET');assert.equal(req.headers.apikey,input.publishableKey);
      // Auth must receive even an untrusted machine bearer so it can reject it.
      // The API key stays anonymous; no user/worker RPC may follow that denial.
      keyKinds.userAuth++;
    }else{
      assert.equal(req.method,'POST');assert.ok(owned.has(body.p_command_id));
      if(['dispatch_operations_advice','finish_operations_advice'].includes(name)){
        assert.equal(req.headers.apikey,input.serviceKey);assert.equal(req.headers.authorization,'Bearer '+input.serviceKey);keyKinds.serviceRpc++;
      }else{assert.equal(req.headers.apikey,input.publishableKey);assert.notEqual(req.headers.authorization,'Bearer '+input.serviceKey);keyKinds.userRpc++}
      // The final user lookup after a committed finish has an independent live fence.
      if(name==='get_operations_advice_command'&&releaseHook?.id===body.p_command_id&&releaseHook.committed){
        const hook=releaseHook;releaseHook=null;await hook.run();
      }
    }
    const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
    const upstream=await fetch(origin+req.url,{method:req.method,headers,redirect:'error',signal:AbortSignal.timeout(15000),
      ...(['GET','HEAD'].includes(req.method)?{}:{body:raw})});
    const response=Buffer.from(await upstream.arrayBuffer());
    if(name==='dispatch_operations_advice'&&dispatchHook?.id===body.p_command_id&&upstream.ok){
      const hook=dispatchHook;dispatchHook=null;await hook.run();
    }
    if(name==='finish_operations_advice'&&upstream.ok&&body.p_advice!==null){
      if(releaseHook?.id===body.p_command_id)releaseHook.committed=true;
      if(dropFinish===body.p_command_id){dropFinish=null;req.socket.destroy();return}
    }
    res.statusCode=upstream.status;
    for(const [key,value]of upstream.headers)if(!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
    res.end(response);
  }catch{relayFailure=true;if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end('{"code":"OWNED_ADVICE_RELAY"}')}
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});
async function request(path,token,body,method='POST'){
  const r=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
const rpc=(name,a,args)=>request('/rest/v1/rpc/'+name,a.token??a,args);
const credentials=label=>({email:'advice-edge-'+input.run+'-'+label+'@roomqc.invalid',
  password:createHmac('sha256',input.serviceKey).update('owned-advice-edge:'+input.run+':'+label).digest('hex')});
async function login(label){const r=await request('/auth/v1/token?grant_type=password',input.publishableKey,credentials(label));assert.equal(r.status,200);
  return{id:r.data.user.id,token:r.data.access_token,sessionId:JSON.parse(Buffer.from(r.data.access_token.split('.')[1],'base64url')).session_id}}
async function account(label){const r=await request('/auth/v1/admin/users',input.serviceKey,{...credentials(label),email_confirm:true});assert.equal(r.status,200);return login(label)}
async function owner(label){const a=await account(label),p=await rpc('provision_workspace_registration',input.serviceKey,{
  p_workspace_id:randomUUID(),p_owner_id:a.id,p_fields:{fullName:'Owned AI fixture',phone:'0901234567',tenantName:'Owned AI fixture',
    hotelName:'Owned AI fixture',hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:credentials(label).email,totalRooms:5}});
  assert.equal(p.status,200);assert.equal(p.data.success,true);return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id}}
const scope=a=>({start:'2026-10-01',end:'2026-10-31',hotel:a.hotelId,timezone:'Asia/Ho_Chi_Minh'});
const nativeScope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
async function edge(a,id,{action='generate',service='operations-advice-test',extra={},method='POST',raw,token=a.token}={}){
  const body=raw??JSON.stringify({action,command_id:id,...(action==='lookup'?{}:scope(a)),...extra});
  const r=await fetch('http://'+service+':9000/',{method,headers:{...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json',
    origin:'http://127.0.0.1:8082'},body:['GET','HEAD'].includes(method)?undefined:body,signal:AbortSignal.timeout(60000)});
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),'http://127.0.0.1:8082');
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
async function ready(){for(const name of ['operations-advice-test','operations-advice-second-test','operations-advice-disabled-test']){
  const until=Date.now()+25000;let ok=false;while(Date.now()<until){try{const r=await fetch('http://'+name+':9000/',{signal:AbortSignal.timeout(1500)});await r.arrayBuffer();if(r.status===405){ok=true;break}}catch{}
    await new Promise(r=>setTimeout(r,100))}assert.ok(ok,'Actual Deno handler ready')}}
const policyFixture=createAdvicePolicyFixture({db,input,call:request,rpc});
const policy=(a,extra={})=>policyFixture.configure({p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:100,
  p_daily_budget_units:1000,p_units_per_request:5,p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned Edge advice test',...extra});
async function row(a,id){return(await db.query('SELECT state,advice,units,dispatch_token FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2',[a.id,id])).rows[0]}
async function insert(table,body){const r=await request('/rest/v1/'+table,input.serviceKey,body);assert.equal(r.status,201,'Owned seed '+table);return r.data[0]}
async function booking(a,status='confirmed',extra={}){const room=await insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,
  room_number:'AI'+(++serial),room_type:'standard',floor:1,status:'vacant_clean'});
  return insert('room_bookings',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,
    guest_name:'AI_PRIVATE_GUEST_'+input.run,guest_phone:'0909876543',status,created_by:a.id,booking_type:'daily',
    check_in_date:'2026-10-13T00:00:00Z',check_out_date:'2026-10-15T00:00:00Z',room_price:200000,
    subtotal:200000,total_amount:200000,vat_rate:0,service_fee_rate:0,...extra})}
async function seed(a){
  await booking(a,'checked_out',{amount_paid:200000,payment_status:'paid'});
  for(const refund of [false,true]){const b=await booking(a,'confirmed',{deposit_amount:100000});
    await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:b.id,amount:100000,
      payment_method:'cash',payment_status:'completed',paid_at:'2026-10-01T00:00:00Z',created_by:a.id});
    const r=await rpc('resolve_booking_no_show',a,{p_booking_id:b.id,p_refund_deposit:refund,p_reason:'Owned AI seed',p_command_id:randomUUID()});assert.equal(r.status,200);
    await db.query("UPDATE private.booking_no_show_resolutions SET recorded_at='2026-10-15T00:00:00Z' WHERE booking_id=$1",[b.id])}
  await db.query(`INSERT INTO public.maintenance_requests(tenant_id,hotel_id,request_code,location,issue_type,title,description,
    status,reported_by,completed_at,actual_cost) VALUES($1,$2,$3,'Owned fixture','repair','Owned cost','Owned cost','completed',$4,'2026-10-15T00:00:00Z',1000)`,
    [a.tenantId,a.hotelId,'AI-'+randomUUID(),a.id]);
  await db.query('UPDATE public.users SET hourly_wage_vnd=100,monthly_salary_vnd=NULL WHERE id=$1',[a.id]);
  await db.query(`INSERT INTO public.shift_history(tenant_id,hotel_id,user_id,start_at,end_at)
    VALUES($1,$2,$3,'2026-10-15T00:00:00Z','2026-10-15T01:00:00Z')`,[a.tenantId,a.hotelId,a.id]);
  const args={p_kind:'financial',p_period_month:'2026-10-01',p_hotel_id:a.hotelId},read=await rpc('get_report_targets',a,args);assert.equal(read.status,200);
  const saved=await rpc('replace_report_targets',a,{...args,p_values:{adr:123.45},p_expected_revision:read.data.revision,p_command_id:randomUUID()});assert.equal(saved.status,200);
}
async function noEffects(a,id,status,options){const r=await edge(a,id,options);record('deny-'+stage,r.status===status&&!await row(a,id)&&count(id)===0,{status:r.status})}
// Uses the bundled product transport. Storage and lock are explicit in-process
// substitutes; this is not proof of browser localStorage or native Web Locks.
function callerFixture(a,entries=[]){
  const store=new Map(entries),locks=new Set(),observed=[];let auth=a;
  const storage={get length(){return store.size},getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const context=()=>({actorId:auth.id,sessionId:auth.sessionId,tenantId:a.tenantId,runtime:'owned-advice-http-'+input.run});
  const client=()=>RoomQCAdviceCaller.createOperationsAdviceClient({endpoint:'http://api-gw:9083',publishableKey:input.publishableKey,
    storage:()=>storage,getSession:async()=>({data:{session:{access_token:auth.token,user:{id:auth.id}}},error:null}),
    newId:()=>{const id=command();frontendJournal.set(id,{entries:store,observed});return id},
    lock:async(name,run)=>{if(locks.has(name))throw new RoomQCAdviceCaller.AdviceClientError('flow_busy','Owned fixture lock busy');
      locks.add(name);try{return await run()}finally{locks.delete(name)}}});
  return{client,context,store,observed,relogin:next=>{auth=next}};
}
async function expectCallerError(task,code){let found;try{await task}catch(e){found=e}assert.equal(found?.code,code)}
async function exerciseCaller(a){
  const s=scope(a);
  stage='caller-success';const simple=callerFixture(a),done=await simple.client().generate(simple.context(),s),id=done.command_id;
  callerRecord('production-client-http-auth-rpc-provider-completion',done.state==='completed'&&isDeepStrictEqual(done.advice,advice)&&count(id)===1&&simple.store.size===0);
  const journal=simple.observed[0];callerRecord('scope-only-payload-and-journal-persisted-before-io',
    frontendRequests.find(x=>x.id===id)?.keys==='action,command_id,end,hotel,start,timezone'&&journal.includes(id)
    &&!journal.includes(a.token)&&!journal.includes('snapshot')&&!journal.includes(advice[0].title));
  stage='caller-response-lost';
  // Fault selection is armed by the storage write, before the real fetch starts.
  const withFault=(mode)=>{
    const f=callerFixture(a),client=f.client;
    f.client=()=>{const c=client();return{...c,generate:(context,target,options)=>{
      const task=c.generate(context,target,options);for(const value of f.store.values()){const saved=JSON.parse(value);frontendLoss.set(saved.request.command_id,mode)}return task}}};
    return f;
  };
  const after=withFault('after');await expectCallerError(after.client().generate(after.context(),s),'outcome_unknown');
  const afterId=after.client().pending(after.context(),s).request.command_id;
  callerRecord('lost-completion-response-keeps-key-with-one-dispatch',(await row(a,afterId)).state==='completed'&&count(afterId)===1&&after.store.size===1);
  const recovered=await after.client().lookup(after.context(),s);
  callerRecord('new-client-lookup-recovers-without-regeneration',recovered.state==='completed'&&after.store.size===0&&count(afterId)===1
    &&frontendRequests.filter(x=>x.id===afterId).map(x=>x.action).join(',')==='generate,lookup');
  stage='caller-before-send';const before=withFault('before');await expectCallerError(before.client().generate(before.context(),s),'outcome_unknown');
  const beforeId=before.client().pending(before.context(),s).request.command_id;
  callerRecord('before-send-loss-has-pending-with-no-server-write',!await row(a,beforeId)&&count(beforeId)===0&&before.store.size===1);
  callerRecord('not-found-lookup-retains-key-without-generation',(await before.client().lookup(before.context(),s)).state==='not_found'&&before.store.size===1&&count(beforeId)===0);
  const cancelled=await before.client().cancel(before.context(),s);
  callerRecord('cancel-tombstone-blocks-late-generate',cancelled.state==='cancelled'&&before.store.size===0&&(await edge(a,beforeId)).data.state==='cancelled'&&count(beforeId)===0);
  stage='caller-explicit-resume';const resume=withFault('before');await expectCallerError(resume.client().generate(resume.context(),s),'outcome_unknown');
  const resumeId=resume.client().pending(resume.context(),s).request.command_id;
  const resumed=await resume.client().resume(resume.context(),s);
  callerRecord('explicit-resume-looks-up-and-reuses-original-key',resumed.state==='completed'&&resumed.command_id===resumeId&&count(resumeId)===1&&resume.store.size===0
    &&frontendRequests.filter(x=>x.id===resumeId).map(x=>x.action).join(',')==='generate,lookup,generate');
  stage='caller-unknown';const unknown=callerFixture(a),unknownClient=unknown.client();
  // Arm a provider fault before the request using the same pre-I/O journal hook.
  const unknownTask=unknownClient.generate(unknown.context(),s);
  const unknownId=unknownClient.pending(unknown.context(),s).request.command_id;modes.set(unknownId,'error');
  callerRecord('unknown-keeps-command-and-charge',(await unknownTask).state==='unknown'&&unknown.store.size===1&&count(unknownId)===1);
  const unknownResume=await unknown.client().resume(unknown.context(),s);
  callerRecord('unknown-explicit-resume-is-lookup-only',unknownResume.state==='unknown'&&unknown.store.size===1&&count(unknownId)===1
    &&frontendRequests.filter(x=>x.id===unknownId).map(x=>x.action).join(',')==='generate,lookup');
  stage='caller-relogin';const relogin=withFault('after');await expectCallerError(relogin.client().generate(relogin.context(),s),'outcome_unknown');
  stage='caller-closure';const closing=callerFixture(a),closingClient=closing.client(),closingTask=closingClient.generate(closing.context(),s);
  const closingId=closingClient.pending(closing.context(),s).request.command_id;modes.set(closingId,'error');assert.equal((await closingTask).state,'unknown');
  await expectCallerError(closing.client().close(closing.context(),s),'still_processing');
  callerRecord('close-before-deadline-preserves-pending-and-one-charge',closing.store.size===1&&count(closingId)===1);
  await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[a.id,closingId]);
  callerRecord('server-allows-closure-after-deadline',(await closing.client().lookup(closing.context(),s)).can_close===true);
  const beforeClose=(await db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,closingId])).rows[0].value;
  frontendLoss.set(closingId,'close-after');await expectCallerError(closing.client().close(closing.context(),s),'outcome_unknown');
  callerRecord('lost-closure-response-keeps-original-key',closing.client().pending(closing.context(),s).request.command_id===closingId&&count(closingId)===1);
  const relogged=await login('owner');closing.relogin(relogged);
  const closed=await closing.client().lookup(closing.context(),s);
  callerRecord('relogin-recovers-terminal-closure-without-resend',closed.state==='closed_unknown'&&closing.store.size===0&&count(closingId)===1);
  const closedRow=(await db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,closingId])).rows[0].value;
  callerRecord('closed-unknown-keeps-entire-usage-and-dispatch-fence',isDeepStrictEqual(closedRow,{...beforeClose,state:'unknown',closed_at:closedRow.closed_at,closed_by:a.id}));
  for(const action of ['generate','cancel','close','lookup'])callerRecord('closed-key-'+action+'-second-edge-never-resends',
    (await edge(a,closingId,{action,service:'operations-advice-second-test'})).data.state==='closed_unknown'&&count(closingId)===1);
  callerRecord('provider-disabled-edge-can-read-and-close-existing-terminal',
    (await edge(a,closingId,{action:'close',service:'operations-advice-disabled-test'})).data.state==='closed_unknown'&&count(closingId)===1);
  callerRecord('replayed-closure-has-one-audit',Number((await db.query("SELECT count(*) AS n FROM public.activity_logs WHERE entity_type='operations_advice' AND entity_id=$1 AND new_values->>'state'='closed_unknown'",[closingId])).rows[0].n)===1);
  const next=await closing.client().generate(closing.context(),s);
  callerRecord('new-generation-requires-explicit-new-key',next.state==='completed'&&next.command_id!==closingId&&count(next.command_id)===1&&count(closingId)===1);
  closedForRestart=closingId;
  stage='caller-relogin';
  const previousSession=relogin.context().sessionId,loginId=relogin.client().pending(relogin.context(),s).request.command_id;
  relogin.relogin(await login('owner'));
  callerRecord('same-actor-new-session-finds-old-journal',relogin.context().sessionId!==previousSession&&relogin.client().pending(relogin.context(),s).request.command_id===loginId);
  callerRecord('relogin-lookup-completes-without-new-dispatch',(await relogin.client().lookup(relogin.context(),s)).state==='completed'&&relogin.store.size===0&&count(loginId)===1);
  stage='caller-concurrency';const concurrent=callerFixture(a),first=concurrent.client().generate(concurrent.context(),s);
  const concurrentId=concurrent.client().pending(concurrent.context(),s).request.command_id,gate=barrier(concurrentId);await bounded(gate.hit);
  await expectCallerError(concurrent.client().generate(concurrent.context(),s),'flow_busy');
  callerRecord('shared-in-process-lock-rejects-second-client-before-http',frontendRequests.filter(x=>x.id===concurrentId).length===1&&count(concurrentId)===1);
  gate.release();callerRecord('first-client-completes-once-after-race',(await first).state==='completed'&&concurrent.store.size===0&&count(concurrentId)===1);
  stage='caller-late-identity';const late=callerFixture(a);let current=true;
  const lateTask=late.client().generate(late.context(),s,{isCurrent:()=>current});
  const lateId=late.client().pending(late.context(),s).request.command_id,lateGate=barrier(lateId);await bounded(lateGate.hit);current=false;lateGate.release();
  await expectCallerError(lateTask,'identity_changed');
  callerRecord('late-result-is-not-released-to-changed-scope',late.store.size===1&&(await row(a,lateId)).state==='completed'&&count(lateId)===1);
  current=true;callerRecord('returning-scope-recovers-without-new-dispatch',(await late.client().lookup(late.context(),s,{isCurrent:()=>current})).state==='completed'&&late.store.size===0&&count(lateId)===1);
  stage='caller-restart-journal';const restart=withFault('after');await expectCallerError(restart.client().generate(restart.context(),s),'outcome_unknown');
  return[{kind:'completed',entries:[...restart.store]},{kind:'unknown',entries:[...unknown.store]}];
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(9083,'0.0.0.0',resolve)});await ready();
  if(input.phase==='authority'){
    stage='edge-authority-matrix';const result=await exerciseAdviceEdgeAuthority();
    process.stdout.write(JSON.stringify({...result,checks,callerChecks,races}));
  }else if(input.phase==='interrupt'){
    const a=await owner('interrupt-owner');await seed(a);await policy(a);const s=scope(a);
    stage='interrupt-kill';const killed=callerFixture(a),killedClient=killed.client();
    const killedTask=killedClient.generate(killed.context(),s).then(result=>({result}),error=>({error}));
    const killedId=killedClient.pending(killed.context(),s).request.command_id;frontendLoss.set(killedId,'interrupted');
    const killedGate=barrier(killedId,90000);await bounded(killedGate.hit);
    const beforeKill=await row(a,killedId);record('kill-barrier-provider-accepted-with-durable-dispatch',beforeKill.state==='dispatched'&&beforeKill.units===5&&beforeKill.advice===null&&count(killedId)===1);
    const control=deferred();interruptControl={resolve:control.resolve,released:false};
    process.stdout.write(JSON.stringify({event:'advice_interruption_barrier',owner:input.run,phase:'kill'})+'\n');
    await bounded(control.promise,90000);killedGate.release();await ready();
    const killedReply=await killedTask,stored=await row(a,killedId);
    record('sigkill-lost-request-keeps-journal-and-charge',interruptControl.released&&interruptedRequestObserved&&killedReply.error?.code==='outcome_unknown'
      &&killedClient.pending(killed.context(),s).request.command_id===killedId&&stored.state==='dispatched'&&stored.units===5&&stored.advice===null&&count(killedId)===1);
    record('lookup-after-kill-is-unknown-without-provider-resend',(await killed.client().lookup(killed.context(),s)).state==='unknown'&&count(killedId)===1);
    record('explicit-resume-after-kill-is-lookup-only',(await killed.client().resume(killed.context(),s)).state==='unknown'&&count(killedId)===1
      &&frontendRequests.filter(x=>x.id===killedId).map(x=>x.action).join(',')==='generate,lookup,lookup');
    record('cancel-cannot-erase-killed-inflight-charge',(await killed.client().cancel(killed.context(),s)).state==='unknown'&&killed.store.size===1&&(await row(a,killedId)).units===5);
    record('second-edge-refuses-resend-after-process-kill',(await edge(a,killedId,{service:'operations-advice-second-test'})).data.state==='unknown'&&count(killedId)===1);
    stage='interrupt-real-provider-timeout';const timeout=callerFixture(a),timeoutClient=timeout.client(),timeoutStart=Date.now();
    const timeoutTask=timeoutClient.generate(timeout.context(),s),timeoutId=timeoutClient.pending(timeout.context(),s).request.command_id;
    const timeoutGate=barrier(timeoutId,65000);await bounded(timeoutGate.hit);const timeoutReply=await timeoutTask,timeoutElapsed=Date.now()-timeoutStart;
    timeoutGate.release();const timed=await row(a,timeoutId);
    record('real45second-provider-timeout-keeps-unknown-and-charge',timeoutElapsed>=44000&&timeoutElapsed<60000&&timeoutReply.state==='unknown'
      &&timed.state==='unknown'&&timed.units===5&&timed.advice===null&&timeout.store.size===1&&count(timeoutId)===1,{elapsedMs:timeoutElapsed,realClock:true});
    record('real-timeout-explicit-resume-never-resends',(await timeout.client().resume(timeout.context(),s)).state==='unknown'&&count(timeoutId)===1);
    stage='interrupt-real-policy-expiry';await policy(a,{p_valid_until:new Date(Date.now()+3500).toISOString()});
    const expiring=callerFixture(a),expiryStart=Date.now(),expiryTask=expiring.client().generate(expiring.context(),s).then(result=>({result}),error=>({error}));
    const expiryId=expiring.client().pending(expiring.context(),s).request.command_id,expiryGate=barrier(expiryId,15000);await bounded(expiryGate.hit);
    const expiryReply=await expiryTask,expiryElapsed=Date.now()-expiryStart;expiryGate.release();
    const expired=await row(a,expiryId),policyExpired=(await db.query('SELECT valid_until<=clock_timestamp() AS yes FROM private.operations_advice_policy WHERE tenant_id=$1',[a.tenantId])).rows[0].yes;
    record('policy-expires-by-real-clock-during-provider-io',policyExpired&&expiryElapsed>=2000&&expiryElapsed<12000&&expiryReply.error?.code==='permission_denied'
      &&['dispatched','unknown'].includes(expired.state)&&expired.advice===null&&expired.units===5&&expiring.store.size===1&&count(expiryId)===1,{elapsedMs:expiryElapsed,realClock:true});
    await policy(a);record('policy-restored-reads-unknown-without-resend',(await expiring.client().lookup(expiring.context(),s)).state==='unknown'&&count(expiryId)===1);
    stage='interrupt-real-session-expiry';await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '3 seconds' WHERE id=$1",[a.sessionId]);
    const session=callerFixture(a),sessionStart=Date.now(),sessionTask=session.client().generate(session.context(),s).then(result=>({result}),error=>({error}));
    const sessionId=session.client().pending(session.context(),s).request.command_id,sessionGate=barrier(sessionId,15000);await bounded(sessionGate.hit);
    await new Promise(resolve=>setTimeout(resolve,3500));sessionGate.release();const sessionReply=await sessionTask,sessionElapsed=Date.now()-sessionStart;
    const sessionStored=await row(a,sessionId),sessionExpired=(await db.query('SELECT not_after<=clock_timestamp() AS yes FROM auth.sessions WHERE id=$1',[a.sessionId])).rows[0].yes;
    record('session-expires-by-real-clock-before-output-release',sessionExpired&&sessionElapsed>=3000&&sessionElapsed<12000&&sessionReply.error?.code==='permission_denied'
      &&['dispatched','unknown'].includes(sessionStored.state)&&sessionStored.advice===null&&sessionStored.units===5&&session.store.size===1&&count(sessionId)===1,{elapsedMs:sessionElapsed,realClock:true});
    await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);
    record('session-restored-reads-unknown-without-resend',(await session.client().lookup(session.context(),s)).state==='unknown'&&count(sessionId)===1);
    record('interruption-relay-keeps-user-and-service-keys-separated',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc>0);
    process.stdout.write(JSON.stringify({verified:true,checks,actualEdge:true,externalProviderCalls:0,
      internalSinkCalls:[...calls.values()].reduce((a,b)=>a+b,0),allCommandsDispatchedAtMostOnce:[...calls.values()].every(n=>n===1),
      realClockProviderTimeout:true,realClockPolicyExpiry:true,realClockSessionExpiry:true,callerStorage:'in-process-map',callerLock:'in-process-shared-lock',browser:false,android:false}));
  }else if(input.phase==='resume'){
    stage='restart-recovery';const a={...await login('owner'),hotelId:input.fixture.hotelId,tenantId:input.fixture.tenantId};
    for(const id of [input.fixture.completed,input.fixture.unknown,input.fixture.cancelled])owned.add(id);
    record('relogin-after-real-edge-process-restart',Boolean(a.sessionId)&&a.sessionId!==input.fixture.previousSessionId);
    const done=await edge(a,input.fixture.completed,{action:'lookup'});
    record('completed-survives-restart',done.status===200&&done.data.state==='completed'&&isDeepStrictEqual(done.data.advice,advice));
    record('completed-generate-after-restart-does-not-resend',(await edge(a,input.fixture.completed)).data.state==='completed'&&count(input.fixture.completed)===0);
    const unknown=await edge(a,input.fixture.unknown);
    record('unknown-survives-restart-without-resend',unknown.status===202&&unknown.data.state==='unknown'&&count(input.fixture.unknown)===0);
    record('cancellation-survives-restart',(await edge(a,input.fixture.cancelled)).data.state==='cancelled'&&count(input.fixture.cancelled)===0);
    if(input.fixture.closedUnknown){owned.add(input.fixture.closedUnknown);
      record('closed-unknown-survives-real-edge-restart',(await edge(a,input.fixture.closedUnknown,{action:'lookup'})).data.state==='closed_unknown');
      record('closed-unknown-after-restart-never-resends',(await edge(a,input.fixture.closedUnknown)).data.state==='closed_unknown'&&count(input.fixture.closedUnknown)===0);
    }
    record('restart-relay-key-separation',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc===0);
    stage='caller-restart-recovery';
    for(const saved of input.fixture.callerJournals){
      const f=callerFixture(a,saved.entries),pending=f.client().pending(f.context(),scope(a));assert.ok(pending);owned.add(pending.request.command_id);
      const result=await f.client().lookup(f.context(),scope(a));
      callerRecord(saved.kind+'-journal-rehydrated-after-restart-and-relogin',result.state===saved.kind&&count(result.command_id)===0
        &&(saved.kind==='completed'?f.store.size===0:f.store.size===1));
    }
    assert.equal(relayFailure,false);assert.equal([...calls.values()].reduce((a,b)=>a+b,0),0);
    process.stdout.write(JSON.stringify({verified:true,checks,callerChecks,externalProviderCalls:0,sinkCalls:0,actualEdge:true,
      callerStorage:'rehydrated-in-process-map',callerLock:'in-process-shared-lock',browser:false,android:false}));
  }else if(input.phase==='closure-upgrade'){
    stage='closure-upgrade-existing574-data';const a=input.fixture.owner,id=input.fixture.unknown.id;
    for(const key of [input.fixture.completed.id,id,input.fixture.cancelled.id])owned.add(key);
    record('closure-upgrade-completed-receipt-preserved',(await edge(a,input.fixture.completed.id,{action:'lookup'})).data.state==='completed'&&count(input.fixture.completed.id)===0);
    record('closure-upgrade-unknown-never-redispatched',(await edge(a,id)).data.state==='unknown'&&(await edge(a,id,{service:'operations-advice-second-test'})).data.state==='unknown'&&count(id)===0);
    await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[a.id,id]);
    const closed=await edge(a,id,{action:'close'});
    record('closure-upgrade-expired-original-closes-without-provider',closed.status===200&&closed.data.state==='closed_unknown'&&!!closed.data.closed_at&&count(id)===0);
    record('closure-upgrade-old-key-remains-terminal-across-instances',(await edge(a,id,{service:'operations-advice-second-test'})).data.state==='closed_unknown'&&count(id)===0);
    record('closure-upgrade-cancelled-stays-cancelled',(await edge(a,input.fixture.cancelled.id,{action:'close'})).data.state==='cancelled');
    const generated=command(),done=await edge(a,generated),projected=projections.get(generated);
    record('closure-upgrade-money-source-and-new-request-still-work',done.status===200&&done.data.state==='completed'&&count(generated)===1
      &&projected.current.recognized_revenue===200000&&projected.current.checkout_room_net_revenue===200000);
    record('closure-upgrade-foreign-cannot-close-original',(await edge(input.fixture.foreign,id,{action:'close'})).status===403);
    record('closure-upgrade-relay-key-separation',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc>0);
    process.stdout.write(JSON.stringify({verified:true,checks,callerChecks,actualEdge:true,externalProviderCalls:0,
      internalSinkCalls:[...calls.values()].reduce((a,b)=>a+b,0),allCommandsDispatchedAtMostOnce:[...calls.values()].every(n=>n===1),browser:false,android:false}));
  }else if(input.phase==='clock-upgrade'){
    stage='clock-upgrade-existing573-data';const a=input.fixture.owner;
    for(const id of [input.fixture.completed.id,input.fixture.unknown.id])owned.add(id);
    const original=await edge(a,input.fixture.completed.id,{action:'lookup'});
    record('clock-upgraded-original-receipt-readable-without-provider',original.status===200&&original.data.state==='completed'&&count(input.fixture.completed.id)===0);
    const unknown=await edge(a,input.fixture.unknown.id),second=await edge(a,input.fixture.unknown.id,{service:'operations-advice-second-test'});
    record('clock-upgraded-unknown-keeps-dispatch-fence-across-instances',unknown.status===202&&second.status===202&&unknown.data.state==='unknown'&&second.data.state==='unknown'&&count(input.fixture.unknown.id)===0);
    const generated=command(),done=await edge(a,generated),projected=projections.get(generated);
    record('clock-upgraded-seeded-money-reaches-real-edge-sink',done.status===200&&done.data.state==='completed'&&count(generated)===1
      &&projected.current.recognized_revenue===200000&&projected.current.checkout_room_net_revenue===200000);
    record('clock-upgraded-new-result-replay-does-not-resend',(await edge(a,generated)).data.state==='completed'&&count(generated)===1);
    const foreign=await edge(input.fixture.foreign,generated,{action:'lookup'});
    record('clock-upgraded-foreign-tenant-cannot-read-result',foreign.status===403&&count(generated)===1);
    record('clock-upgraded-relay-key-separation',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc>0);
    process.stdout.write(JSON.stringify({verified:true,checks,callerChecks,actualEdge:true,externalProviderCalls:0,
      internalSinkCalls:[...calls.values()].reduce((a,b)=>a+b,0),allCommandsDispatchedAtMostOnce:[...calls.values()].every(n=>n===1),browser:false,android:false}));
  }else if(input.phase==='upgrade'){
    stage='upgrade-existing572-data';const a={...await login('owner'),tenantId:input.fixture.owner.tenantId,hotelId:input.fixture.owner.hotelId};
    const id=command();await noEffects(a,id,403);
    await policy(a);
    const generated=command(),done=await edge(a,generated),projection=projections.get(generated);
    record('upgraded572-source-reaches-actual-edge-provider',done.status===200&&done.data.state==='completed'&&count(generated)===1);
    record('upgraded572-money-cost-labor-target-match-preserved-values',projection.current.recognized_revenue===300000
      &&projection.current.checkout_room_net_revenue===200000&&projection.current.retained_no_show_fee===100000
      &&projection.current.refund_due_not_paid===100000&&projection.current.total_cost_before_labor===1000&&projection.current_labor_estimate===100
      &&projection.targets.adr===123.45&&projection.targets.gop===2000);
    const invalid=command();await noEffects(a,invalid,400,{extra:{snapshot:{recognized_revenue:999999}}});
    const foreign={...await login('foreign'),tenantId:input.fixture.foreign.tenantId,hotelId:input.fixture.foreign.hotelId};
    const before=count(generated),foreignResult=await edge(foreign,generated,{action:'lookup'});
    record('upgraded572-foreign-receipt-lookup-denied',foreignResult.status===403&&count(generated)===before);
    const callerJournals=await exerciseCaller(a);assert.equal(callerJournals.length,2);
    record('upgraded-client-relay-key-separation',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc>0);
    process.stdout.write(JSON.stringify({verified:true,checks,callerChecks,actualEdge:true,externalProviderCalls:0,
      internalSinkCalls:[...calls.values()].reduce((a,b)=>a+b,0),allCommandsDispatchedAtMostOnce:[...calls.values()].every(n=>n===1),
      callerStorage:'in-process-map',callerLock:'in-process-shared-lock',browser:false,android:false}));
  }else{
    const a=await owner('owner'),foreign=await owner('foreign'),staff=await account('staff'),unconfigured=await owner('unconfigured');
    await seed(a);await policy(a);await policy(foreign);
    stage='disabled';await noEffects(a,command(),503,{service:'operations-advice-disabled-test'});
    stage='default-policy';await noEffects(unconfigured,command(),403);
    stage='missing-auth';await noEffects(a,command(),401,{token:null});
    stage='machine-auth';await noEffects(a,command(),401,{token:input.serviceKey});
    stage='legacy-snapshot';await noEffects(a,command(),400,{extra:{snapshot:{revenue:999999}}});
    stage='oversize-request';await noEffects(a,command(),413,{raw:JSON.stringify({padding:'x'.repeat(2049)})});
    stage='malformed-request';await noEffects(a,command(),400,{raw:'{'});
    stage='foreign-hotel';await noEffects(a,command(),403,{extra:{hotel:foreign.hotelId}});
    stage='native-money';const complete=command(),done=await edge(a,complete);
    record('real-deno-auth-rpc-sink-finish-lookup',done.status===200&&done.data.state==='completed'&&isDeepStrictEqual(done.data.advice,advice)&&count(complete)===1);
    const p=projections.get(complete),report=await rpc('get_operations_report_scoped',a,nativeScope(a)),labor=await rpc('get_labor_cost_scoped',a,nativeScope(a));
    record('nonzero-recognition-room-plus-retained-not-refund',p.current.recognized_revenue===300000&&p.current.checkout_room_net_revenue===200000
      &&p.current.retained_no_show_fee===100000&&p.current.refund_due_not_paid===100000&&p.current.total_cost_before_labor===1000);
    record('provider-values-equal-authoritative-native-reports',report.status===200&&p.current.recognized_revenue===report.data.current.recognized_revenue
      &&p.current.total_cost_before_labor===report.data.current.cost_summary.total_cost&&labor.status===200&&p.current_labor_estimate===labor.data.total_labor_cost&&p.current_labor_estimate===100);
    record('scoped-target-and-estimates-reach-provider',p.targets_applicable&&p.targets.adr===123.45&&Number.isInteger(p.current_registered_rooms_estimate));
    const serialized=JSON.stringify(p);record('provider-projection-omits-identity-contact-and-raw-wages',
      !/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(serialized)
      &&![input.run,'0909876543','@roomqc.invalid','hourly_wage','monthly_salary','department','AI_PRIVATE_GUEST'].some(v=>serialized.includes(v)));
    record('completed-replay-does-not-resend',(await edge(a,complete)).data.state==='completed'&&count(complete)===1);
    record('same-key-changed-scope-is-conflict',(await edge(a,complete,{extra:{start:'2026-10-02'}})).status===409&&count(complete)===1);
    record('foreign-actor-cannot-lookup-receipt',(await edge(foreign,complete,{action:'lookup'})).data.state==='not_found');
    const receiptKeys=Object.keys(done.data).sort().join(',');record('http-receipt-is-minimal',receiptKeys==='advice,command_id,context_hash,request,state,version');
    stage='cross-instance-race';const race=command(),b=barrier(race),first=edge(a,race);await bounded(b.hit);
    const second=await edge(a,race,{service:'operations-advice-second-test'});
    record('second-real-edge-sees-inflight-without-resend',second.status===202&&second.data.state==='unknown'&&count(race)===1);
    b.release();record('first-instance-completes-single-provider-dispatch',(await first).data.state==='completed'&&count(race)===1);
    races.push({kind:'two-edge-one-command',instances:2,observedSinkBarrier:true,acceptedProviderCalls:count(race)});
    stage='provider-faults';let unknown;
    for(const mode of ['error','malformed','oversize','invalid','drop']){const id=command();modes.set(id,mode);const r=await edge(a,id),stored=await row(a,id);
      record(mode+'-becomes-unknown-with-charge',r.status===202&&r.data.state==='unknown'&&stored.state==='unknown'&&stored.advice===null&&stored.units===5&&count(id)===1);
      record(mode+'-retry-never-resends',(await edge(a,id,{service:'operations-advice-second-test'})).data.state==='unknown'&&count(id)===1);unknown=id}
    stage='commit-response-loss';const lost=command();dropFinish=lost;const recovered=await edge(a,lost);
    record('finish-committed-lost-response-recovers-by-lookup',dropFinish===null&&recovered.status===200&&recovered.data.state==='completed'&&count(lost)===1);
    record('commit-response-loss-retry-never-resends',(await edge(a,lost)).data.state==='completed'&&count(lost)===1);
    stage='cancel';const cancelled=command();const cancel=await edge(a,cancelled,{action:'cancel'});
    record('cancel-before-generate-is-terminal',cancel.status===200&&cancel.data.state==='cancelled'&&(await edge(a,cancelled)).data.state==='cancelled'&&count(cancelled)===0);
    stage='before-provider-revocation';const beforeProvider=command();dispatchHook={id:beforeProvider,run:()=>db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id])};
    const locked=await edge(a,beforeProvider);record('profile-revoked-after-claim-before-provider',locked.status===403&&count(beforeProvider)===0&&(await row(a,beforeProvider)).state==='unknown');
    await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
    record('restored-profile-keeps-unknown-without-resend',(await edge(a,beforeProvider)).data.state==='unknown'&&count(beforeProvider)===0);
    stage='inflight-revocation';
    for(const kind of ['profile','session','policy','deadline']){const id=command(),gate=barrier(id),pending=edge(a,id);await bounded(gate.hit);
      if(kind==='profile')await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
      if(kind==='session')await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
      if(kind==='policy')await policy(a,{p_enabled:false});
      if(kind==='deadline')await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 second' WHERE actor_id=$1 AND command_id=$2",[a.id,id]);
      gate.release();const r=await pending,stored=await row(a,id);
      record(kind+'-revoked-inflight-output-not-released',[202,403].includes(r.status)&&stored.state==='unknown'&&stored.advice===null&&count(id)===1);
      if(kind==='profile')await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
      if(kind==='session')await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);
      if(kind==='policy')await policy(a);
      record(kind+'-restored-lookup-keeps-charge-without-resend',(await edge(a,id)).data.state==='unknown'&&count(id)===1);
      races.push({kind:'inflight-'+kind,observedSinkBarrier:true,adviceReleased:false,providerCalls:1});
    }
    stage='final-release-fence';const finalFence=command();releaseHook={id:finalFence,committed:false,run:()=>db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id])};
    const fenced=await edge(a,finalFence);record('postcommit-revocation-denies-final-response',fenced.status===403&&(await row(a,finalFence)).state==='completed'&&count(finalFence)===1);
    await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
    record('restored-final-read-recovers-completed-without-resend',(await edge(a,finalFence)).data.state==='completed'&&count(finalFence)===1);
    stage='staff-scope';const other=await insert('hotels',{tenant_id:a.tenantId,name:'AI unassigned fixture',address:'Owned fixture',status:'active'});
    await insert('users',{id:staff.id,email:credentials('staff').email,full_name:'Owned AI report-only staff',tenant_id:a.tenantId,hotel_id:a.hotelId,
      role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
    await insert('user_roles',{user_id:staff.id,role:'staff'});await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});staff.hotelId=a.hotelId;
    await db.query(`DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p
      WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='staff' AND p.module='reports'`);
    stage='staff-without-reports-view';await noEffects(staff,command(),403);
    await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','view',true)",[staff.id,a.tenantId]);
    const staffId=command();record('assigned-view-only-staff-can-generate',(await edge(staff,staffId)).data.state==='completed'&&count(staffId)===1);
    stage='staff-unassigned';await noEffects(staff,command(),403,{extra:{hotel:other.id}});
    stage='staff-foreign';await noEffects(staff,command(),403,{extra:{hotel:foreign.hotelId}});
    const removed=command(),removedGate=barrier(removed),removedPending=edge(staff,removed);await bounded(removedGate.hit);
    await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[staff.id,a.hotelId]);removedGate.release();
    record('hotel-assignment-removed-inflight-denies-output',(await removedPending).status===403&&(await row(staff,removed)).advice===null&&count(removed)===1);
    await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
    record('assignment-restored-no-resend',(await edge(staff,removed)).data.state==='unknown'&&count(removed)===1);
    await db.query("UPDATE public.user_permissions SET enabled=false WHERE user_id=$1 AND module='reports' AND action='view'",[staff.id]);
    record('reports-view-revoked-blocks-existing-receipt',(await edge(staff,staffId,{action:'lookup'})).status===403);
    await db.query("UPDATE public.user_permissions SET enabled=true WHERE user_id=$1 AND module='reports' AND action='view'",[staff.id]);
    record('reports-view-restored-can-read-original',(await edge(staff,staffId,{action:'lookup'})).data.state==='completed');
    stage='audit-rollback';
    for(const state of ['reserved','dispatched','completed']){const id=command();
      try{
        await db.query(`CREATE FUNCTION private.roomqc_owned_advice_audit_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
          BEGIN IF NEW.entity_type='operations_advice' AND NEW.entity_id='${id}'::uuid AND NEW.new_values->>'state'='${state}' THEN
            RAISE EXCEPTION 'OWNED_ADVICE_AUDIT_FAULT' USING ERRCODE='P0001'; END IF; RETURN NEW; END $f$;
          CREATE TRIGGER roomqc_owned_advice_audit_fault BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION private.roomqc_owned_advice_audit_fault();`);
        const r=await edge(a,id),stored=await row(a,id);
        const audits=Number((await db.query("SELECT count(*) AS n FROM public.activity_logs WHERE entity_type='operations_advice' AND entity_id=$1 AND new_values->>'state'=$2",[id,state])).rows[0].n);
        record(state+'-audit-fault-rolls-back-transaction',audits===0&&(state==='reserved'?r.status===503&&!stored&&count(id)===0:
          state==='dispatched'?r.status===503&&stored.state==='reserved'&&stored.dispatch_token===null&&count(id)===0:
          r.status===202&&stored.state==='unknown'&&stored.advice===null&&count(id)===1));
      }finally{await db.query('DROP TRIGGER IF EXISTS roomqc_owned_advice_audit_fault ON public.activity_logs; DROP FUNCTION IF EXISTS private.roomqc_owned_advice_audit_fault()')}
      const r=await edge(a,id);record(state+'-restored-after-fault',state==='completed'?r.data.state==='unknown'&&count(id)===1:r.data.state==='completed'&&count(id)===1);
    }
    const callerJournals=await exerciseCaller(a);
    record('all-runtime-requests-use-separated-user-and-service-keys',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc>0);
    const total=[...calls.values()].reduce((a,b)=>a+b,0);
    process.stdout.write(JSON.stringify({verified:true,checks,callerChecks,races,actualEdge:true,externalProviderCalls:0,internalSinkCalls:total,
      allCommandsDispatchedAtMostOnce:[...calls.values()].every(n=>n===1),relayKeySeparationVerified:true,
      callerStorage:'in-process-map',callerLock:'in-process-shared-lock',browser:false,android:false,
      fixture:{hotelId:a.hotelId,tenantId:a.tenantId,completed:complete,unknown,cancelled,closedUnknown:closedForRestart,previousSessionId:a.sessionId,callerJournals}}));
  }
}catch(error){process.stdout.write(JSON.stringify({verified:false,stage:error.authorityStage??stage,checks,callerChecks,races,
  ...(error.authorityObservations?{observations:error.authorityObservations}:{}),
  failureCode:/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'EDGE_ADVICE_ASSERTION'}));process.exitCode=1}
finally{for(const b of barriers.values())b.release();for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));await db.end()}
