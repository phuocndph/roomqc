// Exact-owned full-vendor fixture only. Real RPCs and actual Edge worker;
// no scheduler, provider, published port or connection to a business project.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_LIFECYCLE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
const origin='http://127.0.0.1:8000',checks=[],races=[],fixtures=new Set(),relayCalls=[];
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:6,statement_timeout:12000,connectionTimeoutMillis:5000,options:'-c timezone=UTC',application_name:'owned-lifecycle-'+input.run});
let phase='fixtures',loseBatch=false,loseFinish=false,lostBatch=false,lostFinish=false;
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'lifecycle_checks_failed',phase,checks,races})+'\n'));
const q=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const mark=label=>checks.push(label),scope=ids=>({kind:'tenants',tenant_ids:[...ids].sort()});
async function call(name,body,token=input.serviceKey,{path='/rest/v1/rpc/'+name}={}){
  const r=await fetch(origin+path,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return {status:r.status,data};
}
async function good(name,body,label){const r=await call(name,body);if(r.status!==200)process.stderr.write(JSON.stringify({event:'lifecycle_rpc_mismatch',name,status:r.status,code:r.data?.code})+'\n');
  assert.equal(r.status,200,label);if(label)mark(label);return r.data;}
async function denied(name,body,code,label,token=input.serviceKey){const r=await call(name,body,token);
  assert.ok([400,401,403,409].includes(r.status)&&r.data?.code===code,label);mark(label);return r;}
const beginArgs=(run,ids)=>({p_run_id:run,p_scope:scope(ids)});
const batchArgs=(run,request,index,limit=2)=>({p_run_id:run,p_request_id:request,p_expected_batch_index:index,p_limit:limit});
const finishArgs=(run,unknown=false)=>({p_run_id:run,p_outcome_unknown:unknown});
const begin=(run,ids)=>good('begin_atomic_subscription_status_run',beginArgs(run,ids));
const batch=(run,request,index,limit=2)=>good('process_subscription_lifecycle_batch',batchArgs(run,request,index,limit));
const finish=(run,unknown=false)=>good('finish_atomic_subscription_status_run',finishArgs(run,unknown));
const tables=['public.tenants','public.users','public.staff_status','public.in_app_notifications','public.invoices','public.payment_transactions',
  'private.subscription_quotes','private.subscription_checkout_drafts','private.subscription_status_job_runs',
  'private.subscription_status_job_recoveries','private.subscription_lifecycle_progress','private.subscription_lifecycle_commands',
  'private.subscription_lifecycle_batch_receipts','private.subscription_lifecycle_notification_outbox'];
async function snapshot(selected=tables){return (await db.query('SELECT jsonb_build_object('+selected.map(t=>"'"+t+"',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+t+' r)').join(',')+') AS value')).rows[0].value;}
const same=async(before,label,selected)=>{assert.deepEqual(await snapshot(selected),before,label);mark(label)};
const state=async id=>(await db.query('SELECT subscription_status FROM public.tenants WHERE id=$1',[id])).rows[0].subscription_status;
const count=async(table,run)=>(await db.query('SELECT count(*)::integer AS n FROM '+table+' WHERE run_id=$1',[run])).rows[0].n;
async function account(label){const email='life-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const r=await call('',{email,password,email_confirm:true},input.serviceKey,{path:'/auth/v1/admin/users'});assert.equal(r.status,200);
  const auth=await call('',{email,password},input.publishableKey,{path:'/auth/v1/token?grant_type=password'});assert.equal(auth.status,200);
  return {id:r.data.id,email,token:auth.data.access_token};}
async function owner(label){const a=await account(label),r=await good('provision_workspace_registration',{p_workspace_id:randomUUID(),p_owner_id:a.id,
  p_fields:{fullName:'Owned lifecycle fixture',phone:'0901234567',tenantName:'Owned lifecycle fixture',hotelName:'Owned lifecycle fixture',
    hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:3}});
  assert.equal(r.success,true);fixtures.add(r.tenant_id);return {...a,tenantId:r.tenant_id,hotelId:r.hotel_id};}
async function expired(a,status='active',grace='future'){
  // The real BEFORE trigger derives grace from the changed end date. Never
  // override/disable it: yesterday is still IN grace; ten days ago is expired.
  assert.ok(['past','future'].includes(grace));
  const days=grace==='past'?10:1;
  await db.query('UPDATE public.tenants SET subscription_status=$2,subscription_end_date=current_date-$3::integer WHERE id=$1',[a.tenantId,status,days]);
  const r=await db.query(`SELECT subscription_status,subscription_end_date=current_date-$2::integer AS end_matches,
    grace_period_ends_at=(subscription_end_date::date+interval '7 days')::timestamptz AS trigger_matches,
    grace_period_ends_at<clock_timestamp() AS grace_expired FROM public.tenants WHERE id=$1`,[a.tenantId,days]);
  assert.equal(r.rowCount,1);assert.equal(r.rows[0].subscription_status,status);
  assert.equal(r.rows[0].end_matches,true);assert.equal(r.rows[0].trigger_matches,true);
  assert.equal(r.rows[0].grace_expired,grace==='past');mark('fixture-grace-postcondition-'+status+'-'+grace);
}
async function complete(run,index=0){let receipt;for(let i=0;i<100;i++){receipt=await batch(run,randomUUID(),index++);if(receipt.done)return receipt;}throw new Error('Fixture batch limit exceeded');}
async function edge(body,headers={}){const r=await fetch('http://lifecycle-test:9000/',{method:'POST',signal:AbortSignal.timeout(65000),headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return {status:r.status,data};}
const server=createServer(async(req,res)=>{
  try{
    assert.equal(req.method,'POST');assert.match(req.url,/^\/rest\/v1\/rpc\/(begin_atomic_subscription_status_run|process_subscription_lifecycle_batch|finish_atomic_subscription_status_run)$/);
    assert.equal(req.headers.authorization,'Bearer '+input.serviceKey);
    const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;assert.ok(size<=16384);parts.push(chunk)}
    const body=Buffer.concat(parts),args=JSON.parse(body.toString()),name=req.url.split('/').at(-1);
    relayCalls.push({name,run:args.p_run_id,request:args.p_request_id??null,index:args.p_expected_batch_index??null});
    const upstream=await fetch(origin+req.url,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:input.publishableKey,
      authorization:'Bearer '+input.serviceKey,'content-type':'application/json'},body});
    const response=Buffer.from(await upstream.arrayBuffer());
    // Drop only AFTER a real HTTP 200 and a committed durable DB receipt.
    if(upstream.status===200&&name==='process_subscription_lifecycle_batch'&&loseBatch&&!lostBatch){
      assert.equal(await count('private.subscription_lifecycle_batch_receipts',args.p_run_id),1);lostBatch=true;res.writeHead(502);res.end('{}');return;}
    if(upstream.status===200&&name==='finish_atomic_subscription_status_run'&&loseFinish&&!lostFinish){
      assert.ok((await db.query('SELECT summary FROM private.subscription_status_job_runs WHERE id=$1',[args.p_run_id])).rows[0].summary);
      lostFinish=true;res.writeHead(502);res.end('{}');return;}
    res.writeHead(upstream.status,{'content-type':'application/json'});res.end(response);
  }catch{if(!res.headersSent)res.writeHead(502);res.end('{"error":"OWNED_RELAY_FAILURE"}')}
});
async function waitForLock(pid){for(let n=0;n<100;n++){
  const r=await db.query("SELECT wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0 AS waiting FROM pg_stat_activity WHERE pid=$1",[pid]);
  if(r.rows[0]?.waiting)return;await new Promise(r=>setTimeout(r,25));}throw new Error('Actual fixture lock overlap was not observed');}
async function tenantRace(a,run,index,{renew=false,expire=false}={}){
  const holder=await db.connect(),waiter=await db.connect(),pid=(await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let result,pending;
  try{
    if(expire)await db.query("WITH anchor AS (SELECT clock_timestamp() AS n) UPDATE private.subscription_status_job_runs SET started_at=anchor.n-interval '14 minutes 58 seconds',deadline_at=anchor.n+interval '2 seconds' FROM anchor WHERE id=$1",[run]);
    await holder.query('BEGIN');await holder.query('SELECT id FROM public.tenants WHERE id=$1 FOR UPDATE',[a.tenantId]);
    pending=waiter.query("SELECT public.process_subscription_lifecycle_batch($1,$2,$3,2) AS receipt",[run,randomUUID(),index]).then(r=>({receipt:r.rows[0].receipt}),e=>({code:e.code}));
    await waitForLock(pid);
    if(renew)await holder.query("UPDATE public.tenants SET subscription_end_date=current_date+30,grace_period_ends_at=clock_timestamp()+interval '35 days' WHERE id=$1",[a.tenantId]);
    if(expire){let crossed=false;for(let n=0;n<150;n++){if((await db.query('SELECT deadline_at<=clock_timestamp() AS passed FROM private.subscription_status_job_runs WHERE id=$1',[run])).rows[0].passed){crossed=true;break;}await new Promise(r=>setTimeout(r,25));}assert.equal(crossed,true);}
    await holder.query('COMMIT');result=await pending;
    races.push({kind:renew?'renewal-before-transition':'deadline-during-row-lock',actualLockWait:true,...(result.code?{sqlstate:result.code}:{processed:result.receipt.processed})});return result;
  }finally{await holder.query('ROLLBACK').catch(()=>{});if(pending)await pending;holder.release();waiter.release();}
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(9081,'0.0.0.0',resolve)});
  const a=await owner('active'),t=await owner('trial'),g=await owner('grace'),control=await owner('control'),today=await owner('today');
  // A real owner creates a non-payable draft through product RPCs. All four
  // financial snapshots below therefore cover actual rows, not empty tables.
  const quote=await call('create_subscription_quote',{p_request_id:randomUUID(),p_kind:'extend',p_rooms:3,p_duration_days:30},a.token);
  assert.equal(quote.status,200);
  const draft=await call('create_subscription_checkout_draft',{p_quote_id:quote.data.quote_id,p_request_id:randomUUID()},a.token);
  assert.equal(draft.status,200);assert.equal(draft.data.non_payable,true);assert.equal(draft.data.checkout_enabled,false);
  const finance=['public.invoices','public.payment_transactions','private.subscription_quotes','private.subscription_checkout_drafts'];
  const financialFixtureRows={};for(const table of finance){const n=(await db.query('SELECT count(*)::integer AS n FROM '+table+' WHERE tenant_id=$1',[a.tenantId])).rows[0].n;
    assert.equal(n,1);financialFixtureRows[table]=n;}mark('financial-fixture-nonempty-four-tables');
  for(const [u,s,p]of [[a,'active','future'],[t,'trial','future'],[g,'grace_period','past'],[control,'active','future']])await expired(u,s,p);
  await db.query('UPDATE public.tenants SET subscription_end_date=current_date WHERE id=$1',[today.tenantId]);
  assert.equal((await db.query("SELECT subscription_status='trial' AND subscription_end_date=current_date AND grace_period_ends_at>=clock_timestamp() AS valid FROM public.tenants WHERE id=$1",[today.tenantId])).rows[0].valid,true);
  mark('fixture-current-date-postcondition');
  const employee=await account('staff');await db.query("INSERT INTO public.users(id,tenant_id,hotel_id,full_name,email,status,role,user_level_code,created_by) VALUES($1,$2,$3,'Owned lifecycle staff',$4,'active','staff','staff',$5)",[employee.id,a.tenantId,a.hotelId,employee.email,a.id]);
  const admin=await account('recovery-admin');
  for(const [table,body]of [['users',{id:admin.id,tenant_id:control.tenantId,hotel_id:control.hotelId,full_name:'Owned lifecycle recovery admin',email:admin.email,
    status:'active',role:'staff',user_level_code:'super_admin',created_by:control.id,is_super_admin:true,must_change_password:false,account_locked:false}],
    ['user_roles',{user_id:admin.id,role:'super_admin'}],['user_hotels',{user_id:admin.id,hotel_id:control.hotelId,assigned_by:control.id}]]){
    assert.equal((await call('',body,input.serviceKey,{path:'/rest/v1/'+table})).status,201);}
  // Full schema creates staff_status from the user INSERT trigger. Reuse only
  // these owned rows instead of assuming a stripped schema's empty table.
  const staffA=await db.query("UPDATE public.staff_status SET status='available',last_seen_at=now()-interval '1 hour' WHERE user_id=$1 AND tenant_id=$2 RETURNING id",[a.id,a.tenantId]);
  const staffControl=await db.query("UPDATE public.staff_status SET status='busy',last_seen_at=now()-interval '1 hour' WHERE user_id=$1 AND tenant_id=$2 RETURNING id",[control.id,control.tenantId]);
  assert.equal(staffA.rowCount,1);assert.equal(staffControl.rowCount,1);
  const activeStaff=staffA.rows[0].id,controlStaff=staffControl.rows[0].id;
  const financialBefore=await snapshot(finance),dates=(await db.query('SELECT subscription_end_date::text,grace_period_ends_at::text FROM public.tenants WHERE id=$1',[t.tenantId])).rows[0];
  phase='authority-and-invalid-input';
  let before=await snapshot();
  for(const [label,headers]of [['missing',{}],['wrong-cron',{'x-cron-secret':'wrong'}],['owner',{authorization:'Bearer '+a.token}],['staff',{authorization:'Bearer '+employee.token}]]){
    assert.equal((await edge({scope:{kind:'cluster'}},headers)).status,403);mark('edge-'+label+'-denied');}
  await same(before,'unauthorized-edge-no-effects');
  const run=randomUUID(),ids=[a.tenantId,t.tenantId,g.tenantId,today.tenantId];
  for(const [label,token]of [['anon',input.publishableKey],['owner',a.token],['staff',employee.token]])for(const[name,args]of [
    ['begin_atomic_subscription_status_run',beginArgs(run,ids)],['process_subscription_lifecycle_batch',batchArgs(run,randomUUID(),0)],['finish_atomic_subscription_status_run',finishArgs(run)]]){
    await denied(name,args,'42501',label+'-'+name,token);}
  await same(before,'browser-service-rpc-no-effects');
  for(const invalid of [null,{},[],{kind:'tenants',tenant_ids:[]},{kind:'cluster',tenant_ids:[]},{kind:'tenants',tenant_ids:[null]},
    {kind:'tenants',tenant_ids:['bad']},{kind:'tenants',tenant_ids:[a.tenantId,a.tenantId]},{kind:'cluster',extra:true}]){
    await denied('begin_atomic_subscription_status_run',{p_run_id:randomUUID(),p_scope:invalid},'22023','invalid-scope-'+checks.length);}
  await same(before,'invalid-scope-no-effects');
  for(const signature of ['begin_subscription_status_run(uuid)','finish_subscription_status_run(uuid,jsonb)','auto_offline_inactive_staff()','process_expired_subscriptions()']){
    assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed',['service_role','public.'+signature,'EXECUTE'])).rows[0].allowed,false);mark('legacy-service-denied-'+signature);}
  for(const table of tables.filter(t=>t.startsWith('private.subscription_lifecycle_')))for(const role of ['anon','authenticated','service_role']){
    assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).rows[0].allowed,false);mark('private-table-denied-'+role+'-'+table);}
  phase='batch-replay-and-scope';
  assert.equal((await begin(run,ids)).acquired,true);assert.equal((await begin(run,ids)).acquired,false);mark('begin-same-run-durable-replay');
  await denied('begin_atomic_subscription_status_run',beginArgs(run,[control.tenantId]),'PT409','begin-scope-rebind-denied');
  const busy=await begin(randomUUID(),[control.tenantId]);assert.equal(busy.status,'busy');assert.equal(busy.blocked_by,run);mark('overlapping-run-busy');
  const request=randomUUID(),first=await batch(run,request,0);assert.equal(first.processed,2);assert.equal(first.phase,'grace');assert.equal(first.done,false);mark('full-batch-not-scope-complete');
  before=await snapshot();const replay=await Promise.all(Array.from({length:20},()=>batch(run,request,0)));assert.ok(replay.every(r=>JSON.stringify(r)===JSON.stringify(first)));
  await same(before,'twenty-batch-replays-no-effects');
  await denied('process_subscription_lifecycle_batch',batchArgs(run,randomUUID(),0),'PT409','stale-index-denied');
  await denied('process_subscription_lifecycle_batch',batchArgs(run,randomUUID(),99),'PT409','future-index-denied');
  await denied('process_subscription_lifecycle_batch',batchArgs(run,request,0,1),'PT409','request-payload-rebind-denied');
  for(const limit of [0,51])await denied('process_subscription_lifecycle_batch',batchArgs(run,randomUUID(),1,limit),'22023','invalid-limit-'+limit);
  await complete(run,1);const done=await finish(run);assert.equal(done.status,'success');assert.equal(done.summary.to_grace_period,2);assert.equal(done.summary.to_suspended,1);assert.equal(done.summary.notifications_sent,3);mark('completed-all-phases-counts');
  assert.equal(await state(control.tenantId),'active');assert.equal(await state(today.tenantId),'trial');
  assert.equal((await db.query('SELECT status FROM public.staff_status WHERE id=$1',[activeStaff])).rows[0].status,'offline');
  assert.equal((await db.query('SELECT status FROM public.staff_status WHERE id=$1',[controlStaff])).rows[0].status,'busy');mark('tenant-allowlist-and-today-boundary');
  assert.deepEqual((await db.query('SELECT subscription_end_date::text,grace_period_ends_at::text FROM public.tenants WHERE id=$1',[t.tenantId])).rows[0],dates);mark('trial-dates-never-extended');
  before=await snapshot();assert.deepEqual(await batch(run,request,0),first);const finishedReplay=await finish(run);
  assert.deepEqual(finishedReplay.summary,done.summary);assert.equal(finishedReplay.status,done.status);await same(before,'terminal-receipt-replay-no-effects');
  await denied('process_subscription_lifecycle_batch',batchArgs(run,randomUUID(),99),'PT409','terminal-new-batch-denied');
  phase='atomic-rollback';const x=await owner('rollback-a'),y=await owner('rollback-b');await expired(x);await expired(y);
  const rollbackIds=[x.tenantId,y.tenantId].sort(),rollbackRun=randomUUID(),rollbackRequest=randomUUID();await begin(rollbackRun,rollbackIds);
  await db.query(`CREATE FUNCTION private.fixture_lifecycle_batch_error() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF EXISTS(SELECT 1 FROM private.subscription_lifecycle_commands WHERE id=NEW.command_id AND tenant_id=${q(rollbackIds[1])}::uuid) THEN RAISE EXCEPTION 'OWNED_BATCH_ROLLBACK'; END IF; RETURN NEW; END;$$; CREATE TRIGGER fixture_lifecycle_batch_error BEFORE INSERT ON private.subscription_lifecycle_notification_outbox FOR EACH ROW EXECUTE FUNCTION private.fixture_lifecycle_batch_error();`);
  try{before=await snapshot();const failed=await call('process_subscription_lifecycle_batch',batchArgs(rollbackRun,rollbackRequest,0));assert.equal(failed.data?.code,'P0001');await same(before,'second-transition-fault-rolls-back-whole-batch');}
  finally{await db.query('DROP TRIGGER fixture_lifecycle_batch_error ON private.subscription_lifecycle_notification_outbox; DROP FUNCTION private.fixture_lifecycle_batch_error();');}
  assert.equal((await batch(rollbackRun,rollbackRequest,0)).processed,2);await complete(rollbackRun,1);assert.equal((await finish(rollbackRun)).status,'success');mark('rolled-back-request-recovers-once');
  phase='row-lock-races';const late=await owner('late');await expired(late);const lateRun=randomUUID();await begin(lateRun,[late.tenantId]);
  const lateBefore=await snapshot(['public.tenants','private.subscription_lifecycle_commands','private.subscription_lifecycle_batch_receipts','private.subscription_lifecycle_notification_outbox']);
  assert.equal((await tenantRace(late,lateRun,0,{expire:true})).code,'PT409');await same(lateBefore,'deadline-lock-wait-no-business-effects',['public.tenants','private.subscription_lifecycle_commands','private.subscription_lifecycle_batch_receipts','private.subscription_lifecycle_notification_outbox']);
  const recovery={p_run_id:lateRun,p_request_id:randomUUID(),p_expected_deadline_at:(await db.query('SELECT deadline_at::text AS deadline FROM private.subscription_status_job_runs WHERE id=$1',[lateRun])).rows[0].deadline,
    p_reason:'Owned actual expired lifecycle recovery'};
  before=await snapshot();for(const [label,token]of [['anon',input.publishableKey],['owner',a.token],['staff',employee.token],['service',input.serviceKey]]){
    await denied('admin_recover_subscription_status_run',recovery,'42501','actual-recovery-denied-'+label,token);}
  await same(before,'actual-recovery-denials-no-effects');
  const recovered=await call('admin_recover_subscription_status_run',recovery,admin.token);
  assert.equal(recovered.status,200);assert.equal(recovered.data.released,true);assert.equal(recovered.data.replayed,false);
  const recoveredRow=(await db.query('SELECT actor_id,before_state,after_state FROM private.subscription_status_job_recoveries WHERE request_id=$1',[recovery.p_request_id])).rows[0];
  assert.equal(recoveredRow.actor_id,admin.id);assert.equal(recoveredRow.before_state.status,'running');assert.equal(recoveredRow.after_state.status,'failed');
  before=await snapshot();const recoveredReplay=await call('admin_recover_subscription_status_run',recovery,admin.token);
  assert.equal(recoveredReplay.status,200);assert.equal(recoveredReplay.data.replayed,true);await same(before,'actual-product-recovery-replay-no-effects');
  const newer=randomUUID();await begin(newer,[late.tenantId]);
  await denied('process_subscription_lifecycle_batch',batchArgs(lateRun,randomUUID(),0),'PT409','old-worker-cannot-write-after-recovery');await complete(newer);assert.equal((await finish(newer)).status,'success');mark('new-run-after-expiry-positive');
  const renewal=await owner('renewal');await expired(renewal);const renewalRun=randomUUID();await begin(renewalRun,[renewal.tenantId]);
  assert.ok((await tenantRace(renewal,renewalRun,0,{renew:true})).receipt);assert.equal(await state(renewal.tenantId),'active');
  assert.equal((await db.query('SELECT outcome FROM private.subscription_lifecycle_commands WHERE run_id=$1',[renewalRun])).rows[0].outcome,'not_eligible');
  await complete(renewalRun,1);assert.equal((await finish(renewalRun)).summary.notifications_sent,0);mark('renewal-rechecked-after-row-lock');
  const competing=await owner('competing');await expired(competing);const raceRun=randomUUID();await begin(raceRun,[competing.tenantId]);
  const contenders=await Promise.all([call('process_subscription_lifecycle_batch',batchArgs(raceRun,randomUUID(),0)),call('process_subscription_lifecycle_batch',batchArgs(raceRun,randomUUID(),0))]);
  assert.deepEqual(contenders.map(r=>r.status).sort(),[200,409]);assert.equal(await count('private.subscription_lifecycle_commands',raceRun),1);mark('two-workers-one-cursor-one-command');
  await complete(raceRun,1);await finish(raceRun);
  phase='actual-edge-and-response-loss';const actual=await owner('edge');await expired(actual);loseBatch=true;loseFinish=true;
  const outcome=await edge({scope:scope([actual.tenantId])},{'x-cron-secret':input.run+'-owned-cron-only'});
  assert.equal(outcome.status,200);assert.equal(outcome.data.success,true);assert.equal(lostBatch,true);assert.equal(lostFinish,true);
  assert.equal(await count('private.subscription_lifecycle_commands',outcome.data.run_id),1);
  const batchCalls=relayCalls.filter(c=>c.name==='process_subscription_lifecycle_batch');assert.equal(batchCalls[0].request,batchCalls[1].request);assert.equal(batchCalls[0].index,batchCalls[1].index);
  assert.equal(relayCalls.filter(c=>c.name==='finish_atomic_subscription_status_run').length,2);mark('actual-edge-replays-committed-batch-and-finish-response-loss');
  loseBatch=false;loseFinish=false;
  before=await snapshot();for(const body of [{},null,{scope:{kind:'tenants',tenant_ids:[]}},{scope:{kind:'cluster'},extra:1}]){
    assert.equal((await edge(body,{authorization:'Bearer '+input.serviceKey})).status,400);mark('actual-edge-invalid-scope-'+checks.length);}
  await same(before,'actual-edge-invalid-scope-no-effects');
  phase='cluster-batch-boundaries';
  // Global scan is confined to this owned DB. Only known fixtures are changed.
  await db.query('UPDATE public.tenants SET subscription_status=$2,subscription_end_date=current_date+90 WHERE id=ANY($1::uuid[])',[[...fixtures],'active']);
  const bulk=Array.from({length:105},()=>({tenant:randomUUID(),user:randomUUID()}));
  await db.query('BEGIN; INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,grace_period_ends_at) VALUES '+bulk.map(({tenant})=>`(${q(tenant)},'Owned global lifecycle',${q(tenant+'@roomqc.invalid')},'active',current_date-1,now()+interval '2 days')`).join(',')+'; INSERT INTO auth.users(id,email,email_confirmed_at) VALUES '+bulk.map(({user})=>`(${q(user)},${q(user+'@roomqc.invalid')},now())`).join(',')+'; INSERT INTO public.users(id,tenant_id,full_name,email,status,role,user_level_code) VALUES '+bulk.map(({tenant,user})=>`(${q(user)},${q(tenant)},'Owned global owner',${q(user+'@roomqc.invalid')},'active','owner','tenant_owner')`).join(',')+'; COMMIT;');
  const global=await edge({scope:{kind:'cluster'}},{authorization:'Bearer '+input.serviceKey});assert.equal(global.status,200);assert.equal(global.data.scope_complete,true);
  assert.equal(global.data.summary.to_grace_period,105);assert.equal(global.data.summary.notifications_sent,105);mark('actual-cluster-edge-crosses-105-transitions-and-deliveries');
  await same(financialBefore,'lifecycle-never-changes-financial-tables',finance);
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM pg_trigger WHERE tgname='fixture_lifecycle_batch_error'")).rows[0].n,0);
  process.stdout.write(JSON.stringify({verified:true,checks:checks.length,checkNames:checks,races,snapshotTables:tables.length,
    actualEdge:true,serviceSessionRequired:false,globalTransitions:105,committedResponseLoss:{batch:lostBatch,finish:lostFinish},
    schedulerEnabled:false,providerDelivery:false,actualProductRecovery:true,financialFixtureRows})+'\n');
}finally{await new Promise(resolve=>server.close(resolve));server.closeAllConnections();await db.end();}
