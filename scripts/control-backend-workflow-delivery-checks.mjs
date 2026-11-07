// Actual Auth/REST/Edge contract checks, executed only inside the exact-owned disposable backend.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_WORKFLOW_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:4,statement_timeout:15000,connectionTimeoutMillis:5000,application_name:'owned-delivery-workflow-'+input.run});
const checks=[],races=[];let serial=0;
async function call(path,token,body,method=body===undefined?'GET':'POST'){
  const r=await fetch('http://127.0.0.1:8000'+path,{method,signal:AbortSignal.timeout(20000),headers:{
    apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
async function login(u){
  const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:u.email,password:u.password});
  assert.equal(r.status,200);u.token=r.data.access_token;u.sessionId=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url')).session_id;
}
async function account(label){
  const u={email:'delivery-'+input.run+'-'+label+'@roomqc.invalid',password:randomBytes(32).toString('hex')};
  const r=await call('/auth/v1/admin/users',input.serviceKey,{email:u.email,password:u.password,email_confirm:true});
  assert.equal(r.status,200);u.id=r.data.id;await login(u);return u;
}
async function insert(table,body){const r=await call('/rest/v1/'+table,input.serviceKey,body);assert.equal(r.status,201,'Fixture '+table);return r.data[0]}
async function owner(label){
  const u=await account(label),r=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{
    p_workspace_id:randomUUID(),p_owner_id:u.id,p_fields:{fullName:'Owned delivery fixture',phone:'0901234567',
      tenantName:'Owned delivery fixture',hotelName:'Owned delivery fixture',hotelAddress:'123 Fixture Road',
      hotelPhone:'0281234567',hotelEmail:u.email,totalRooms:3}});
  assert.equal(r.status,200);assert.equal(r.data.success,true);return{...u,tenantId:r.data.tenant_id,hotelId:r.data.hotel_id};
}
async function room(a,hotelId,label){return insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:hotelId,
  room_number:label,room_type:'standard',floor:1,status:'vacant_clean'});}
async function source(a,hotelId,roomId,actor,complete=true){
  const orderId=randomUUID(),stopId=randomUUID();
  await db.query(`INSERT INTO public.distribution_orders(id,tenant_id,hotel_id,order_code,created_by,assigned_to,status)
    VALUES($1,$2,$3,$4,$5,$6,'in_progress')`,[orderId,a.tenantId,hotelId,'K-'+input.run+'-'+(++serial),a.id,actor.id]);
  await db.query(`INSERT INTO public.distribution_order_rooms(id,distribution_order_id,room_id,status,stop_status)
    VALUES($1,$2,$3,'pending','pending')`,[stopId,orderId,roomId]);
  await db.query("UPDATE public.distribution_order_batches SET status='received' WHERE distribution_order_id=$1",[orderId]);
  if(complete){
    const r=await call('/rest/v1/rpc/deliver_stop',actor.token,{p_stop_id:stopId,p_actor_id:actor.id});
    assert.equal(r.status,200);assert.equal(r.data.success,true);
  }
  return{stopId,orderId,roomId,hotelId};
}
const invoke=(u,s)=>call('/rest/v1/rpc/complete_delivery_workflow',u.token,{p_stop_id:s.stopId});
function record(label,passed,details={}){checks.push({label,passed,...details});}
async function snapshot(){return(await db.query(`SELECT jsonb_build_object(
  'tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.housekeeping_tasks t),
  'results',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY stop_id,delivered_at),'[]') FROM private.workflow_delivery_results r)
  )::text AS value`)).rows[0].value;}
async function denied(label,u,s,statuses=[401,403]){
  const before=await snapshot(),r=await invoke(u,s);
  record(label,statuses.includes(r.status)&&before===await snapshot(),{status:r.status,effectsUnchanged:before===await snapshot()});
}
async function waitOnLock(){
  const end=Date.now()+6000;
  while(Date.now()<end){
    const r=await db.query(`SELECT count(*) AS n FROM pg_stat_activity WHERE pid<>pg_backend_pid()
      AND state='active' AND wait_event_type='Lock' AND query LIKE '%complete_delivery_workflow%'`);
    if(Number(r.rows[0].n)>0)return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('NATIVE_LOCK_BARRIER_NOT_OBSERVED');
}
try{
  const a=await owner('owner-a'),b=await owner('owner-b'),staff=await account('staff');
  await insert('users',{id:staff.id,email:staff.email,full_name:'Owned delivery staff',tenant_id:a.tenantId,
    hotel_id:a.hotelId,role:'staff',user_level_code:'staff',status:'active',created_by:a.id,
    must_change_password:false,account_locked:false});
  await insert('user_roles',{user_id:staff.id,role:'staff'});
  await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
  const other=await insert('hotels',{id:randomUUID(),tenant_id:a.tenantId,name:'Owned other hotel',address:'123 Fixture Road',status:'active'});
  const r1=await room(a,a.hotelId,'K101'),r2=await room(a,other.id,'K201');
  const schemaDeadline=Date.now()+10000;
  while(true){
    const readiness=await invoke(a,{stopId:randomUUID()});
    if(readiness.status===403&&readiness.data?.message==='WORKFLOW_SOURCE_NOT_ALLOWED')break;
    assert.ok(Date.now()<schemaDeadline&&readiness.data?.code==='PGRST202','Migrated RPC schema must become ready');
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  const first=await source(a,a.hotelId,r1.id,a),positive=await invoke(a,first);
  const task=(await db.query('SELECT * FROM public.housekeeping_tasks WHERE distribution_order_room_id=$1',[first.stopId])).rows;
  record('owner-canonical-source-creates-one-task',positive.status===200&&positive.data?.executed===1&&task.length===1,
    {status:positive.status,taskCount:task.length});
  record('task-fields-derived-from-database',task[0]?.room_id===r1.id&&task[0]?.hotel_id===a.hotelId
    &&task[0]?.title==='Xác nhận nhận hàng - P.K101'&&task[0]?.description?.endsWith('0 sản phẩm'));
  const twenty=await Promise.all(Array.from({length:20},()=>invoke(a,first)));
  const counts=(await db.query(`SELECT (SELECT count(*) FROM public.housekeeping_tasks WHERE distribution_order_room_id=$1) AS tasks,
    (SELECT count(*) FROM private.workflow_delivery_results WHERE stop_id=$1) AS receipts`,[first.stopId])).rows[0];
  record('twenty-concurrent-replays-have-one-durable-result',twenty.every(x=>x.status===200&&x.data?.task_id===positive.data?.task_id)
    &&Number(counts.tasks)===1&&Number(counts.receipts)===1,{requests:20,tasks:Number(counts.tasks),receipts:Number(counts.receipts)});
  await denied('foreign-tenant',b,first);
  await denied('staff-other-hotel',staff,await source(a,other.id,r2.id,a));
  await denied('staff-unassigned-route',staff,first);
  const assigned=await source(a,a.hotelId,r1.id,staff),staffPositive=await invoke(staff,assigned);
  record('assigned-staff-needs-delivery-authority-not-housekeeping-grant',staffPositive.status===200&&staffPositive.data?.executed===1,{status:staffPositive.status});
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
  await denied('locked-owner-cannot-read-replay-or-write',a,first);
  await db.query("UPDATE public.users SET account_locked=false,status='inactive' WHERE id=$1",[a.id]);
  await denied('inactive-owner',a,first);
  await db.query("UPDATE public.users SET status='active' WHERE id=$1",[a.id]);
  await denied('uncompleted-source',a,await source(a,a.hotelId,r1.id,a,false),[400]);
  await denied('unknown-source',a,{stopId:randomUUID()});
  await denied('service-key-is-not-a-live-user-session',{token:input.serviceKey},first);
  await denied('anonymous-cannot-execute',{token:input.publishableKey},first,[401,403]);
  const faulty=await source(a,a.hotelId,r1.id,a),beforeFault=await snapshot();
  await db.query(`CREATE FUNCTION private.kernel_receipt_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS
    $$BEGIN RAISE EXCEPTION 'OWNED_RECEIPT_FAULT' USING ERRCODE='PT500'; END$$;
    CREATE TRIGGER owned_kernel_receipt_fault BEFORE INSERT ON private.workflow_delivery_results
      FOR EACH ROW EXECUTE FUNCTION private.kernel_receipt_fault()`);
  try{const failed=await invoke(a,faulty);record('receipt-fault-rolls-back-task-and-result',failed.status===500&&await snapshot()===beforeFault,{status:failed.status});}
  finally{await db.query('DROP TRIGGER owned_kernel_receipt_fault ON private.workflow_delivery_results; DROP FUNCTION private.kernel_receipt_fault()');}
  const retry=await invoke(a,faulty);record('same-source-recovers-after-receipt-fault',retry.status===200&&retry.data?.executed===1,{status:retry.status});
  const expiry=await source(a,a.hotelId,r1.id,a),expiryBefore=await snapshot(),lock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=$1",[a.sessionId]);
    await lock.query('BEGIN');await lock.query('SELECT id FROM public.distribution_order_rooms WHERE id=$1 FOR UPDATE',[expiry.stopId]);
    const pending=invoke(a,expiry);await waitOnLock();await db.query('SELECT pg_sleep(2.1)');await lock.query('COMMIT');
    const result=await pending,passed=result.status===403&&await snapshot()===expiryBefore;
    record('session-expiry-after-source-lock-wait',passed,{status:result.status,realLockBarrier:true,effectsUnchanged:await snapshot()===expiryBefore});
    races.push({label:'source-lock-session-expiry',passed,realLockBarrier:true});
  }finally{await lock.query('ROLLBACK');lock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  for(const kind of ['lock','membership','logout']){
    const actor=kind==='membership'?staff:a,s=await source(a,a.hotelId,r1.id,actor),before=await snapshot(),c=await db.connect();
    try{
      await c.query('BEGIN');await c.query('SELECT id FROM auth.users WHERE id=$1 FOR UPDATE',[actor.id]);
      const pending=invoke(actor,s);await waitOnLock();
      if(kind==='lock')await c.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]);
      if(kind==='membership')await c.query('DELETE FROM public.user_hotels WHERE user_id=$1',[actor.id]);
      if(kind==='logout')await c.query('DELETE FROM auth.sessions WHERE id=$1',[actor.sessionId]);
      await c.query('COMMIT');const result=await pending,passed=result.status===403&&await snapshot()===before;
      record('revocation-commits-before-actor-lock-'+kind,passed,{status:result.status,realLockBarrier:true,effectsUnchanged:await snapshot()===before});
      races.push({label:'actor-lock-'+kind,passed,realLockBarrier:true});
    }finally{await c.query('ROLLBACK');c.release();}
    if(kind==='lock')await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
    if(kind==='membership')await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
    if(kind==='logout')await login(a);
  }
  const legacy=await source(a,a.hotelId,r1.id,a);
  const oldTask=await insert('housekeeping_tasks',{tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:r1.id,
    distribution_order_room_id:legacy.stopId,task_type:'delivery_confirmation',title:'Existing task',status:'pending'});
  const adopted=await invoke(a,legacy);
  record('legacy-one-result-is-adopted-without-duplicate',adopted.status===200&&adopted.data?.legacy_adopted===true&&adopted.data?.task_id===oldTask.id,{status:adopted.status});
  const duplicate=await source(a,a.hotelId,r1.id,a);
  for(let i=0;i<2;i++)await insert('housekeeping_tasks',{tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:r1.id,
    distribution_order_room_id:duplicate.stopId,task_type:'delivery_confirmation',title:'Existing duplicate',status:'pending'});
  await denied('legacy-duplicates-require-review',a,duplicate,[409]);
  const privateChecks=[];
  for(const role of ['anon','authenticated','service_role']){
    const c=await db.connect();try{
      await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);
      let denied=false;try{await c.query('SELECT * FROM private.workflow_delivery_results')}catch(e){denied=e.code==='42501'}
      privateChecks.push({role,denied});
    }finally{await c.query('ROLLBACK');c.release();}
  }
  record('private-result-table-has-no-browser-or-service-read-path',privateChecks.every(x=>x.denied),{roles:privateChecks});
  async function sourceSnapshot(){return(await db.query(`SELECT jsonb_build_object(
    'orders',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM public.distribution_orders o),
    'stops',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM public.distribution_order_rooms s),
    'transactions',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.inventory_transactions t),
    'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM public.items i),
    'sources',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM private.workflow_delivery_sources s)
    )::text AS value`)).rows[0].value;}
  const sourceBaseline=await source(a,a.hotelId,r1.id,a,false),sourceBefore=await sourceSnapshot();
  const sourceExploit=await call('/rest/v1/rpc/deliver_stop',b.token,{p_stop_id:sourceBaseline.stopId,p_actor_id:a.id});
  const sourceUnchanged=await sourceSnapshot()===sourceBefore;
  const sourceCommandBaseline={label:'guarded-deliver-stop-foreign-token-with-owner-actor',
    expectedStatus:[401,403],status:sourceExploit.status,effectsUnchanged:sourceUnchanged,
    findingObserved:![401,403].includes(sourceExploit.status)||!sourceUnchanged,guardedProduct:true};
  record('source-command-foreign-actor-spoof-denied',[401,403].includes(sourceExploit.status)&&sourceUnchanged,{status:sourceExploit.status,effectsUnchanged:sourceUnchanged});
  for(const kind of ['unassigned','locked','inactive']){
    const s=await source(a,a.hotelId,r1.id,a,false),actor=kind==='unassigned'?staff:a;
    if(kind==='locked')await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
    if(kind==='inactive')await db.query("UPDATE public.users SET status='inactive' WHERE id=$1",[a.id]);
    const before=await sourceSnapshot(),result=await call('/rest/v1/rpc/deliver_stop',actor.token,{p_stop_id:s.stopId,p_actor_id:actor.id});
    record('source-command-'+kind+'-denied',result.status===403&&await sourceSnapshot()===before,{status:result.status,effectsUnchanged:await sourceSnapshot()===before});
    if(kind==='locked')await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
    if(kind==='inactive')await db.query("UPDATE public.users SET status='active' WHERE id=$1",[a.id]);
  }
  const parallelSource=await source(a,a.hotelId,r1.id,a,false);
  const sourceReplays=await Promise.all(Array.from({length:20},()=>call('/rest/v1/rpc/deliver_stop',a.token,{p_stop_id:parallelSource.stopId,p_actor_id:a.id})));
  const sourceCounts=(await db.query(`SELECT
    (SELECT count(*) FROM private.workflow_delivery_sources WHERE stop_id=$1) AS sources,
    (SELECT rooms_completed FROM public.distribution_orders WHERE id=$2) AS completed`,[parallelSource.stopId,parallelSource.orderId])).rows[0];
  record('source-command-twenty-replays-one-transition-and-witness',sourceReplays.every(x=>x.status===200&&x.data?.workflow_source_id===sourceReplays[0].data?.workflow_source_id)
    &&Number(sourceCounts.sources)===1&&Number(sourceCounts.completed)===1,
    {requests:20,sources:Number(sourceCounts.sources),completed:Number(sourceCounts.completed)});
  const faultSource=await source(a,a.hotelId,r1.id,a,false);
  const fixtureItem=await insert('items',{tenant_id:a.tenantId,hotel_id:a.hotelId,code:'K-STOCK-'+input.run,
    name:'Owned source rollback stock',unit:'piece',quantity_total:20,quantity_in_stock:10,quantity_in_use:10});
  await insert('distribution_order_items',{distribution_order_room_id:faultSource.stopId,item_id:fixtureItem.id,quantity:2});
  const beforeSourceFault=await sourceSnapshot();
  await db.query(`CREATE FUNCTION private.kernel_source_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS
    $$BEGIN RAISE EXCEPTION 'OWNED_SOURCE_FAULT' USING ERRCODE='PT500'; END$$;
    CREATE TRIGGER owned_kernel_source_fault BEFORE INSERT ON private.workflow_delivery_sources
      FOR EACH ROW EXECUTE FUNCTION private.kernel_source_fault()`);
  try{
    const result=await call('/rest/v1/rpc/deliver_stop',a.token,{p_stop_id:faultSource.stopId,p_actor_id:a.id});
    record('source-witness-fault-rolls-back-business-transition',result.status===500&&await sourceSnapshot()===beforeSourceFault,
      {status:result.status,effectsUnchanged:await sourceSnapshot()===beforeSourceFault});
  }finally{await db.query('DROP TRIGGER owned_kernel_source_fault ON private.workflow_delivery_sources; DROP FUNCTION private.kernel_source_fault()');}
  const sourceRecovery=await call('/rest/v1/rpc/deliver_stop',a.token,{p_stop_id:faultSource.stopId,p_actor_id:a.id});
  record('source-command-recovers-after-witness-fault',sourceRecovery.status===200&&sourceRecovery.data?.success===true,{status:sourceRecovery.status});
  const stock=(await db.query('SELECT quantity_total,quantity_in_use FROM public.items WHERE id=$1',[fixtureItem.id])).rows[0];
  const transactions=Number((await db.query('SELECT count(*) FROM public.inventory_transactions WHERE related_id=$1',[faultSource.stopId])).rows[0].count);
  record('source-stock-and-ledger-applied-once-after-recovery',Number(stock.quantity_total)===18&&Number(stock.quantity_in_use)===8&&transactions===1,
    {quantityTotal:Number(stock.quantity_total),quantityInUse:Number(stock.quantity_in_use),transactions});
  const fabricated=await source(a,a.hotelId,r1.id,a,false);
  await db.query("UPDATE public.distribution_order_rooms SET status='delivered',stop_status='delivered',delivered_at=clock_timestamp(),delivered_by=$2 WHERE id=$1",[fabricated.stopId,a.id]);
  await denied('raw-row-without-canonical-source-witness',a,fabricated,[409]);
  const privateCalls=[];
  for(const role of ['anon','authenticated','service_role']){
    const c=await db.connect();try{
      await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);
      let blocked=false;try{await c.query('SELECT private.deliver_stop($1,$2)',[fabricated.stopId,a.id])}catch(e){blocked=e.code==='42501'}
      privateCalls.push({role,denied:blocked});
    }finally{await c.query('ROLLBACK');c.release();}
  }
  record('unchecked-source-function-cannot-be-called-directly',privateCalls.every(x=>x.denied),{roles:privateCalls});

  // The Edge instance has only URL + anon key. Every delivery operation must
  // forward the real caller; the original general engine is outside this suite.
  async function edge(token,body,{method='POST',raw=false}={}){
    const response=await fetch('http://workflow-delivery-test:9000/',{method,signal:AbortSignal.timeout(20000),headers:{
      ...(token===null?{}:{authorization:'Bearer '+token}),'content-type':'application/json'},
      ...(method==='GET'||method==='OPTIONS'?{}:{body:raw?body:JSON.stringify(body)})});
    let data;try{data=await response.json()}catch{data=null}
    return{status:response.status,data,noStore:response.headers.get('cache-control')==='no-store'};
  }
  const payload=(s,extra={})=>({trigger_type:'delivery_stop_completed',tenant_id:a.tenantId,hotel_id:s.hotelId,
    event_data:{room_order_id:s.stopId},...extra});
  async function edgeDenied(label,token,body,statuses=[401,403],options){
    const before=await snapshot(),business=await sourceSnapshot(),response=await edge(token,body,options);
    const unchanged=before===await snapshot()&&business===await sourceSnapshot();
    record('edge-'+label,statuses.includes(response.status)&&unchanged,
      {status:response.status,effectsUnchanged:unchanged});
    return response;
  }
  const edgeSource=await source(a,a.hotelId,r1.id,a);
  const forged=payload(edgeSource,{event_data:{room_order_id:edgeSource.stopId,room_id:r2.id,
    room_number:'FORGED',order_code:'FORGED',item_count:999,hotel_id:other.id,tenant_id:b.tenantId}});
  const edgeResult=await edge(a.token,forged);
  const edgeTask=(await db.query('SELECT * FROM public.housekeeping_tasks WHERE distribution_order_room_id=$1',[edgeSource.stopId])).rows;
  record('edge-actual-owner-without-elevated-runtime-key',edgeResult.status===200&&edgeResult.noStore&&edgeTask.length===1,
    {status:edgeResult.status,taskCount:edgeTask.length,noStore:edgeResult.noStore});
  record('edge-forged-label-room-count-and-scope-hints-ignored',edgeTask[0]?.room_id===r1.id&&edgeTask[0]?.hotel_id===a.hotelId
    &&edgeTask[0]?.tenant_id===a.tenantId&&edgeTask[0]?.title==='Xác nhận nhận hàng - P.K101'
    &&edgeTask[0]?.description?.endsWith('0 sản phẩm'));
  const edgeReplays=await Promise.all(Array.from({length:20},()=>edge(a.token,payload(edgeSource))));
  const edgeCounts=(await db.query('SELECT (SELECT count(*) FROM public.housekeeping_tasks WHERE distribution_order_room_id=$1) AS tasks, (SELECT count(*) FROM private.workflow_delivery_results WHERE stop_id=$1) AS receipts',[edgeSource.stopId])).rows[0];
  record('edge-twenty-retries-return-one-durable-result',edgeReplays.every(r=>r.status===200&&r.data?.task_id===edgeResult.data?.task_id)
    &&Number(edgeCounts.tasks)===1&&Number(edgeCounts.receipts)===1,
    {requests:20,tasks:Number(edgeCounts.tasks),receipts:Number(edgeCounts.receipts)});
  await edgeDenied('foreign-tenant',b.token,payload(edgeSource));
  await edgeDenied('staff-other-hotel',staff.token,payload(await source(a,other.id,r2.id,a)));
  await edgeDenied('staff-unassigned-route',staff.token,payload(edgeSource));
  const edgeAssigned=await source(a,a.hotelId,r1.id,staff),edgeStaff=await edge(staff.token,payload(edgeAssigned));
  record('edge-assigned-staff-positive',edgeStaff.status===200&&edgeStaff.data?.executed===1,{status:edgeStaff.status});
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
  await edgeDenied('locked-owner-replay',a.token,payload(edgeSource));
  await db.query("UPDATE public.users SET account_locked=false,status='inactive' WHERE id=$1",[a.id]);
  await edgeDenied('inactive-owner',a.token,payload(edgeSource));
  await db.query("UPDATE public.users SET status='active' WHERE id=$1",[a.id]);
  const priorToken=a.token,logout=await call('/auth/v1/logout',a.token,{});
  assert.ok([200,204].includes(logout.status),'Actual Auth logout must succeed');
  await edgeDenied('actual-logout-old-token',priorToken,payload(edgeSource));await login(a);
  await edgeDenied('service-key-not-a-user',input.serviceKey,payload(edgeSource));
  await edgeDenied('anonymous-key',input.publishableKey,payload(edgeSource));
  await edgeDenied('missing-bearer',null,payload(edgeSource),[401]);
  await edgeDenied('invalid-bearer','invalid',payload(edgeSource),[401]);
  await edgeDenied('wrong-expected-tenant',a.token,payload(edgeSource,{tenant_id:b.tenantId}),[403]);
  await edgeDenied('wrong-expected-hotel',a.token,payload(edgeSource,{hotel_id:other.id}),[403]);
  const scopeBefore=await snapshot(),badScope=await call('/rest/v1/rpc/complete_delivery_workflow',a.token,{
    p_stop_id:edgeSource.stopId,p_tenant_id:a.tenantId,p_hotel_id:other.id});
  record('rpc-wrong-expected-scope',badScope.status===403&&scopeBefore===await snapshot(),{status:badScope.status});
  await edgeDenied('legacy-source-needs-review',a.token,payload(fabricated),[409]);
  const configuredSource=await source(a,a.hotelId,r1.id,a);
  const workflow=await insert('workflows',{tenant_id:a.tenantId,name:'Owned configured delivery workflow',
    trigger_type:'event',trigger_event:'delivery_stop_completed',status:'active',created_by:a.id});
  try{
    const result=await edgeDenied('configured-engine-is-explicit-review',a.token,payload(configuredSource),[409]);
    record('edge-configured-engine-does-not-silently-fallback',result.data?.code==='WORKFLOW_REQUIRES_REVIEW');
  }finally{await db.query('DELETE FROM public.workflows WHERE id=$1',[workflow.id]);}
  for(const [label,body]of [['missing-source',payload(edgeSource,{event_data:{}})],
    ['invalid-source',payload(edgeSource,{event_data:{room_order_id:'invalid'}})],
    ['invalid-tenant',payload(edgeSource,{tenant_id:'invalid'})],['null-event',payload(edgeSource,{event_data:null})],
    ['null-body',null],['array-body',[]]])await edgeDenied(label,a.token,body,[400]);
  await edgeDenied('invalid-json',a.token,'{',[400],{raw:true});
  await edgeDenied('get-method',a.token,undefined,[405],{method:'GET'});
  const options=await edge(null,undefined,{method:'OPTIONS'});
  record('edge-options-preflight',options.status===200,{status:options.status});
  // Temporary fault is removed in finally; replay over Edge must read the same
  // source and must never report success when the transaction failed.
  const edgeFault=await source(a,a.hotelId,r1.id,a);
  await db.query("CREATE FUNCTION private.edge_receipt_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'OWNED_EDGE_RECEIPT_FAULT' USING ERRCODE='PT500'; END$$; CREATE TRIGGER owned_edge_receipt_fault BEFORE INSERT ON private.workflow_delivery_results FOR EACH ROW EXECUTE FUNCTION private.edge_receipt_fault()");
  try{
    const fault=await edgeDenied('receipt-fault-safe-unknown',a.token,payload(edgeFault),[503]);
    record('edge-unknown-result-has-no-raw-database-error',fault.data?.code==='WORKFLOW_RESULT_UNKNOWN'
      &&!JSON.stringify(fault.data).includes('OWNED_EDGE_RECEIPT_FAULT')&&fault.noStore);
  }finally{await db.query('DROP TRIGGER owned_edge_receipt_fault ON private.workflow_delivery_results; DROP FUNCTION private.edge_receipt_fault()');}
  const recovered=await edge(a.token,payload(edgeFault));
  record('edge-retry-after-atomic-fault-recovers',recovered.status===200&&recovered.data?.executed===1,{status:recovered.status});
  const edgeExpiry=await source(a,a.hotelId,r1.id,a),edgeBefore=await snapshot(),edgeLock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=$1",[a.sessionId]);
    await edgeLock.query('BEGIN');await edgeLock.query('SELECT id FROM public.distribution_order_rooms WHERE id=$1 FOR UPDATE',[edgeExpiry.stopId]);
    const pending=edge(a.token,payload(edgeExpiry));await waitOnLock();await db.query('SELECT pg_sleep(2.1)');await edgeLock.query('COMMIT');
    const result=await pending,passed=result.status===403&&await snapshot()===edgeBefore;
    record('edge-session-expires-during-real-source-lock',passed,{status:result.status,realLockBarrier:true,effectsUnchanged:await snapshot()===edgeBefore});
    races.push({label:'edge-source-lock-session-expiry',passed,realLockBarrier:true});
  }finally{await edgeLock.query('ROLLBACK');edgeLock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  console.log(JSON.stringify({verified:checks.every(x=>x.passed),checks,races,sourceCommandBaseline,
    actualAuth:true,actualRest:true,actualEdge:true,sourceTransitionsViaGuardedRpc:true,canonicalSourceWitness:true,
    externalProvider:false,generalWorkflowEngineImplemented:false,asyncDispatcherImplemented:false,productAcceptance:false,
    aclFixture:{id:a.id,sessionId:a.sessionId}}));
}finally{await db.end()}

