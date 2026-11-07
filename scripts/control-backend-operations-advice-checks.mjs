// Native Auth/REST + exact-owned PostgreSQL. No external AI provider is called.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import pg from '/control/node_modules/pg/lib/index.js';
import {createAdvicePolicyFixture} from '/control/testing/advice-policy-fixture.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_WORKFLOW_INPUT??'null');assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,max:6,statement_timeout:25000,connectionTimeoutMillis:5000});
const checks=[],races=[];let stage='accounts';
const record=(label,passed,details={})=>{checks.push({label:'advice-'+label,passed,actualNative:true,...details});assert.equal(passed,true,label)};
async function call(url,token,body,method='POST'){
 const r=await fetch('http://127.0.0.1:8000'+url,{method,signal:AbortSignal.timeout(35000),headers:{apikey:input.publishableKey,
  authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};}
const rpc=(name,a,args={})=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function owner(label){const email='advice-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
 const create=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(create.status,200);
 const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
 const a={id:create.data.id,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};
 const p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,
  p_fields:{fullName:'Owned advice fixture',phone:'0901234567',tenantName:'Owned advice fixture',hotelName:'Owned advice fixture',
  hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:email,totalRooms:5}});
 assert.equal(p.status,200);assert.equal(p.data.success,true);return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
const scope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
const prepare=(a,id,extra={})=>rpc('prepare_operations_advice',a,{p_command_id:id,...scope(a),...extra});
const lookup=(a,id)=>rpc('get_operations_advice_command',a,{p_command_id:id});
const cancel=(a,id)=>rpc('cancel_operations_advice',a,{p_command_id:id,...scope(a)});
const close=(a,id,extra={})=>rpc('close_operations_advice',a,{p_command_id:id,...scope(a),...extra});
const dispatch=(a,id)=>rpc('dispatch_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_session_id:a.sessionId});
const advice=Array.from({length:3},(_,i)=>({title:'Kiểm tra '+i,description:'Đối soát số liệu.',action:'Kiểm tra chứng từ.',priority:'medium'}));
const finish=(a,id,token,body=advice)=>rpc('finish_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_dispatch_token:token,p_advice:body});
const policyFixture=createAdvicePolicyFixture({db,input,call,rpc});
const policy=(a,extra={})=>policyFixture.configure({p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:100,
 p_daily_budget_units:1000,p_units_per_request:5,p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned local advice checks',...extra});
const denied=r=>r.status===403&&r.data?.code==='42501';
try{
 const a=await owner('owner'),b=await owner('foreign'),c=await owner('quota');
 record('real-auth-verified-owner-provisioning',Boolean(a.sessionId&&b.sessionId&&c.sessionId));stage='authority';
 record('entitlement-default-denied',denied(await prepare(a,randomUUID())));
 const cfg=await policy(a);assert.equal(cfg.status,200);record('live-operator-configures-versioned-policy',cfg.data.version===1&&cfg.data.enabled===true);
 await policy(b);await policy(c,{p_daily_limit:1,p_daily_budget_units:5});
 record('browser-cannot-configure-policy',denied(await rpc('configure_operations_advice_policy',a,{p_tenant_id:a.tenantId,p_enabled:true,
  p_daily_limit:100,p_daily_budget_units:1000,p_units_per_request:5,p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Invalid browser operation'})));
 record('foreign-hotel-denied',denied(await prepare(a,randomUUID(),{p_hotel_id:b.hotelId})));
 record('machine-cannot-prepare-as-owner',denied(await rpc('prepare_operations_advice',input.serviceKey,{p_command_id:randomUUID(),...scope(a)})));
 const id=randomUUID(),p=await prepare(a,id);assert.equal(p.status,200);
 record('prepare-server-snapshot-and-safe-receipt',p.data.state==='reserved'&&/^[a-f0-9]{64}$/.test(p.data.context_hash)&&!('context'in p.data)&&!('dispatch_token'in p.data));
 const again=await prepare(a,id);record('prepare-replay-preserves-receipt',JSON.stringify(again.data)===JSON.stringify(p.data));
 const conflict=await prepare(a,id,{p_start_date:'2026-10-02'});record('same-key-payload-conflict',conflict.status===409);
 const foreign=await lookup(b,id);record('foreign-actor-cannot-lookup-command',foreign.status===200&&foreign.data.state==='not_found');
 record('browser-cannot-dispatch',denied(await rpc('dispatch_operations_advice',a,{p_actor_id:a.id,p_command_id:id,p_session_id:a.sessionId})));
 const claim=await dispatch(a,id);assert.equal(claim.status,200);
 record('service-dispatch-once-with-deadline',claim.data.state==='dispatch'&&Boolean(claim.data.dispatch_token)&&Date.parse(claim.data.deadline)>Date.now());
 const report=await rpc('get_operations_report_scoped',a,scope(a));assert.equal(report.status,200);
 record('source-equals-authoritative-scoped-report',isDeepStrictEqual(claim.data.context.current,report.data.current)
  &&isDeepStrictEqual(claim.data.context.previous,report.data.previous)&&isDeepStrictEqual(claim.data.context.year_ago,report.data.year_ago));
 const labor=await rpc('get_labor_cost_scoped',a,{...scope(a)});assert.equal(labor.status,200);
 record('source-labor-is-total-estimate-only',claim.data.context.labor_estimate===labor.data.total_labor_cost&&claim.data.context.labor_is_estimate===true
  &&!('laborByDepartment'in claim.data.context)&&!('by_department'in claim.data.context));
 const replayClaim=await dispatch(a,id);record('dispatch-replay-does-not-release-second-nonce',replayClaim.data.state==='unknown'&&!('dispatch_token'in replayClaim.data));
 record('cannot-cancel-inflight-charge',(await cancel(a,id)).data.state==='unknown');
 record('wrong-finish-nonce-denied',denied(await finish(a,id,randomUUID())));
 const invalid=await finish(a,id,claim.data.dispatch_token,[]);record('invalid-result-not-committed',invalid.status===400&&(await lookup(a,id)).data.state==='unknown');
 const done=await finish(a,id,claim.data.dispatch_token);assert.equal(done.status,200);
 record('result-completed-with-advice',done.data.state==='completed'&&isDeepStrictEqual(done.data.advice,advice));
 record('finish-replay-stable',JSON.stringify((await finish(a,id,claim.data.dispatch_token)).data)===JSON.stringify(done.data));
 const changed=structuredClone(advice);changed[0].title='Different result';record('result-conflict-denied',(await finish(a,id,claim.data.dispatch_token,changed)).status===409);
 const count=await db.query('SELECT count(*)::int AS n,sum(units)::int AS units FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2',[a.id,id]);
 record('one-journal-one-charge',count.rows[0].n===1&&count.rows[0].units===5);
 stage='terminal-and-live-fences';const cancelledId=randomUUID();await prepare(a,cancelledId);
 record('reserved-can-cancel',(await cancel(a,cancelledId)).data.state==='cancelled');
 record('late-prepare-fenced-by-cancellation',(await prepare(a,cancelledId)).data.state==='cancelled');
 const tombstone=randomUUID();record('cancel-before-prepare-terminal',(await cancel(a,tombstone)).data.state==='cancelled'&&(await prepare(a,tombstone)).data.state==='cancelled');
 const unknownId=randomUUID();await prepare(a,unknownId);const unknownClaim=await dispatch(a,unknownId);assert.equal(unknownClaim.status,200);
 await finish(a,unknownId,unknownClaim.data.dispatch_token,null);
 record('unknown-outcome-keeps-charge',(await lookup(a,unknownId)).data.state==='unknown'&&(await dispatch(a,unknownId)).data.state==='unknown');
 const expiryId=randomUUID();await prepare(a,expiryId);
 await db.query("UPDATE private.operations_advice_commands SET reserved_until=clock_timestamp()-interval '1 second' WHERE actor_id=$1 AND command_id=$2",[a.id,expiryId]);
 record('expired-reservation-terminally-cancelled',(await dispatch(a,expiryId)).data.state==='cancelled');
 const versionId=randomUUID();await prepare(a,versionId);await policy(a);
 record('policy-change-fences-old-reservation',(await dispatch(a,versionId)).data.state==='cancelled');
 const lockedId=randomUUID();await prepare(a,lockedId);await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
 record('live-profile-lock-denies-dispatch',denied(await dispatch(a,lockedId)));
 await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);const lockedClaim=await dispatch(a,lockedId);assert.equal(lockedClaim.data.state,'dispatch');
 await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);record('live-profile-lock-denies-completion',denied(await finish(a,lockedId,lockedClaim.data.dispatch_token)));
 await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);record('restored-positive-finishes-same-dispatch',(await finish(a,lockedId,lockedClaim.data.dispatch_token)).data.state==='completed');
 await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
 record('live-session-expiry-denies-receipt',denied(await lookup(a,id)));await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);
 record('restored-session-reads-original-result',(await lookup(a,id)).data.state==='completed');
 const lateId=randomUUID();await prepare(a,lateId);const late=await dispatch(a,lateId);
 await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 second' WHERE actor_id=$1 AND command_id=$2",[a.id,lateId]);
 record('late-output-does-not-complete',(await finish(a,lateId,late.data.dispatch_token)).status===409&&(await lookup(a,lateId)).data.state==='unknown');
 stage='unknown-closure';
 const journal=id=>db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,id]).then(r=>r.rows[0]?.value);
 const closureAudit=id=>db.query("SELECT count(*)::int AS n FROM public.activity_logs WHERE entity_type='operations_advice' AND entity_id=$1 AND new_values->>'state'='closed_unknown'",[id]).then(r=>r.rows[0].n);
 const closable=async()=>{const key=randomUUID();assert.equal((await prepare(a,key)).status,200);const claimed=await dispatch(a,key);assert.equal(claimed.data.state,'dispatch');
   await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[a.id,key]);return{key,nonce:claimed.data.dispatch_token}};
 const noClose=randomUUID();const missing=await close(a,noClose);
 record('close-missing-does-not-create-tombstone',missing.status===409&&!await journal(noClose));
 const beforeReserved=await journal(lockedId);
 record('close-completed-keeps-original-result',(await close(a,id)).data.state==='completed'&&await closureAudit(id)===0);
 record('close-cancelled-keeps-original-result',(await close(a,cancelledId)).data.state==='cancelled'&&await closureAudit(cancelledId)===0);
 record('close-nonunknown-does-not-mutate-original',isDeepStrictEqual(await journal(lockedId),beforeReserved));
 const reservedClose=randomUUID();await prepare(a,reservedClose);const reservedSnapshot=await journal(reservedClose);
 record('close-reserved-denied-without-cancel',(await close(a,reservedClose)).status===409&&isDeepStrictEqual(await journal(reservedClose),reservedSnapshot));
 const youngId=randomUUID();await prepare(a,youngId);await dispatch(a,youngId);const youngSnapshot=await journal(youngId);
 record('close-before-deadline-denied',(await close(a,youngId)).data.message==='ADVICE_STILL_RUNNING'&&isDeepStrictEqual(await journal(youngId),youngSnapshot));
 record('server-advertises-not-closable-before-deadline',(await lookup(a,youngId)).data.can_close===false);
 const target=await closable(),retained=await journal(target.key);
 record('expired-dispatch-server-advertises-closable',(await lookup(a,target.key)).data.can_close===true);
 record('foreign-actor-cannot-close-original',(await close(b,target.key)).status===409&&isDeepStrictEqual(await journal(target.key),retained));
 record('close-wrong-scope-conflicts',(await close(a,target.key,{p_start_date:'2026-10-02'})).status===409&&isDeepStrictEqual(await journal(target.key),retained));
 record('service-cannot-close-on-behalf-of-user',denied(await close(input.serviceKey,target.key,scope(a))));
 const anonymousClose=await close(input.publishableKey,target.key,scope(a));
 record('anonymous-cannot-close',[401,403].includes(anonymousClose.status)&&anonymousClose.data.code==='42501'&&isDeepStrictEqual(await journal(target.key),retained),
   {status:anonymousClose.status,sqlstate:anonymousClose.data.code});
 const holderClose=await db.connect();let closers=[],closureWaiters=0;
 try{await holderClose.query('BEGIN');const pid=Number((await holderClose.query('SELECT pg_backend_pid() AS id')).rows[0].id);
   await holderClose.query('SELECT command_id FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2 FOR UPDATE',[a.id,target.key]);
   closers=[close(a,target.key),close(a,target.key)];const until=Date.now()+5000;
   while(Date.now()<until){const q=await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid]);
     closureWaiters=q.rows[0].n;if(closureWaiters>=1)break;await new Promise(r=>setTimeout(r,20))}
   assert.ok(closureWaiters>=1);await holderClose.query('COMMIT');
 }finally{await holderClose.query('ROLLBACK').catch(()=>{});holderClose.release()}
 const closureResults=await Promise.all(closers),terminal=closureResults[0].data;
 record('two-closers-same-terminal-receipt',closureResults.every(r=>r.status===200&&isDeepStrictEqual(r.data,terminal))&&terminal.state==='closed_unknown');
 record('concurrent-close-exactly-one-audit',await closureAudit(target.key)===1);
 races.push({name:'held-command-close',observedLockWaiters:closureWaiters,requests:2,terminalReceipts:closureResults.filter(r=>r.data.state==='closed_unknown').length});
 const storedClosed=await journal(target.key);
 record('closure-retains-unknown-charge-context-dispatch',storedClosed.units===5&&!!storedClosed.closed_at
   &&isDeepStrictEqual(storedClosed,{...retained,state:'unknown',closed_at:storedClosed.closed_at,closed_by:a.id}));
 for(const [label,run]of [['lookup',()=>lookup(a,target.key)],['prepare',()=>prepare(a,target.key)],['cancel',()=>cancel(a,target.key)],['dispatch',()=>dispatch(a,target.key)],['close',()=>close(a,target.key)]]){
   record('closed-key-'+label+'-stays-terminal',(await run()).data.state==='closed_unknown'&&await closureAudit(target.key)===1)}
 record('late-provider-output-cannot-overwrite-closure',(await finish(a,target.key,target.nonce)).status===409&&isDeepStrictEqual(await journal(target.key),storedClosed));
 record('machine-observation-keeps-closure',(await finish(a,target.key,target.nonce,null)).data.state==='closed_unknown'&&isDeepStrictEqual(await journal(target.key),storedClosed));
 const auditTarget=await closable(),auditBefore=await journal(auditTarget.key);
 try{
   await db.query(`CREATE FUNCTION private.roomqc_owned_closure_audit_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
     BEGIN IF NEW.entity_type='operations_advice' AND NEW.new_values->>'state'='closed_unknown' THEN
       RAISE EXCEPTION 'OWNED_CLOSURE_AUDIT_FAULT' USING ERRCODE='P0001'; END IF; RETURN NEW; END $f$;
     CREATE TRIGGER roomqc_owned_closure_audit_fault BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION private.roomqc_owned_closure_audit_fault();`);
   record('closure-audit-fault-rolls-back-metadata',(await close(a,auditTarget.key)).status>=400&&isDeepStrictEqual(await journal(auditTarget.key),auditBefore)&&await closureAudit(auditTarget.key)===0);
 }finally{await db.query('DROP TRIGGER IF EXISTS roomqc_owned_closure_audit_fault ON public.activity_logs; DROP FUNCTION IF EXISTS private.roomqc_owned_closure_audit_fault()')}
 record('closure-positive-after-audit-restored',(await close(a,auditTarget.key)).data.state==='closed_unknown'&&await closureAudit(auditTarget.key)===1);
 for(const clock of ['trial','session','policy']){
   stage='close-'+clock+'-audit-clock';const test=await closable(),before=await journal(test.key);
   const saved=clock==='trial'?(await db.query('SELECT trial_ends_at AS value FROM public.tenants WHERE id=$1',[a.tenantId])).rows[0].value:
     clock==='session'?(await db.query('SELECT not_after AS value FROM auth.sessions WHERE id=$1',[a.sessionId])).rows[0].value:
     (await db.query('SELECT valid_until AS value FROM private.operations_advice_policy WHERE tenant_id=$1',[a.tenantId])).rows[0].value;
   const table=clock==='trial'?'public.tenants':clock==='session'?'auth.sessions':'private.operations_advice_policy',
     column=clock==='trial'?'trial_ends_at':clock==='session'?'not_after':'valid_until',idColumn=clock==='policy'?'tenant_id':'id',key=clock==='session'?a.sessionId:a.tenantId;
   await db.query('UPDATE '+table+' SET '+column+"=clock_timestamp()+interval '3 seconds' WHERE "+idColumn+'=$1',[key]);
   const holder=await db.connect();let task,waiting=0;
   try{await holder.query('BEGIN');const pid=Number((await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id);
     await holder.query('LOCK TABLE public.activity_logs IN ACCESS EXCLUSIVE MODE');task=close(a,test.key);const until=Date.now()+2000;
     while(Date.now()<until){const q=await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid]);waiting=q.rows[0].n;
       if(waiting>=1)break;await new Promise(r=>setTimeout(r,20))}
     assert.ok(waiting>=1);await db.query('SELECT pg_sleep(3.5)');
     const expired=(await db.query('SELECT '+column+'<=clock_timestamp() AS yes FROM '+table+' WHERE '+idColumn+'=$1',[key])).rows[0].yes;assert.equal(expired,true);
     await holder.query('COMMIT');const response=await task;
     record('closure-'+clock+'-expiry-after-audit-wait-denied',denied(response)&&isDeepStrictEqual(await journal(test.key),before)&&await closureAudit(test.key)===0,{observedLockWaiters:waiting,realClock:true});
   }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();if(task)await task.catch(()=>{});await db.query('UPDATE '+table+' SET '+column+'=$2 WHERE '+idColumn+'=$1',[key,saved])}
   record('closure-'+clock+'-restored-positive',(await close(a,test.key)).data.state==='closed_unknown');
 }
 stage='quota-race';const holder=await db.connect();let tasks=[],waiting=0;
 try{
  await holder.query('BEGIN');await holder.query('SELECT tenant_id FROM private.operations_advice_policy WHERE tenant_id=$1 FOR UPDATE',[c.tenantId]);
  tasks=Array.from({length:4},()=>prepare(c,randomUUID()));
  const until=Date.now()+12000;while(Date.now()<until){const r=await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%prepare_operations_advice%'");
   waiting=r.rows[0].n;if(waiting>=2)break;await new Promise(resolve=>setTimeout(resolve,30));}
  assert.ok(waiting>=2,'At least two real REST transactions must be observed waiting on the held policy');
  await holder.query('COMMIT');
 }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release()}
 const results=await Promise.all(tasks),accepted=results.filter(r=>r.status===200),deniedQuota=results.filter(r=>r.status===429);
 record('four-concurrent-reservations-one-quota-slot',accepted.length===1&&deniedQuota.length===3);
 races.push({name:'held-policy-quota',observedLockWaiters:waiting,requests:4,accepted:accepted.length,denied:deniedQuota.length});
 const quotaId=accepted[0].data.command_id;record('quota-replay-does-not-spend-more',(await prepare(c,quotaId)).data.state==='reserved');
 const usage=await db.query('SELECT count(*)::int AS n,sum(units)::int AS units FROM private.operations_advice_commands WHERE tenant_id=$1',[c.tenantId]);
 record('quota-ledger-exact-after-race',usage.rows[0].n===1&&usage.rows[0].units===5);
 await cancel(c,quotaId);const chargedKey=randomUUID(),released=await prepare(c,chargedKey);
 record('undispatched-cancel-releases-reservation',released.status===200);
 stage='closed-unknown-quota';const chargedClaim=await dispatch(c,chargedKey);assert.equal(chargedClaim.data.state,'dispatch');
 await finish(c,chargedKey,chargedClaim.data.dispatch_token,null);
 await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[c.id,chargedKey]);
 const chargedJournal=()=>db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[c.id,chargedKey]).then(r=>r.rows[0].value);
 const chargedBefore=await chargedJournal(),chargedClosed=await close(c,chargedKey),chargedAfter=await chargedJournal();
 record('closure-at-exhausted-quota-remains-available',chargedClosed.status===200&&chargedClosed.data.state==='closed_unknown');
 record('closure-at-exhausted-quota-retains-original-charge',chargedAfter.units===5&&!!chargedAfter.closed_at
   &&isDeepStrictEqual(chargedAfter,{...chargedBefore,closed_at:chargedAfter.closed_at,closed_by:c.id}));
 const blockedKey=randomUUID(),blocked=await prepare(c,blockedKey);
 record('closure-does-not-refund-exhausted-quota',blocked.status===429
   &&Number((await db.query('SELECT count(*) AS n FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2',[c.id,blockedKey])).rows[0].n)===0);
 await policy(c,{p_daily_limit:100,p_daily_budget_units:5});
 record('closed-unknown-still-consumes-daily-unit-budget',(await prepare(c,randomUUID())).status===429);
 await policy(c,{p_daily_limit:1,p_daily_budget_units:100});
 record('closed-unknown-still-consumes-daily-request-limit',(await prepare(c,randomUUID())).status===429);
 record('exhausted-quota-original-key-replay-remains-terminal',(await prepare(c,chargedKey)).data.state==='closed_unknown'
   &&isDeepStrictEqual(await chargedJournal(),chargedAfter)&&await closureAudit(chargedKey)===1);
 await policy(c,{p_daily_limit:2,p_daily_budget_units:10});const freshKey=randomUUID(),fresh=await prepare(c,freshKey);
 const chargedUsage=await db.query("SELECT count(*)::int AS n,sum(units)::int AS units FROM private.operations_advice_commands WHERE tenant_id=$1 AND state<>'cancelled'",[c.tenantId]);
 record('explicit-new-key-charged-separately-after-quota-increase',fresh.status===200&&fresh.data.state==='reserved'
   &&chargedUsage.rows[0].n===2&&chargedUsage.rows[0].units===10&&isDeepStrictEqual(await chargedJournal(),chargedAfter));
 const audits=await db.query("SELECT count(*)::int AS n FROM public.activity_logs WHERE tenant_id=$1 AND entity_type='operations_advice'",[a.tenantId]);
 record('state-transitions-have-safe-audit',audits.rows[0].n>=10);
 const result={verified:true,checks,races,externalProviderCalls:0,aclFixture:{id:a.id,sessionId:a.sessionId}};
 process.stdout.write(JSON.stringify(result));
}catch(error){process.stdout.write(JSON.stringify({verified:false,stage,checks,races,failureCode:/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'NATIVE_ADVICE_ASSERTION'}));process.exitCode=1}
finally{await db.end()}
