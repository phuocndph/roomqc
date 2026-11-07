// Pre-fix API baseline. Only exact-owned disposable fixtures; no provider I/O.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_POLICY_INPUT??'null');assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:6,
 statement_timeout:25000,connectionTimeoutMillis:5000,application_name:'owned-advice-policy-baseline-'+input.run});
const checks=[],findings=[],barriers=[];let stage='accounts',aclFixture;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const record=(label,passed,details={})=>{checks.push({label:'advice-policy-baseline-'+label,passed,actualNative:true,...details});
 if(!passed)findings.push({label,...details});};
async function call(path,token,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};}
const rpc=(name,a,args={})=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function owner(label){const email='policy-baseline-'+input.run+'-'+label+'@roomqc.invalid',password=createHmac('sha256',input.serviceKey).update(email).digest('hex');
 const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
 const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
 const a={id:created.data.id,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};
 const p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,p_fields:{
  fullName:'Owned policy baseline',phone:'0901234567',tenantName:'Owned policy baseline',hotelName:'Owned policy baseline',hotelAddress:'123 Fixture Road',
  hotelPhone:'0281234567',hotelEmail:email,totalRooms:5}});assert.equal(p.status,200);assert.equal(p.data.success,true);
 return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
const payload=(a,extra={})=>({p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:100,p_daily_budget_units:1000,p_units_per_request:5,
 p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned policy baseline checks',...extra});
const legacy=(a,fields=payload(a),actor=input.serviceKey)=>rpc('configure_operations_advice_policy',actor,fields);
const snapshot=async a=>(await db.query(`SELECT jsonb_build_object('policy',(SELECT to_jsonb(p) FROM private.operations_advice_policy p WHERE tenant_id=$1),
 'audits',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.activity_logs l WHERE tenant_id=$1 AND entity_type='operations_advice_policy')) AS value`,[a.tenantId])).rows[0].value;
const audits=s=>s.audits?.length??0;
const denied=r=>[401,403].includes(r.status)&&r.data?.code==='42501';
async function held(kind,tenant,tasksFactory,whileHeld){
 const holder=await db.connect();let tasks=[],waiters=0;
 try{await holder.query('BEGIN');const pid=Number((await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id);
  if(kind==='audit')await holder.query('LOCK TABLE public.activity_logs IN ACCESS EXCLUSIVE MODE');
  else await holder.query('SELECT tenant_id FROM private.operations_advice_policy WHERE tenant_id=$1 FOR UPDATE',[tenant]);
  tasks=tasksFactory();const until=Date.now()+5000;
  while(Date.now()<until){const q=await db.query(`WITH RECURSIVE blocked(pid) AS(
   SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'
   UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.wait_event_type='Lock')
   SELECT count(DISTINCT pid)::int AS n FROM blocked`,[pid]);waiters=q.rows[0].n;
   if(waiters>=tasks.length)break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(waiters>=tasks.length,'OWNED_POLICY_BASELINE_WAITER_REQUIRED');
  barriers.push({stage,kind,observedLockWaiters:waiters,requests:tasks.length});
  if(whileHeld)await whileHeld();await holder.query('COMMIT');return await Promise.all(tasks);
 }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();await Promise.allSettled(tasks);}
}
try{
 const a=await owner('owner'),op=await owner('operator'),repeat=await owner('repeat'),race=await owner('race'),expiry=await owner('expiry');aclFixture={id:a.id,sessionId:a.sessionId};
 await db.query("UPDATE public.users SET role='super_admin',user_level_code='super_admin',is_super_admin=true,is_primary_owner=false WHERE id=$1",[op.id]);
 await db.query("DELETE FROM public.user_roles WHERE user_id=$1;",[op.id]);
 await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[op.id]);
 record('real-auth-owner-and-live-platform-operator',Boolean(a.sessionId&&op.sessionId)&&(await rpc('platform_support_actor',op)).data===op.id);
 const protectedState=async()=>hash((await db.query(`SELECT jsonb_build_object(
  'tenants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tenants t),
  'profiles',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u),
  'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.operations_advice_commands c)) AS value`)).rows[0].value);
 const protectedBefore=await protectedState();
 stage='existing-boundaries';const before=await snapshot(a);
 const prepare=await rpc('prepare_operations_advice',a,{p_command_id:randomUUID(),p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
 record('missing-policy-is-disabled',denied(prepare)&&before.policy===null);
 const ownerDenied=await legacy(a,payload(a),a);
 record('tenant-owner-cannot-configure-legacy-policy',denied(ownerDenied)&&isDeepStrictEqual(await snapshot(a),before));
 const invalid=await legacy(a,payload(a,{p_units_per_request:1001}));
 record('invalid-budget-rejected-without-effects',invalid.status===400&&isDeepStrictEqual(await snapshot(a),before));
 stage='service-without-live-actor';const machine=await legacy(a);
 record('service-key-alone-cannot-set-customer-entitlement',denied(machine)&&isDeepStrictEqual(await snapshot(a),before),
  {status:machine.status,expectedStatus:403,policyCreated:(await snapshot(a)).policy!==null,liveOperatorPresented:false});
 stage='new-contracts';
 const read=await rpc('get_operations_advice_policy',op,{p_tenant_id:a.tenantId});
 record('live-operator-can-read-policy-contract',read.status===200,{status:read.status,expectedStatus:200,code:read.data?.code??null});
 const commandId=randomUUID(),desired={enabled:false,daily_limit:100,daily_budget_units:1000,units_per_request:5,
  valid_until:new Date(Date.now()+3600000).toISOString(),reason:'Owned stable policy command'};
 const write=await rpc('set_operations_advice_policy',op,{p_tenant_id:a.tenantId,p_command_id:commandId,p_expected_version:0,p_policy:desired});
 record('live-operator-has-versioned-command-contract',write.status===200,{status:write.status,expectedStatus:200,code:write.data?.code??null});
 const lookup=await rpc('get_operations_advice_policy_command',op,{p_tenant_id:a.tenantId,p_command_id:commandId});
 record('live-operator-can-recover-command-contract',lookup.status===200,{status:lookup.status,expectedStatus:200,code:lookup.data?.code??null});
 stage='legacy-repeated-payload';const repeated=payload(repeat);const repeatedResults=[];
 for(let i=0;i<20;i++)repeatedResults.push(await legacy(repeat,repeated));
 assert.ok(repeatedResults.every(r=>r.status===200));const afterRepeat=await snapshot(repeat);
 record('identical-legacy-payload-does-not-create-twenty-versions-and-audits',Number(afterRepeat.policy.version)===1&&audits(afterRepeat)===1,
  {requests:20,expectedVersionIncrements:1,actualVersion:Number(afterRepeat.policy.version),expectedAudits:1,actualAudits:audits(afterRepeat),legacyAcceptsCommandId:false});
 stage='legacy-concurrent-edit';assert.equal((await legacy(race)).status,200);const raceBefore=await snapshot(race);
 const racing=await held('policy',race.tenantId,()=>[legacy(race,payload(race,{p_daily_limit:101,p_reason:'First stale legacy editor'})),
  legacy(race,payload(race,{p_daily_limit:102,p_reason:'Second stale legacy editor'}))]);
 const raceAfter=await snapshot(race),statuses=racing.map(r=>r.status).sort((a,b)=>a-b);
 record('legacy-cannot-silently-overwrite-two-stale-editor-reads',statuses[0]===200&&statuses[1]===409,
  {statuses,expectedStatuses:[200,409],baseVersion:Number(raceBefore.policy.version),actualVersion:Number(raceAfter.policy.version),
   auditDelta:audits(raceAfter)-audits(raceBefore),legacyAcceptsExpectedVersion:false});
 stage='audit-rollback';const beforeFault=await snapshot(a);let fault;
 try{
  await db.query(`CREATE FUNCTION private.roomqc_owned_policy_baseline_audit_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
   BEGIN IF NEW.entity_type='operations_advice_policy' THEN RAISE EXCEPTION 'OWNED_POLICY_AUDIT_FAULT' USING ERRCODE='P0001';END IF;RETURN NEW;END;$f$;
   CREATE TRIGGER roomqc_owned_policy_baseline_audit_fault BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION private.roomqc_owned_policy_baseline_audit_fault();`);
  fault=await legacy(a,payload(a,{p_daily_limit:2}));
 }finally{await db.query('DROP TRIGGER IF EXISTS roomqc_owned_policy_baseline_audit_fault ON public.activity_logs;DROP FUNCTION IF EXISTS private.roomqc_owned_policy_baseline_audit_fault()')}
 record('existing-audit-fault-rolls-back-policy',fault.status>=400&&isDeepStrictEqual(await snapshot(a),beforeFault));
 stage='expiry-after-audit-wait';const expiryBefore=await snapshot(expiry),started=Date.now();
 const expiryPayload=payload(expiry,{p_valid_until:new Date(Date.now()+3000).toISOString()});
 const [expired]=await held('audit',expiry.tenantId,()=>[legacy(expiry,expiryPayload)],async()=>{
  await db.query('SELECT pg_sleep(3.5)');assert.equal((await db.query('SELECT $1::timestamptz<=clock_timestamp() AS yes',[expiryPayload.p_valid_until])).rows[0].yes,true);
 });
 const expiryAfter=await snapshot(expiry);
 record('policy-expiring-during-audit-wait-does-not-commit',expired.status>=400&&isDeepStrictEqual(expiryAfter,expiryBefore),
  {status:expired.status,expectedStatusClass:'4xx',elapsedMs:Date.now()-started,realClock:true,hostClockChanged:false,
   expiredPolicyPersisted:expiryAfter.policy!==null&&Date.parse(expiryAfter.policy.valid_until)<=Date.now(),auditDelta:audits(expiryAfter)-audits(expiryBefore)});
 record('legacy-positive-after-clock-window-restored',(await legacy(expiry)).status===200);
 record('tenant-trial-profile-and-advice-journal-preserved',await protectedState()===protectedBefore);
 stage='terminal';const verified=checks.every(c=>c.passed);
 process.stdout.write(JSON.stringify({verified,stage,checks,findings,barriers,legacyRequestsHaveNoCommandOrExpectedVersion:true,
  newContractsImplemented:false,externalProviderCalls:0,hostClockChanged:false,productAccepted:false,aclFixture}));
 process.exitCode=verified?0:1;
}catch(error){process.stdout.write(JSON.stringify({verified:false,stage,checks,findings,barriers,
 failureCode:/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'ADVICE_POLICY_BASELINE_HARNESS_ASSERTION',externalProviderCalls:0}));process.exitCode=1}
finally{await db.end()}
