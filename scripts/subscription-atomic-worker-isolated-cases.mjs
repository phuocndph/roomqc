import assert from 'node:assert/strict';
import { createAtomicSubscriptionJobHandler } from '../supabase/functions/_shared/subscription-atomic-worker.ts';

// Imported by the template0 fixture harness. This module never connects to the
// main DB: every RPC is adapted to SET ROLE service_role in its generated DB.
export async function runAtomicWorkerChecks(ctx) {
  const {isolated,q,ok,parse,randomUUID,tenant,owner,state,count,denied,concurrent,race,financial,initialFinancial}=ctx;
  const beginSQL=(run,scope)=>`SELECT public.begin_atomic_subscription_status_run(${q(run)},${q(JSON.stringify(scope))}::jsonb);`;
  const batchSQL=(run,request,index,limit=2)=>`SELECT public.process_subscription_lifecycle_batch(${q(run)},${q(request)},${index},${limit});`;
  const finishSQL=(run,unknown=false)=>`SELECT public.finish_atomic_subscription_status_run(${q(run)},${unknown});`;
  const begin=(run,scope)=>parse(isolated(`SET ROLE service_role; ${beginSQL(run,scope)}`));
  const batch=(run,request,index,limit=2)=>parse(isolated(`SET ROLE service_role; ${batchSQL(run,request,index,limit)}`));
  const finish=(run,unknown=false)=>parse(isolated(`SET ROLE service_role; ${finishSQL(run,unknown)}`));
  const scope=ids=>({kind:'tenants',tenant_ids:ids.slice().sort()});
  const complete=run=>{let receipt,index=0;do {receipt=batch(run,randomUUID(),index++);} while(!receipt.done&&index<200);assert.equal(receipt.done,true);return receipt;};
  const forceClose=run=>isolated(`UPDATE private.subscription_status_job_runs SET status='failed',finished_at=clock_timestamp(),
    summary='{"subscription_status":"failed","staff_status":"not_run","to_grace_period":0,"to_suspended":0,
      "notifications_sent":0,"notifications_failed":0,"transition_outcome_unknown":false,"recovery_required":true,
      "error_codes":["JOB_EXECUTION_FAILED"]}'::jsonb WHERE id=${q(run)};`);
  const invalids=[null,{},[],{kind:'tenants',tenant_ids:[]},{kind:'cluster',tenant_ids:[]},
    {kind:'tenants',tenant_ids:[null]},{kind:'tenants',tenant_ids:['not-uuid']},{kind:'tenants',tenant_ids:[randomUUID()],extra:true}];
  const beforeRuns=count('private.subscription_status_job_runs');
  for(const invalid of invalids) denied(beginSQL(randomUUID(),invalid),'22023','SQL rejects missing/empty/ambiguous execution scope');
  const dup=randomUUID();denied(beginSQL(randomUUID(),scope([dup,dup])),'22023','Duplicate tenant IDs rejected');
  ok(count('private.subscription_status_job_runs')===beforeRuns,'Invalid scope never admits a global job');
  const control=tenant();const fixtureIds=Array.from({length:3},()=>tenant());fixtureIds.forEach(id=>owner(id));
  const staffId=randomUUID(),controlStaffId=randomUUID();
  isolated(`INSERT INTO public.staff_status(id,user_id,tenant_id,status,last_seen_at) VALUES
    (${q(staffId)},${q(randomUUID())},${q(fixtureIds[0])},'available',now()-interval '1 hour'),
    (${q(controlStaffId)},${q(randomUUID())},${q(control)},'available',now()-interval '1 hour');`);
  const run=randomUUID(),executionScope=scope(fixtureIds),admitted=begin(run,executionScope);
  ok(admitted.acquired&&isolated(`SELECT execution_protocol FROM private.subscription_status_job_runs WHERE id=${q(run)}`)==='atomic_v1',
    'Atomic protocol and canonical scope recorded in the admission transaction');
  denied(beginSQL(run,scope([control])),'PT409','Admission replay cannot change stored scope');
  const request=randomUUID(); const first=batch(run,request,0);
  ok(first.processed===2&&!first.done&&first.phase==='grace'&&first.to_grace_period===2,'Full bounded batch never claims phase/scope completion');
  const replay=(await concurrent(Array.from({length:20},()=>`SET ROLE service_role; ${batchSQL(run,request,0)}`))).map(parse);
  ok(replay.every(r=>JSON.stringify(r)===JSON.stringify(first))&&count('private.subscription_lifecycle_commands',`run_id=${q(run)}`)===2,
    '20 committed-lost-response batch replays return identical durable receipt with no extra commands');
  denied(batchSQL(run,randomUUID(),0),'PT409','New request cannot reuse stale batch cursor');
  denied(batchSQL(run,request,0,1),'PT409','Committed request cannot change its batch limit');
  for(const limit of [0,51])denied(batchSQL(run,randomUUID(),1,limit),'22023','Oversized or empty batch rejected');
  let index=first.batch_index,receipt=first;
  while(!receipt.done){receipt=batch(run,randomUUID(),index++);assert.ok(index<30);}
  const finished=finish(run);
  ok(finished.status==='success'&&finished.summary.to_grace_period===3&&finished.summary.notifications_sent===3,
    'Server derives completion/counts only after every phase is exhausted');
  ok(state(control)==='active'&&fixtureIds.every(id=>state(id)==='grace_period')
    &&isolated(`SELECT status FROM public.staff_status WHERE id=${q(staffId)}`)==='offline'
    &&isolated(`SELECT status FROM public.staff_status WHERE id=${q(controlStaffId)}`)==='available',
    'Tenant allowlist fences transitions, outbox and staff maintenance without broad fallback');
  ok(JSON.stringify(batch(run,request,0))===JSON.stringify(first),'Batch receipt remains replayable after completed run');
  denied(batchSQL(run,randomUUID(),index),'PT409','Terminal run refuses new batches');
  ok(finish(run).status==='success','Lost completion response has durable replay');
  const unknownRun=randomUUID();begin(unknownRun,scope([control]));complete(unknownRun);
  const unknownResult=finish(unknownRun,true);
  ok(unknownResult.status==='interrupted'&&unknownResult.summary.staff_status==='success',
    'Lost batch response after durable staff completion preserves actual staff evidence');forceClose(unknownRun);
  const incompleteRun=randomUUID();begin(incompleteRun,scope([control]));batch(incompleteRun,randomUUID(),0);
  ok(finish(incompleteRun).status==='failed','Finishing after just one batch records failure rather than scope success');
  const legacy=randomUUID();isolated(`SELECT public.begin_subscription_status_run(${q(legacy)});`);
  ok(begin(legacy,{kind:'cluster'}).acquired===false
    &&isolated(`SELECT execution_protocol FROM private.subscription_status_job_runs WHERE id=${q(legacy)}`)==='legacy',
    'An existing legacy run can never be upgraded to recoverable atomic protocol');
  denied(batchSQL(legacy,randomUUID(),0),'PT409','Legacy admission cannot invoke atomic batches');forceClose(legacy);
  const rollbackIds=[tenant(),tenant()].sort(),rollbackRun=randomUUID(),rollbackRequest=randomUUID();
  begin(rollbackRun,scope(rollbackIds));
  isolated(`CREATE FUNCTION private.fixture_batch_error() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
    IF EXISTS(SELECT 1 FROM private.subscription_lifecycle_commands WHERE id=NEW.command_id AND tenant_id=${q(rollbackIds[1])}::uuid)
      THEN RAISE EXCEPTION 'FIXTURE_BATCH_ERROR'; END IF; RETURN NEW; END;$$;
    CREATE TRIGGER fixture_batch_error BEFORE INSERT ON private.subscription_lifecycle_notification_outbox
      FOR EACH ROW EXECUTE FUNCTION private.fixture_batch_error();`);
  denied(batchSQL(rollbackRun,rollbackRequest,0),'P0001','Failure in second command rejects whole bounded batch');
  ok(rollbackIds.every(id=>state(id)==='active')&&count('private.subscription_lifecycle_commands',`run_id=${q(rollbackRun)}`)===0
    &&count('private.subscription_lifecycle_batch_receipts',`run_id=${q(rollbackRun)}`)===0
    &&isolated(`SELECT batch_index FROM private.subscription_lifecycle_progress WHERE run_id=${q(rollbackRun)}`)==='0',
    'Batch rollback restores first transition, outbox, cursor and receipt atomically');
  isolated('DROP TRIGGER fixture_batch_error ON private.subscription_lifecycle_notification_outbox;');
  ok(batch(rollbackRun,rollbackRequest,0).processed===2,'Rolled-back batch safely reuses original request ID');
  finish(rollbackRun);
  const expiry=randomUUID(),expiryTenant=tenant();begin(expiry,scope([expiryTenant]));
  isolated(`UPDATE private.subscription_status_job_runs SET started_at=statement_timestamp()-interval '16 minutes',
    deadline_at=statement_timestamp()-interval '1 minute' WHERE id=${q(expiry)};`);
  denied(batchSQL(expiry,randomUUID(),0),'PT409','Overdue run cannot mutate tenant/outbox/staff');
  ok(state(expiryTenant)==='active','Deadline rejection leaves tenant unchanged');forceClose(expiry);
  const late=randomUUID(),lateTenant=tenant();begin(late,scope([lateTenant]));
  isolated(`UPDATE private.subscription_status_job_runs SET started_at=statement_timestamp()-interval '14 minutes 58 seconds',
    deadline_at=statement_timestamp()+interval '2 seconds' WHERE id=${q(late)};`);
  await race(`SELECT id FROM public.tenants WHERE id=${q(lateTenant)} FOR UPDATE`,batchSQL(late,randomUUID(),0),
    'roomqc-atomic-batch-deadline',{expectError:'JOB_RUN_NOT_ACTIVE',beforeRelease:async()=>{
      for(let n=0;n<50;n++){if(isolated(`SELECT deadline_at<clock_timestamp() FROM private.subscription_status_job_runs WHERE id=${q(late)}`)==='t')return;
        await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture deadline did not expire');}});
  ok(state(lateTenant)==='active'&&count('private.subscription_lifecycle_batch_receipts',`run_id=${q(late)}`)===0,
    'Deadline during a row-lock wait rolls back entire batch and receipt');forceClose(late);
  const deliveryTenant=tenant(),deliveryRun=randomUUID();owner(deliveryTenant);begin(deliveryRun,scope([deliveryTenant]));
  let deliveryReceipt=batch(deliveryRun,randomUUID(),0),deliveryIndex=1;
  while(deliveryReceipt.phase!=='delivery')deliveryReceipt=batch(deliveryRun,randomUUID(),deliveryIndex++);
  isolated(`UPDATE private.subscription_status_job_runs SET started_at=statement_timestamp()-interval '14 minutes 58 seconds',
    deadline_at=statement_timestamp()+interval '2 seconds' WHERE id=${q(deliveryRun)};`);
  await race(`SELECT id FROM public.tenants WHERE id=${q(deliveryTenant)} FOR UPDATE`,batchSQL(deliveryRun,randomUUID(),deliveryIndex),
    'roomqc-atomic-delivery-deadline',{expectError:'ATOMIC_JOB_RUN_NOT_ACTIVE',beforeRelease:async()=>{
      for(let n=0;n<50;n++){if(isolated(`SELECT deadline_at<clock_timestamp() FROM private.subscription_status_job_runs WHERE id=${q(deliveryRun)}`)==='t')return;
        await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture deadline did not expire');}});
  ok(count('public.in_app_notifications',`tenant_id=${q(deliveryTenant)}`)===0
    &&isolated(`SELECT o.status||':'||o.attempts FROM private.subscription_lifecycle_notification_outbox o
      JOIN private.subscription_lifecycle_commands c ON c.id=o.command_id WHERE c.tenant_id=${q(deliveryTenant)}`)==='pending:0',
    'Delivery waiting past run deadline rolls back notification INSERT and outbox acknowledgement');forceClose(deliveryRun);
  const staffTenant=tenant('active','current_date+30'),staffRun=randomUUID(),lateStaffId=randomUUID();
  isolated(`INSERT INTO public.staff_status(id,user_id,tenant_id,status,last_seen_at) VALUES
    (${q(lateStaffId)},${q(randomUUID())},${q(staffTenant)},'busy',now()-interval '2 hours');`);
  begin(staffRun,scope([staffTenant]));let staffReceipt=batch(staffRun,randomUUID(),0),staffIndex=1;
  while(staffReceipt.phase!=='staff')staffReceipt=batch(staffRun,randomUUID(),staffIndex++);
  isolated(`UPDATE private.subscription_status_job_runs SET started_at=statement_timestamp()-interval '14 minutes 58 seconds',
    deadline_at=statement_timestamp()+interval '2 seconds' WHERE id=${q(staffRun)};`);
  await race(`SELECT id FROM public.staff_status WHERE id=${q(lateStaffId)} FOR UPDATE`,batchSQL(staffRun,randomUUID(),staffIndex),
    'roomqc-atomic-staff-deadline',{expectError:'ATOMIC_JOB_RUN_NOT_ACTIVE',beforeRelease:async()=>{
      for(let n=0;n<50;n++){if(isolated(`SELECT deadline_at<clock_timestamp() FROM private.subscription_status_job_runs WHERE id=${q(staffRun)}`)==='t')return;
        await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture deadline did not expire');}});
  ok(isolated(`SELECT status FROM public.staff_status WHERE id=${q(lateStaffId)}`)==='busy',
    'Staff maintenance cannot mutate a row after a lock wait crosses the run deadline');forceClose(staffRun);
  for(const role of ['anon','authenticated'])for(const signature of ['begin_atomic_subscription_status_run(uuid,jsonb)',
    'process_subscription_lifecycle_batch(uuid,uuid,integer,integer)','finish_atomic_subscription_status_run(uuid,boolean)'])
    ok(isolated(`SELECT NOT has_function_privilege(${q(role)},${q('public.'+signature)},'EXECUTE')`)==='t',`${role} cannot invoke privileged ${signature}`);
  for(const signature of ['begin_subscription_status_run(uuid)','finish_subscription_status_run(uuid,jsonb)',
    'auto_offline_inactive_staff()','process_expired_subscriptions()'])
    ok(isolated(`SELECT NOT has_function_privilege('service_role',${q('public.'+signature)},'EXECUTE')`)==='t',`Service cannot bypass worker fences through ${signature}`);
  denied('SELECT public.process_expired_subscriptions();','0A000','Obsolete alternate lifecycle policy fails closed even for postgres');
  for(const table of ['subscription_lifecycle_progress','subscription_lifecycle_batch_receipts'])for(const role of ['anon','authenticated','service_role'])
    ok(isolated(`SELECT NOT has_table_privilege(${q(role)},${q('private.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`)==='t',`${role} cannot alter durable ${table}`);

  let lostBatch=false,lostFinish=false; const calls=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    const sql=name==='begin_atomic_subscription_status_run'?beginSQL(args.p_run_id,args.p_scope)
      :name==='process_subscription_lifecycle_batch'?batchSQL(args.p_run_id,args.p_request_id,args.p_expected_batch_index,args.p_limit)
      :name==='finish_atomic_subscription_status_run'?finishSQL(args.p_run_id,args.p_outcome_unknown):assert.fail('No direct mutable RPC permitted');
    const data=parse(isolated(`SET ROLE service_role; ${sql}`));
    if(name==='process_subscription_lifecycle_batch'&&!lostBatch){lostBatch=true;return{data:null,error:{message:'Simulated response loss after actual DB commit'}};}
    if(name==='finish_atomic_subscription_status_run'&&!lostFinish){lostFinish=true;return{data:null,error:{message:'Simulated completion response loss after actual commit'}};}
    return{data,error:null};
  };
  const handler=createAtomicSubscriptionJobHandler({authorize:()=>null,configured:()=>true,rpc,uuid:randomUUID,
    monotonicNow:()=>0,log:()=>{throw new Error('Logging must not change completed outcome');}});
  const post=body=>handler(new Request('http://fixture.invalid/worker',{method:'POST',body:JSON.stringify(body)}));
  const callsBefore=calls.length;
  for(const body of [{},null,{scope:{kind:'tenants',tenant_ids:[]}},{scope:{kind:'cluster'},extra:1}])
    assert.equal((await post(body)).status,400);
  ok(calls.length===callsBefore,'Actual handler rejects implicit/empty scope before any database invocation');
  const httpTenant=tenant();owner(httpTenant);const response=await post({scope:scope([httpTenant])}),httpResult=await response.json();
  ok(response.status===200&&httpResult.success&&httpResult.scope==='tenants'&&state(httpTenant)==='grace_period',
    'Actual worker handler executes atomic SQL batches and confirms scoped completion');
  const batchCalls=calls.filter(c=>c.name==='process_subscription_lifecycle_batch');
  ok(batchCalls[0].args.p_request_id===batchCalls[1].args.p_request_id
    &&batchCalls[0].args.p_expected_batch_index===batchCalls[1].args.p_expected_batch_index
    &&count('private.subscription_lifecycle_commands',`run_id=${q(httpResult.run_id)}`)===1,
    'Actual worker safely replays a batch whose committed response was lost');
  ok(calls.filter(c=>c.name==='finish_atomic_subscription_status_run').length===2,
    'Actual worker retries lost finish response without repeating lifecycle changes');
  const missingOwner=tenant();const pendingResponse=await post({scope:scope([missingOwner])}),pending=await pendingResponse.json();
  ok(pendingResponse.status===500&&pending.summary.notifications_failed===1&&state(missingOwner)==='grace_period',
    'Missing owner persists outbox and failed delivery evidence rather than claiming success');
  owner(missingOwner);isolated(`UPDATE private.subscription_lifecycle_notification_outbox SET available_at=clock_timestamp()-interval '1 second'
    WHERE command_id IN(SELECT id FROM private.subscription_lifecycle_commands WHERE tenant_id=${q(missingOwner)});`);
  const retryResponse=await post({scope:scope([missingOwner])}),retry=await retryResponse.json();
  ok(retryResponse.status===200&&retry.summary.to_grace_period===0&&retry.summary.notifications_sent===1,
    'A later actual worker run drains old pending outbox without any new state transition');
  const bounded=createAtomicSubscriptionJobHandler({authorize:()=>null,configured:()=>true,rpc,uuid:randomUUID,
    monotonicNow:(()=>{let time=0;return()=>{time+=60000;return time;};})(),log:()=>{}});
  const boundedResponse=await bounded(new Request('http://fixture.invalid/worker',{method:'POST',body:JSON.stringify({scope:scope([missingOwner])})}));
  ok(boundedResponse.status===500&&!(await boundedResponse.json()).success,'Invocation runtime bound cannot produce false full-scope success');
  // Global completion test remains confined to this generated fixture DB.
  const all=Array.from({length:105},()=>({id:randomUUID(),user:randomUUID()}));
  isolated(`INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,grace_period_ends_at) VALUES
    ${all.map(({id})=>`(${q(id)},'Global batch fixture',${q(id+'@example.invalid')},'active',current_date-1,now()+interval '2 days')`).join(',')};
    INSERT INTO auth.users(id,email) VALUES ${all.map(({user})=>`(${q(user)},${q(user+'@example.invalid')})`).join(',')};
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role,user_level_code) VALUES
    ${all.map(({id,user})=>`(${q(user)},${q(id)},'Batch owner',${q(user+'@example.invalid')},'active','owner','tenant_owner')`).join(',')};`);
  // Other deliberately ownerless fixtures would intentionally fail delivery;
  // exclude only those fixture messages from this throughput-success assertion.
  const originalFinancialControl=parse(financial()).control.id;
  isolated(`UPDATE public.tenants SET subscription_status='active',subscription_end_date=current_date+90
    WHERE id<>${q(originalFinancialControl)} AND id NOT IN(${all.map(({id})=>q(id)).join(',')});`);
  const clusterResponse=await post({scope:{kind:'cluster'}}),cluster=await clusterResponse.json();
  ok(clusterResponse.status===200&&cluster.scope==='cluster'&&cluster.scope_complete
    &&cluster.summary.to_grace_period===105&&cluster.summary.notifications_sent===105,
    'Actual cluster worker crosses 50-row boundaries and only reports success after all 105 transitions/deliveries');
  ok(financial()===initialFinancial,'Atomic worker leaves invoice/payment financial fixture unchanged');
}
