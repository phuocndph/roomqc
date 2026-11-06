// UTC day substitution is limited to exact-owned disposable function bodies.
// It changes neither the host clock nor any deployable clock configuration.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import {createAdvicePolicyFixture} from '/control/testing/advice-policy-fixture.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_UTC_INPUT??'null');assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:6,
 statement_timeout:25000,connectionTimeoutMillis:5000,application_name:'owned-advice-utc-'+input.run});
const day0='2040-01-01',day1='2040-01-02',day2='2040-01-03',checks=[],barriers=[],findings=[];
let stage='accounts',originals=[],restored=false,aclFixture,clockExpressionsReplaced=[];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const record=(label,passed,details={})=>checks.push({label:'advice-utc-'+label,passed,actualNative:true,...details});
async function call(path,token,body){const response=await fetch('http://127.0.0.1:8000'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 let data;try{data=await response.json()}catch{data=null}return{status:response.status,data};}
const rpc=(name,a,args)=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function owner(label){const email='utc-'+input.run+'-'+label+'@roomqc.invalid',password=createHmac('sha256',input.serviceKey).update(email).digest('hex');
 const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
 const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
 const a={id:created.data.id,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};
 const p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,p_fields:{
  fullName:'Owned UTC checks',phone:'0901234567',tenantName:'Owned UTC checks',hotelName:'Owned UTC checks',hotelAddress:'123 Fixture Road',
  hotelPhone:'0281234567',hotelEmail:email,totalRooms:5}});assert.equal(p.status,200);assert.equal(p.data.success,true);
 return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
const scope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
const prepare=(a,id,extra={})=>rpc('prepare_operations_advice',a,{p_command_id:id,...scope(a),...extra});
const dispatch=(a,id)=>rpc('dispatch_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_session_id:a.sessionId});
const lookup=(a,id)=>rpc('get_operations_advice_command',a,{p_command_id:id});
const advice=Array.from({length:3},(_,i)=>({title:'UTC '+i,description:'Owned scoped result.',action:'Review recorded evidence.',priority:'medium'}));
const finish=(a,id,nonce,body=advice)=>rpc('finish_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_dispatch_token:nonce,p_advice:body});
const policyFixture=createAdvicePolicyFixture({db,input,call,rpc});
async function policy(a,count=1,budget=5){const response=await policyFixture.configure({p_tenant_id:a.tenantId,p_enabled:true,
 p_daily_limit:count,p_daily_budget_units:budget,p_units_per_request:5,p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned UTC fixture'});assert.equal(response.status,200);}
const setDay=value=>db.query('UPDATE private.roomqc_owned_advice_utc_clock SET day=$1::date',[value]);
const journal=(a,id)=>db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,id]).then(r=>r.rows[0]?.value);
const snapshot=async a=>{const commands=(await db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE tenant_id=$1 ORDER BY actor_id,command_id',[a.tenantId])).rows;
 const audits=(await db.query("SELECT to_jsonb(l) AS value FROM public.activity_logs l WHERE tenant_id=$1 AND entity_type='operations_advice' ORDER BY id",[a.tenantId])).rows;
 return hash({commands,audits});};
async function held(a,id,kind,run,changeDay=day1,minWaiters=1){
 const holder=await db.connect();let tasks=[];try{
  await holder.query('BEGIN');const pid=Number((await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id);
  if(kind==='policy')await holder.query('SELECT tenant_id FROM private.operations_advice_policy WHERE tenant_id=$1 FOR UPDATE',[a.tenantId]);
  else if(kind==='command')await holder.query('SELECT command_id FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2 FOR UPDATE',[a.id,id]);
  else if(kind==='advisory')await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['operations-advice:'+a.id+':'+id]);
  else if(kind==='source')await holder.query('LOCK TABLE public.rooms IN ACCESS EXCLUSIVE MODE');
  else if(kind==='audit')await holder.query('LOCK TABLE public.activity_logs IN ACCESS EXCLUSIVE MODE');
  else throw new Error('OWNED_UTC_LOCK_INVALID');
  tasks=Array.from({length:minWaiters},(_,i)=>run(i));const until=Date.now()+5000;let waiters=0;
  while(Date.now()<until){const q=await db.query(`WITH RECURSIVE blocked(pid) AS(
    SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'
    UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.wait_event_type='Lock')
    SELECT count(DISTINCT pid)::int AS n FROM blocked`,[pid]);
   waiters=q.rows[0].n;if(waiters>=minWaiters)break;await new Promise(r=>setTimeout(r,20));}
  if(waiters<minWaiters)throw Object.assign(new Error('OWNED_UTC_LOCK_WAITER_REQUIRED'),{code:'UTC_LOCK_WAITERS'});
  await setDay(changeDay);barriers.push({stage,kind,observedLockWaiters:waiters,clockInjected:true,actualUtcMidnight:false});
  await holder.query('COMMIT');return await Promise.all(tasks);
 }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();await Promise.allSettled(tasks);}
}
async function completed(a,id){assert.equal((await prepare(a,id)).data.state,'reserved');const d=await dispatch(a,id);assert.equal(d.data.state,'dispatch');
 assert.equal((await finish(a,id,d.data.dispatch_token)).data.state,'completed');}
try{
 // Substitute only the quota-day expression, not session/deadline/expiry clocks.
 const signatures=['private.request_operations_advice(text,uuid,date,date,uuid,text)','public.dispatch_operations_advice(uuid,uuid,uuid)'];
 originals=(await db.query('SELECT pg_get_functiondef(s::regprocedure) AS definition FROM unnest($1::text[]) WITH ORDINALITY q(s,n) ORDER BY n',[signatures])).rows.map(r=>r.definition);
 await db.query(`CREATE TABLE private.roomqc_owned_advice_utc_clock(day date NOT NULL);
  INSERT INTO private.roomqc_owned_advice_utc_clock VALUES(date '2040-01-01');
  CREATE FUNCTION private.roomqc_owned_advice_quota_day() RETURNS date LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
    SELECT day FROM private.roomqc_owned_advice_utc_clock;$f$;
  REVOKE ALL ON TABLE private.roomqc_owned_advice_utc_clock FROM PUBLIC,anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION private.roomqc_owned_advice_quota_day() FROM PUBLIC,anon,authenticated,service_role;`);
 for(const definition of originals){const expression="(clock_timestamp() AT TIME ZONE 'UTC')::date",count=definition.split(expression).length-1;
  assert.ok(count>=2&&count<=7);clockExpressionsReplaced.push(count);await db.query(definition.replaceAll(expression,'private.roomqc_owned_advice_quota_day()'));}
 record('quota-clock-substitution-only',clockExpressionsReplaced.length===2,{clockInjected:true,actualUtcMidnight:false});
 for(const [kind,count,budget]of [['policy',1,100],['advisory',2,5],['source',1,100],['audit',2,5]]){
  stage='prepare-'+kind;const a=await owner(stage);await policy(a,count,budget);await setDay(day1);await completed(a,randomUUID());
  await setDay(day0);const id=randomUUID(),before=await snapshot(a);
  const [response]=await held(a,id,kind,()=>prepare(a,id));const stored=await journal(a,id),unchanged=await snapshot(a)===before;
  const denied=[409,429].includes(response.status)&&['PT409','PT429'].includes(response.data?.code);
  record('prepare-'+kind+'-crossing-does-not-commit-old-day',denied&&unchanged&&!stored,
   {status:response.status,sqlstate:response.data?.code??null,journalAndAuditUnchanged:unchanged,clockInjected:true,actualUtcMidnight:false});
  if(!denied||!unchanged)findings.push({stage,status:response.status,expected:'409-or429-and-no-mutation',actualQuotaDay:stored?.quota_day??null,expectedCurrentQuotaDay:day1,journalAndAuditUnchanged:unchanged});
  await policy(a,3,100);const positive=await prepare(a,randomUUID());
  record('prepare-'+kind+'-restored-current-day-positive',positive.status===200&&(await db.query('SELECT quota_day::text AS day FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2',[a.id,positive.data.command_id])).rows[0]?.day===day1);
 }
 for(const [kind,count,budget,occupied]of [['policy',1,100,true],['command',2,5,true],['command',1,5,false]]){
  stage='dispatch-'+kind+(occupied?'-full':'-free');const a=await owner(stage);await policy(a,count,budget);await setDay(day0);const id=randomUUID();assert.equal((await prepare(a,id)).status,200);
  if(occupied){await setDay(day1);await completed(a,randomUUID());}
  await setDay(day0);const before=await snapshot(a),[response]=await held(a,id,kind,()=>dispatch(a,id));
  if(occupied){record(stage+'-denied-without-charge',response.status===429&&response.data?.code==='PT429'&&await snapshot(a)===before,
    {status:response.status,clockInjected:true,actualUtcMidnight:false});
   await setDay(day2);const recovered=await dispatch(a,id);record(stage+'-same-key-positive-on-free-day',recovered.data.state==='dispatch'&&(await journal(a,id)).quota_day===day2);
  }else{const stored=await journal(a,id);record(stage+'-rebinds-after-wait',response.data.state==='dispatch'&&stored.quota_day===day1&&stored.units===5,
    {status:response.status,clockInjected:true,actualUtcMidnight:false});
   const stable=await snapshot(a);await setDay(day2);const replay=await dispatch(a,id);
   record(stage+'-replay-never-rebinds-or-dispatches-again',replay.data.state==='unknown'&&!replay.data.dispatch_token&&await snapshot(a)===stable);}
 }
 stage='dispatch-audit';{const a=await owner(stage);await policy(a);await setDay(day0);const id=randomUUID();await prepare(a,id);const before=await snapshot(a);
  const [response]=await held(a,id,'audit',()=>dispatch(a,id));record('dispatch-audit-crossing-rolls-back-nonce-charge-audit',response.status===409&&response.data?.message==='ADVICE_DAY_CHANGED'&&await snapshot(a)===before,
   {status:response.status,clockInjected:true,actualUtcMidnight:false});
  const same=await dispatch(a,id);record('dispatch-audit-same-key-recovery-rebinds-current-day',same.data.state==='dispatch'&&(await journal(a,id)).quota_day===day1);}
 stage='two-old-reservations-one-new-slot';{const a=await owner('race');await policy(a,2,10);await setDay(day0);const ids=[randomUUID(),randomUUID()];
  for(const id of ids)assert.equal((await prepare(a,id)).status,200);await setDay(day1);await completed(a,randomUUID());
  const responses=await held(a,ids[0],'policy',i=>dispatch(a,ids[i]),day1,2);
  record('two-old-reservations-one-new-day-slot',responses.filter(r=>r.data.state==='dispatch').length===1&&responses.filter(r=>r.status===429).length===1);
  const usage=await db.query("SELECT quota_day::text AS day,count(*)::int AS n,sum(units)::int AS units FROM private.operations_advice_commands WHERE tenant_id=$1 AND state<>'cancelled' GROUP BY quota_day ORDER BY quota_day",[a.tenantId]);
  record('concurrent-migration-to-new-day-retains-exact-ledger',JSON.stringify(usage.rows)===JSON.stringify([{day:day0,n:1,units:5},{day:day1,n:2,units:10}]));}
 stage='terminal-old-days';{const a=await owner('terminal');await policy(a,5,25);await setDay(day0);const done=randomUUID(),closed=randomUUID(),cancelled=randomUUID();
  await completed(a,done);await prepare(a,closed);const d=await dispatch(a,closed);await finish(a,closed,d.data.dispatch_token,null);
  await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[a.id,closed]);
  assert.equal((await rpc('close_operations_advice',a,{p_command_id:closed,...scope(a)})).data.state,'closed_unknown');
  await rpc('cancel_operations_advice',a,{p_command_id:cancelled,...scope(a)});await setDay(day1);const fresh=randomUUID();assert.equal((await prepare(a,fresh)).status,200);
  const before=await snapshot(a);const receipt=await lookup(a,closed),old=await dispatch(a,done),c=await prepare(a,cancelled);
  record('old-terminal-replays-retain-their-original-days',receipt.data.state==='closed_unknown'&&old.data.state==='completed'&&c.data.state==='cancelled'&&await snapshot(a)===before);
  const usage=(await db.query("SELECT quota_day::text AS day,count(*)::int AS n,sum(units)::int AS units FROM private.operations_advice_commands WHERE tenant_id=$1 AND state<>'cancelled' GROUP BY quota_day ORDER BY quota_day",[a.tenantId])).rows;
  record('old-closed-charge-remains-on-old-day-with-new-day-independent',JSON.stringify(usage)===JSON.stringify([{day:day0,n:2,units:10},{day:day1,n:1,units:5}]));}
 stage='finish-after-day-change';{const a=await owner('finish');await policy(a);await setDay(day0);const id=randomUUID();await prepare(a,id);
  const dispatched=await dispatch(a,id);assert.equal(dispatched.data.state,'dispatch');await setDay(day1);
  const completed=await finish(a,id,dispatched.data.dispatch_token);record('completion-on-new-day-keeps-original-dispatch-charge',completed.data.state==='completed'&&(await journal(a,id)).quota_day===day0);
  const fresh=await prepare(a,randomUUID()),before=await snapshot(a);await setDay(day2);const replay=await finish(a,id,dispatched.data.dispatch_token);
  record('new-day-has-independent-quota-and-old-completion-replay-is-stable',fresh.data.state==='reserved'&&replay.data.state==='completed'&&await snapshot(a)===before);}
 stage='expired-reservation';{const a=await owner('expired');await policy(a);await setDay(day0);const id=randomUUID();await prepare(a,id);
  await db.query("UPDATE private.operations_advice_commands SET reserved_until=clock_timestamp()-interval '1 second' WHERE actor_id=$1 AND command_id=$2",[a.id,id]);
  await setDay(day1);const r=await dispatch(a,id),stored=await journal(a,id);record('expired-old-reservation-cancels-without-new-day-charge',r.data.state==='cancelled'&&stored.quota_day===day0&&!stored.dispatch_token);
  record('expired-old-reservation-does-not-block-new-day',(await prepare(a,randomUUID())).data.state==='reserved');}
 stage='recognition-timezone';{const a=await owner('timezone');aclFixture={id:a.id,sessionId:a.sessionId};await policy(a);await setDay(day1);const id=randomUUID();
  const first=await prepare(a,id,{p_timezone:'Pacific/Kiritimati'}),second=await prepare(a,randomUUID(),{p_timezone:'Etc/GMT+12'});
  record('recognition-timezone-cannot-reset-quota-day',first.status===200&&second.status===429&&(await journal(a,id)).quota_day===day1);}
}catch(error){record('harness-completed',false,{failureCode:/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'OWNED_UTC_ASSERTION'});}
finally{
 try{for(const definition of originals)await db.query(definition);
  await db.query('DROP FUNCTION IF EXISTS private.roomqc_owned_advice_quota_day(); DROP TABLE IF EXISTS private.roomqc_owned_advice_utc_clock;');
  restored=originals.length===2;record('original-function-definitions-restored',restored);
 }catch{record('original-function-definitions-restored',false);}
 await db.end();
}
const verified=checks.every(c=>c.passed)&&restored;
process.stdout.write(JSON.stringify({verified,stage,checks,barriers,findings,clockExpressionsReplaced,
 utcClockMode:'fixture-expression-substitution',hostClockChanged:false,actualUtcMidnight:false,originalDefinitionsRestored:restored,
 externalProviderCalls:0,...(verified?{aclFixture}:{failureCode:'NATIVE_ADVICE_UTC_ASSERTION'})}));
if(!verified)process.exitCode=1;
